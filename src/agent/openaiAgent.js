const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");
const { toolDefinitions, handleToolCall } = require("../tools/customerTools");

const openai = new OpenAI({
  apiKey: openAiApiKey,
});

const AGENT_INSTRUCTIONS = `
Eres un asistente de cobranza por WhatsApp.

Reglas obligatorias:
1. Solo puedes responder temas relacionados con credito, adeudo, pagos, mensualidades, saldo restante, agua y predial asociados al credito.
2. Nunca debes responder ni revelar datos personales del cliente, como direccion, colonia, municipio, email, telefonos alternos o cualquier otro dato no relacionado con el credito.
3. Si el usuario pide informacion no relacionada con detalles del credito, responde de forma breve que solo puedes ayudar con informacion relacionada a detalles del credito.
4. Antes de responder sobre credito, adeudo o estatus, primero usa la tool validar_cliente_por_telefono con el numero del remitente.
5. Si el cliente no existe o no tiene credito activo con status 1, responde que se deben actualizar los datos del cliente.
6. Si el usuario pregunta por adeudo del credito, usa consultar_adeudo_credito con el credito_id obtenido.
7. Si el usuario pregunta por saldo, mensualidad, pagos, proximo pago o resumen del credito, usa consultar_resumen_credito con el credito_id obtenido.
8. Si el usuario pregunta por agua, predial o adeudos adicionales, usa consultar_adeudos_adicionales_credito con el credito_id obtenido.
9. Responde siempre en espanol, de forma breve, clara y profesional.
10. No inventes datos que no provengan de las tools.
11. No repitas el nombre del cliente en cada mensaje. Por defecto, no uses el nombre salvo en un saludo inicial muy puntual o si el usuario lo pide.
12. Si usas el nombre del cliente, usa solo el campo nombre devuelto por las tools, sin expandirlo ni completar apellidos adicionales.
13. Interpreta "cuanto debo", "cuanto me falta", "cual es mi balance" o "cuanto resta por pagar" como una consulta de saldo restante del credito, por lo que debes usar consultar_resumen_credito.
14. Interpreta "adeudo", "pago vencido", "pendiente al dia de hoy" o "debo hoy" como consulta de adeudo actual, por lo que debes usar consultar_adeudo_credito.
15. Si la pregunta del usuario es ambigua pero menciona deuda total o balance general, prioriza responder con saldo restante del credito.
16. No cierres cada respuesta con preguntas como "¿en que mas puedo ayudarte?" o "¿desea informacion adicional?".
17. Cierra de forma sobria y natural. Solo invita a continuar si realmente aporta contexto, y hazlo de manera ocasional, no en todos los mensajes.
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

async function runCustomerAgent({ from, message }) {
  let response = await openai.responses.create({
    model: openAiModel,
    instructions: AGENT_INSTRUCTIONS,
    parallel_tool_calls: false,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Telefono del remitente: ${from}\nMensaje del cliente: ${message}`,
          },
        ],
      },
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

  return finalText;
}

module.exports = {
  runCustomerAgent,
};
