const express = require("express");
const { metaVerifyToken } = require("../config/env");
const { runCustomerAgent } = require("../agent/openaiAgent");
const { sendWhatsAppTextMessage } = require("../services/metaService");

const router = express.Router();

const conversations = new Map();
const BUFFER_WINDOW_MS = 4000;

function collectTextMessages(changes) {
  const messages = [];

  for (const change of changes) {
    const incomingMessages = change.value?.messages || [];

    for (const incomingMessage of incomingMessages) {
      if (incomingMessage.type !== "text") {
        continue;
      }

      const from = incomingMessage.from;
      const text = (incomingMessage.text?.body || "").trim();

      if (!from || !text) {
        continue;
      }

      messages.push({ from, text });
    }
  }

  return messages;
}

function getConversation(from) {
  if (!conversations.has(from)) {
    conversations.set(from, {
      status: "idle",
      buffer: [],
      queuedWhileProcessing: [],
      timer: null,
      dueAt: null,
    });
  }

  return conversations.get(from);
}

function clearConversationTimer(conversation) {
  if (!conversation.timer) {
    return;
  }

  clearTimeout(conversation.timer);
  conversation.timer = null;
}

function scheduleFlush(from, delayMs) {
  const conversation = getConversation(from);

  clearConversationTimer(conversation);

  conversation.timer = setTimeout(() => {
    flushConversation(from).catch((error) => {
      console.error("Error procesando cola de conversacion:", error);
    });
  }, delayMs);
}

function enqueueBufferedMessage(from, text) {
  const conversation = getConversation(from);

  conversation.buffer.push(text);
  conversation.status = "buffering";
  conversation.dueAt = Date.now() + BUFFER_WINDOW_MS;

  scheduleFlush(from, BUFFER_WINDOW_MS);
}

function enqueueWhileProcessing(from, text) {
  const conversation = getConversation(from);

  conversation.queuedWhileProcessing.push(text);
  conversation.dueAt = Date.now() + BUFFER_WINDOW_MS;
}

async function flushConversation(from) {
  const conversation = getConversation(from);

  if (conversation.status === "processing") {
    return;
  }

  if (conversation.buffer.length === 0) {
    conversation.status = "idle";
    conversation.dueAt = null;
    clearConversationTimer(conversation);
    return;
  }

  clearConversationTimer(conversation);
  conversation.status = "processing";

  const parts = [...conversation.buffer];
  conversation.buffer = [];
  const message = parts.join("\n");

  console.log(
    "Procesando mensaje agrupado desde:",
    from,
    "fragmentos:",
    parts.length,
    "texto:",
    message
  );

  try {
    const reply = await runCustomerAgent({
      from,
      message,
    });

    console.log("Respuesta generada para:", from, "respuesta:", reply);
    await sendWhatsAppTextMessage(from, reply);
  } catch (error) {
    console.error("Error procesando mensaje:", error);

    try {
      await sendWhatsAppTextMessage(
        from,
        "No pude procesar tu solicitud en este momento. Intenta nuevamente en unos minutos."
      );
    } catch (sendError) {
      console.error("Error enviando mensaje de fallo:", sendError);
    }
  } finally {
    if (conversation.queuedWhileProcessing.length > 0) {
      const nextBatch = [...conversation.queuedWhileProcessing];
      conversation.queuedWhileProcessing = [];
      conversation.buffer = nextBatch;
      conversation.status = "buffering";

      const remainingDelay = Math.max(
        200,
        (conversation.dueAt || Date.now()) - Date.now()
      );

      scheduleFlush(from, remainingDelay);
      return;
    }

    conversation.status = "idle";
    conversation.dueAt = null;
  }
}

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === metaVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const changes = req.body?.entry?.flatMap((entry) => entry.changes || []) || [];
  const messages = collectTextMessages(changes);

  console.log("Webhook recibido. Cambios:", changes.length);

  for (const incomingMessage of messages) {
    const conversation = getConversation(incomingMessage.from);

    console.log(
      "Mensaje recibido desde:",
      incomingMessage.from,
      "estado:",
      conversation.status,
      "texto:",
      incomingMessage.text
    );

    if (conversation.status === "processing") {
      enqueueWhileProcessing(incomingMessage.from, incomingMessage.text);
      continue;
    }

    enqueueBufferedMessage(incomingMessage.from, incomingMessage.text);
  }
});

module.exports = router;
