const {
  findCustomerWithActiveCreditByPhone,
  getDebtByCreditId,
  getCreditSummaryByCreditId,
  getAdditionalChargesByCreditId,
} = require("../repositories/customerRepository");
const { getShortDisplayName } = require("../utils/phone");

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
  {
    type: "function",
    name: "consultar_resumen_credito",
    strict: true,
    description:
      "Consulta informacion del credito y detalle_credito, como mensualidad, saldo restante, pagos, proximo pago, lote, manzana, plazo y fecha de inicio.",
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
  {
    type: "function",
    name: "consultar_adeudos_adicionales_credito",
    strict: true,
    description:
      "Consulta adeudos adicionales del credito en detalle_agua y detalle_predial.",
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
        const shortName = getShortDisplayName(customer.nombre);

        return {
          ok: true,
          exists: true,
          activeCredit: false,
          requiresUpdate: true,
          clienteId: customer.cliente_id,
          nombre: shortName || customer.nombre,
          telefono: customer.telefono,
          message:
            "El cliente existe, pero no tiene un credito activo con status 1. Se deben actualizar los datos del cliente.",
        };
      }

      const shortName = getShortDisplayName(customer.nombre);

      return {
        ok: true,
        exists: true,
        activeCredit: true,
        requiresUpdate: false,
        clienteId: customer.cliente_id,
        nombre: shortName || customer.nombre,
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
        message: `El adeudo total del credito ${debt.creditoId} es ${debt.adeudoTotal}.`,
      };
    }

    case "consultar_resumen_credito": {
      const summary = await getCreditSummaryByCreditId(args.credito_id);

      if (!summary) {
        return {
          ok: false,
          creditoId: args.credito_id,
          message: "No se encontro informacion para ese credito.",
        };
      }

      return {
        ok: true,
        ...summary,
        message:
          `Resumen del credito ${summary.creditoId}: saldo restante ${summary.saldoRestante}, mensualidad ${summary.mensualidad}, adeudo ${summary.adeudo}, pagos vencidos ${summary.pagosVencidos}.`,
      };
    }

    case "consultar_adeudos_adicionales_credito": {
      const charges = await getAdditionalChargesByCreditId(args.credito_id);

      return {
        ok: true,
        creditoId: charges.creditoId,
        adeudoAgua: charges.adeudoAgua,
        adeudoPredial: charges.adeudoPredial,
        totalAdicional: charges.adeudoAgua + charges.adeudoPredial,
        message:
          `Adeudos adicionales del credito ${charges.creditoId}: agua ${charges.adeudoAgua}, predial ${charges.adeudoPredial}.`,
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
