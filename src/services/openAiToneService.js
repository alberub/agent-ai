const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");

const client = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

function extractNumericTokens(text) {
  return String(text || "").match(/\d[\d,.:/-]*/g) || [];
}

function preservesNumericData(baseReply, polishedReply) {
  const baseTokens = extractNumericTokens(baseReply);
  const polishedTokens = extractNumericTokens(polishedReply);

  return baseTokens.every((token) => polishedTokens.includes(token));
}

async function polishWhatsAppReply({ customerMessage, baseReply }) {
  if (!client || !baseReply) {
    return baseReply;
  }

  try {
    const completion = await client.chat.completions.create({
      model: openAiModel,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de WhatsApp para consultas de credito. Reescribe una respuesta base para que suene natural, amable y humana en espanol mexicano. Reglas: no agregues datos, no cambies montos, fechas, lote, manzana, cantidades ni condiciones. No inventes. No expliques politicas internas. Mantente breve y claro. Devuelve solo el mensaje final.",
        },
        {
          role: "user",
          content: `Mensaje del cliente: ${customerMessage}\nRespuesta base: ${baseReply}`,
        },
      ],
    });

    const polished = completion.choices?.[0]?.message?.content?.trim();

    if (!polished) {
      return baseReply;
    }

    if (!preservesNumericData(baseReply, polished)) {
      return baseReply;
    }

    return polished;
  } catch (error) {
    console.error("No se pudo pulir la respuesta con OpenAI:", error.message);
    return baseReply;
  }
}

module.exports = {
  polishWhatsAppReply,
};
