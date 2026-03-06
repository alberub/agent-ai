const express = require("express");
const { metaVerifyToken } = require("../config/env");
const { runCustomerAgent } = require("../agent/openaiAgent");
const { sendWhatsAppTextMessage } = require("../services/metaService");

const router = express.Router();

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

  console.log("Webhook recibido. Cambios:", changes.length);

  for (const change of changes) {
    const messages = change.value?.messages || [];

    for (const incomingMessage of messages) {
      if (incomingMessage.type !== "text") {
        continue;
      }

      const from = incomingMessage.from;
      const text = incomingMessage.text?.body || "";

      console.log("Mensaje entrante desde:", from, "texto:", text);

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
  }
});

module.exports = router;
