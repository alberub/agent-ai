const {
  findCustomerWithActiveCreditByPhone,
  getDebtByCreditId,
  getCreditSummaryByCreditId,
  getAdditionalChargesByCreditId,
  getCreditPaymentsByCreditId,
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
        credito_id: {
          type: "number",
          description:
            "Credito especifico a consultar cuando el cliente tenga mas de un credito activo.",
        },
        lote: {
          type: "number",
          description:
            "Lote del credito a consultar cuando el cliente tenga mas de un credito activo.",
        },
        manzana: {
          type: "number",
          description:
            "Manzana del credito a consultar cuando el cliente tenga mas de un credito activo.",
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
  {
    type: "function",
    name: "consultar_pagos_credito",
    strict: true,
    description:
      "Consulta pagos del credito en pagos_credito por credito_id. Solo devuelve fechaPago y abonoCliente.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        credito_id: {
          type: "number",
          description: "Identificador del credito activo.",
        },
        limite: {
          type: "number",
          description: "Cantidad maxima de pagos a consultar.",
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

      const shortName = getShortDisplayName(customer.nombre);
      const activeCredits = customer.creditos || [];

      if (activeCredits.length === 0) {
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

      if (activeCredits.length > 1) {
        const distinctCampestres = new Set(
          activeCredits
            .map((credit) => credit.id_campestre)
            .filter((value) => value !== null && value !== undefined)
        );
        const sameCampestre = distinctCampestres.size <= 1;
        const requestedCreditId = Number(args.credito_id);
        const requestedLote = Number(args.lote);
        const requestedManzana = Number(args.manzana);
        const selectedCredit = activeCredits.find(
          (credit) =>
            credit.credito_id === requestedCreditId ||
            (requestedLote > 0 &&
              requestedManzana > 0 &&
              Number(credit.lote) === requestedLote &&
              Number(credit.manzana) === requestedManzana)
        );

        if (!selectedCredit) {
          return {
            ok: true,
            exists: true,
            activeCredit: true,
            multipleActiveCredits: true,
            requiresCreditSelection: true,
            sameCampestre,
            clienteId: customer.cliente_id,
            nombre: shortName || customer.nombre,
            telefono: customer.telefono,
            creditos: activeCredits.map((credit) => ({
              creditoId: credit.credito_id,
              campestreId: credit.id_campestre,
              campestreNombre: credit.campestre_nombre,
              lote: credit.lote,
              manzana: credit.manzana,
            })),
            message:
              "El cliente tiene mas de un credito activo. Debe indicar el credito_id que desea consultar.",
          };
        }

        return {
          ok: true,
          exists: true,
          activeCredit: true,
          multipleActiveCredits: true,
          requiresCreditSelection: false,
          sameCampestre,
          clienteId: customer.cliente_id,
          nombre: shortName || customer.nombre,
          telefono: customer.telefono,
          creditoId: selectedCredit.credito_id,
          creditos: activeCredits.map((credit) => ({
            creditoId: credit.credito_id,
            campestreId: credit.id_campestre,
            campestreNombre: credit.campestre_nombre,
            lote: credit.lote,
            manzana: credit.manzana,
          })),
          message: `Cliente validado correctamente para el credito ${selectedCredit.credito_id}.`,
        };
      }

      const selectedCredit = activeCredits[0];

      return {
        ok: true,
        exists: true,
        activeCredit: true,
        requiresUpdate: false,
        clienteId: customer.cliente_id,
        nombre: shortName || customer.nombre,
        telefono: customer.telefono,
        creditoId: selectedCredit.credito_id,
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

    case "consultar_pagos_credito": {
      const limit = Number(args.limite) > 0 ? Number(args.limite) : 5;
      const payments = await getCreditPaymentsByCreditId(args.credito_id, limit);

      return {
        ok: true,
        creditoId: payments.creditoId,
        totalPagos: payments.totalPagos,
        pagos: payments.pagos,
        message:
          payments.totalPagos > 0
            ? `Se consultaron ${payments.totalPagos} pagos del credito ${payments.creditoId}.`
            : `No se encontraron pagos para el credito ${payments.creditoId}.`,
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
