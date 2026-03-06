const {
  metaAccessToken,
  metaPhoneNumberId,
} = require("../config/env");
const { normalizeWhatsAppRecipient } = require("../utils/phone");

async function sendWhatsAppTextMessage(to, body) {
  const recipient = normalizeWhatsAppRecipient(to);

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        text: { body },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al enviar mensaje a Meta: ${errorText}`);
  }

  return response.json();
}

module.exports = {
  sendWhatsAppTextMessage,
};
