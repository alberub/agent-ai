const express = require("express");
const { metaVerifyToken } = require("../config/env");
const { runCustomerAgent } = require("../agent/openaiAgent");
const { sendWhatsAppTextMessage } = require("../services/metaService");

const router = express.Router();
const pendingBySender = new Map();
const MESSAGE_BATCH_WINDOW_MS = 1800;

function collectTextMessages(changes) {
  const collected = [];

  for (const change of changes) {
    const messages = change.value?.messages || [];

    for (const incomingMessage of messages) {
      if (incomingMessage.type !== "text") {
        continue;
      }

      const from = incomingMessage.from;
      const text = (incomingMessage.text?.body || "").trim();

      if (!from || !text) {
        continue;
      }

      collected.push({ from, text });
    }
  }

  return collected;
}

async function flushSenderQueue(from) {
  const pending = pendingBySender.get(from);

  if (!pending) {
    return;
  }

  pendingBySender.delete(from);

  const text = pending.parts.join("\n");

  console.log(
    "Procesando mensaje agrupado desde:",
    from,
    "fragmentos:",
    pending.parts.length,
    "texto:",
    text
  );

  try {
    const reply = await runCustomerAgent({
      from,
      message: text,
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
  }
}

function enqueueIncomingMessage(from, text) {
  const existing = pendingBySender.get(from);

  if (existing) {
    clearTimeout(existing.timer);
    existing.parts.push(text);
    existing.timer = setTimeout(() => {
      flushSenderQueue(from).catch((error) => {
        console.error("Error vaciando cola de mensajes:", error);
      });
    }, MESSAGE_BATCH_WINDOW_MS);
    return;
  }

  const timer = setTimeout(() => {
    flushSenderQueue(from).catch((error) => {
      console.error("Error vaciando cola de mensajes:", error);
    });
  }, MESSAGE_BATCH_WINDOW_MS);

  pendingBySender.set(from, {
    parts: [text],
    timer,
  });
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
  const textMessages = collectTextMessages(changes);

  console.log("Webhook recibido. Cambios:", changes.length);

  for (const incomingMessage of textMessages) {
    console.log(
      "Mensaje recibido para cola desde:",
      incomingMessage.from,
      "texto:",
      incomingMessage.text
    );
    enqueueIncomingMessage(incomingMessage.from, incomingMessage.text);
  }
});

module.exports = router;
