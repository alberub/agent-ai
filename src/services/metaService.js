const {
  metaAccessToken,
  metaPhoneNumberId,
} = require("../config/env");

async function sendWhatsAppTextMessage(to, body) {
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
        to,
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
