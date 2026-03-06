const {
  findCustomerWithActiveCreditByPhone,
  getDebtByCreditId,
} = require("../repositories/customerRepository");

const toolDefinitions = [
  {
    type: "function",
    name: "validar_cliente_por_telefono",
    strict: true,
    description:
      "Valida si existe un cliente por telefono y si tiene un credito activo con status = 1.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        telefono: {
          type: "string",
          description: "Numero del cliente que envio el mensaje.",
        },
      },
      required: ["telefono"],
    },
  },
  {
    type: "function",
    name: "consultar_adeudo_credito",
    strict: true,
    description:
      "Consulta el adeudo total en detalle_credito usando el credito_id.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        credito_id: {
          type: "number",
          description: "Identificador del credito activo.",
        },
      },
      required: ["credito_id"],
    },
  },
];

async function handleToolCall(toolName, args) {
  switch (toolName) {
    case "validar_cliente_por_telefono": {
      const customer = await findCustomerWithActiveCreditByPhone(args.telefono);

      if (!customer) {
        return {
          ok: true,
          exists: false,
          activeCredit: false,
          requiresUpdate: true,
          message:
            "No se encontro un cliente con ese telefono o no tiene un credito activo. Se deben actualizar los datos del cliente.",
        };
      }

      if (!customer.credito_id) {
        return {
          ok: true,
          exists: true,
          activeCredit: false,
          requiresUpdate: true,
          clienteId: customer.cliente_id,
          nombre: customer.nombre,
          telefono: customer.telefono,
          message:
            "El cliente existe, pero no tiene un credito activo con status 1. Se deben actualizar los datos del cliente.",
        };
      }

      return {
        ok: true,
        exists: true,
        activeCredit: true,
        requiresUpdate: false,
        clienteId: customer.cliente_id,
        nombre: customer.nombre,
        telefono: customer.telefono,
        creditoId: customer.credito_id,
        message: "Cliente validado correctamente con credito activo.",
      };
    }

    case "consultar_adeudo_credito": {
      const debt = await getDebtByCreditId(args.credito_id);

      return {
        ok: true,
        creditoId: debt.creditoId,
        adeudoTotal: debt.adeudoTotal,
        registros: debt.registros,
        message: `El adeudo total del credito ${debt.creditoId} es ${debt.adeudoTotal}.`,
      };
    }

    default:
      throw new Error(`Tool no soportada: ${toolName}`);
  }
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
