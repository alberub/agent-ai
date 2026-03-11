const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");
const { toolDefinitions, handleToolCall } = require("../tools/customerTools");
const {
  getRecentChatMessages,
  saveChatMessage,
} = require("../repositories/chatRepository");

const openai = new OpenAI({
  apiKey: openAiApiKey,
});

const AGENT_INSTRUCTIONS = `
Eres un asistente de cobranza por WhatsApp.

Reglas obligatorias:
1. Solo puedes responder temas relacionados con el credito: saldo restante, adeudo actual, pagos, mensualidad, proximo pago, resumen del credito, agua, predial y datos propios del credito como lote, manzana, plazo o fecha de inicio.
2. Nunca debes responder ni revelar datos personales del cliente, como direccion, colonia, municipio, email, telefonos alternos o cualquier otro dato no relacionado con el credito.
3. Si el usuario pide informacion no relacionada con su credito, responde de forma breve y amable que solo puedes ayudarle con temas de su credito.
4. Antes de responder sobre credito, adeudo o estatus, primero usa la tool validar_cliente_por_telefono con el numero del remitente.
5. Si el cliente no existe o no tiene credito activo con status 1, responde que se deben actualizar los datos del cliente.
6. Si el usuario pregunta por adeudo del credito, usa consultar_adeudo_credito con el credito_id obtenido.
7. Si el usuario pregunta por saldo, mensualidad, proximo pago, lote, manzana, plazo, fecha de inicio o resumen del credito, usa consultar_resumen_credito con el credito_id obtenido.
8. Si el usuario pregunta por agua, predial o adeudos adicionales, usa consultar_adeudos_adicionales_credito con el credito_id obtenido.
9. Si el usuario pregunta por pagos realizados, ultimo pago, fecha de pago, abono, historial de pagos u observaciones de un pago, usa consultar_pagos_credito con el credito_id obtenido.
10. Cuando uses informacion de pagos_credito, toma abono_cliente como el pago realizado por el cliente.
11. Nunca devuelvas ni menciones imagenes relacionadas con pagos.
12. Si mencionas una fecha, usa solo formato YYYY-MM-DD.
13. Si el usuario pregunta si ya pago este mes, compara la fecha actual con la fechaPago mas reciente devuelta por consultar_pagos_credito. Solo responde que ya pago este mes si ambas fechas caen en el mismo mes y ano.
14. Responde siempre en espanol, de forma breve, clara y profesional.
15. No inventes datos que no provengan de las tools.
16. No repitas el nombre del cliente en cada mensaje. Por defecto, no uses el nombre salvo si ayuda de forma puntual.
17. Si usas el nombre del cliente, usa solo el campo nombre devuelto por las tools, sin expandirlo ni completar apellidos adicionales.
18. Interpreta "cuanto debo", "cuanto me falta", "cual es mi balance" o "cuanto resta por pagar" como una consulta de saldo restante del credito, por lo que debes usar consultar_resumen_credito.
19. Interpreta "adeudo", "pago vencido", "pendiente al dia de hoy" o "debo hoy" como consulta de adeudo actual, por lo que debes usar consultar_adeudo_credito.
20. Si la pregunta del usuario es ambigua pero menciona deuda total o balance general, prioriza responder con saldo restante del credito.
21. No cierres cada respuesta con preguntas como "¿en que mas puedo ayudarte?" o "¿desea informacion adicional?".
22. Cierra de forma sobria y natural.
23. Evita frases ceremoniosas o repetitivas como "quedo a tu disposicion", "estoy atento", "con gusto", "estoy aqui para ayudarte cuando lo necesites" o variantes similares.
24. En WhatsApp, prioriza respuestas breves, naturales y directas. No suenes como call center.
25. Si el usuario solo saluda, responde solo con un saludo breve.
26. Si el usuario solo agradece, responde solo con una frase breve y amable.
`;

function parseResponseText(response) {
  if (response.output_text) {
    return response.output_text.trim();
  }

  const messages = response.output || [];
  const textParts = [];

  for (const item of messages) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && content.text) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function buildInputFromHistory(historyMessages) {
  return historyMessages
    .filter((message) => message.role === "user")
    .map((message) => ({
      role: "user",
      content: message.content,
    }));
}

function normalizeUserText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getGreetingReply(normalized) {
  if (/^buenos dias[!. ]*$/.test(normalized)) {
    return "Buenos dias.";
  }

  if (/^buenas tardes[!. ]*$/.test(normalized)) {
    return "Buenas tardes.";
  }

  if (/^buenas noches[!. ]*$/.test(normalized)) {
    return "Buenas noches.";
  }

  if (/^(hola|buenas|que tal|hey|ey|holi)[!. ]*$/.test(normalized)) {
    return "Hola.";
  }

  return null;
}

function getLightweightReply(message) {
  const normalized = normalizeUserText(message);

  if (!normalized) {
    return null;
  }

  const greetingReply = getGreetingReply(normalized);
  if (greetingReply) {
    return greetingReply;
  }

  const isSocialCheckIn =
    /^(como estas|como te encuentras|como andas|que tal estas)[?.! ]*$/.test(
      normalized
    );

  if (isSocialCheckIn) {
    return "Bien, gracias.";
  }

  const isThanks =
    /^(gracias|muchas gracias|ok gracias|sale gracias|perfecto gracias|grcs)[!. ]*$/.test(
      normalized
    );

  if (isThanks) {
    return "Para servirle.";
  }

  return null;
}

async function runCustomerAgent({ from, message }) {
  await saveChatMessage({
    telefono: from,
    role: "user",
    content: message,
  });

  const historyMessages = await getRecentChatMessages(from, 12);
  const lightweightReply = getLightweightReply(message);

  if (lightweightReply) {
    await saveChatMessage({
      telefono: from,
      role: "assistant",
      content: lightweightReply,
    });

    return lightweightReply;
  }

  const input = buildInputFromHistory(historyMessages);

  let response = await openai.responses.create({
    model: openAiModel,
    instructions: AGENT_INSTRUCTIONS,
    parallel_tool_calls: false,
    input: [
      {
        role: "system",
        content: `Telefono del remitente: ${from}\nFecha actual: ${new Date()
          .toISOString()
          .slice(0, 10)}`,
      },
      ...input,
    ],
    tools: toolDefinitions,
  });

  while (response.output?.some((item) => item.type === "function_call")) {
    const toolOutputs = [];

    for (const item of response.output) {
      if (item.type !== "function_call") {
        continue;
      }

      const args = JSON.parse(item.arguments || "{}");
      const result = await handleToolCall(item.name, args);

      toolOutputs.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await openai.responses.create({
      model: openAiModel,
      previous_response_id: response.id,
      instructions: AGENT_INSTRUCTIONS,
      parallel_tool_calls: false,
      input: toolOutputs,
      tools: toolDefinitions,
    });
  }

  const finalText = parseResponseText(response);

  if (!finalText) {
    throw new Error("El agente no produjo una respuesta final.");
  }

  await saveChatMessage({
    telefono: from,
    role: "assistant",
    content: finalText,
  });

  return finalText;
}

module.exports = {
  runCustomerAgent,
};
