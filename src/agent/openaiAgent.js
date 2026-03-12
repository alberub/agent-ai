const {
  getRecentChatMessages,
  saveChatMessage,
} = require("../repositories/chatRepository");
const { handleToolCall } = require("../tools/customerTools");
const { detectIntent } = require("./intentDetector");
const {
  formatMoney,
  formatSpanishDate,
  getCurrentDateInMexico,
  compareYearMonth,
} = require("./textUtils");
const { resolveCreditSelection } = require("./creditContext");
const { polishWhatsAppReply } = require("../services/openAiToneService");

function buildGreetingReply(normalized) {
  if (/^buenos dias[!. ]*$/.test(normalized)) {
    return "Buenos dias.";
  }

  if (/^buenas tardes[!. ]*$/.test(normalized)) {
    return "Buenas tardes.";
  }

  if (/^buenas noches[!. ]*$/.test(normalized)) {
    return "Buenas noches.";
  }

  return "Hola.";
}

function buildSelectionPrompt(validation) {
  const credits = validation.creditos || [];

  if (validation.sameCampestre && credits.length > 0) {
    const campestreNombre = credits[0].campestreNombre || "su desarrollo";
    const lines = credits
      .map((credit) => `- Lote ${credit.lote}, manzana ${credit.manzana}`)
      .join("\n");

    return `Encontre mas de un credito activo en ${campestreNombre}:\n${lines}\nDigame sobre cual credito quiere informacion.`;
  }

  const lines = credits
    .map((credit) => {
      const campestre = credit.campestreNombre || "desarrollo sin nombre";
      return `- ${campestre}, lote ${credit.lote}, manzana ${credit.manzana}`;
    })
    .join("\n");

  return `Encontre mas de un credito activo asociado a este numero:\n${lines}\nDigame sobre cual credito quiere informacion.`;
}

async function summarizeCredits(credits) {
  const summaries = await Promise.all(
    credits.map((credit) =>
      handleToolCall("consultar_resumen_credito", {
        credito_id: credit.creditoId,
      })
    )
  );

  return summaries.filter((summary) => summary.ok);
}

function buildCreditsOverview(credits, summaries) {
  const campestreNombre = credits[0]?.campestreNombre || "su desarrollo";
  const lines = summaries
    .map(
      (summary) =>
        `- Lote ${summary.lote}, manzana ${summary.manzana}: saldo restante ${formatMoney(
          summary.saldoRestante
        )}, adeudo ${formatMoney(summary.adeudo)}, mensualidad ${formatMoney(
          summary.mensualidad
        )}`
    )
    .join("\n");

  return `Estos son sus creditos activos en ${campestreNombre}:\n${lines}`;
}

function buildCreditLabel(validation, summary) {
  const selectedCredit = (validation.creditos || []).find(
    (credit) => credit.creditoId === validation.creditoId
  );

  if (selectedCredit?.campestreNombre) {
    return `${selectedCredit.campestreNombre}, lote ${selectedCredit.lote}, manzana ${selectedCredit.manzana}`;
  }

  if (summary?.lote && summary?.manzana) {
    return `lote ${summary.lote}, manzana ${summary.manzana}`;
  }

  return "su credito";
}

async function validateCreditContext(from, historyMessages, intent, message) {
  const selection = resolveCreditSelection(
    message,
    historyMessages.filter((item) => item.role === "user"),
    intent.wantsAllCredits || intent.multipleCreditsCorrection
  );

  return handleToolCall("validar_cliente_por_telefono", {
    telefono: from,
    ...(selection?.creditoId ? { credito_id: selection.creditoId } : {}),
    ...(selection?.lote ? { lote: selection.lote } : {}),
    ...(selection?.manzana ? { manzana: selection.manzana } : {}),
  });
}

async function buildPaymentReply(intent, validation) {
  const payments = await handleToolCall("consultar_pagos_credito", {
    credito_id: validation.creditoId,
    limite: 3,
  });

  if (!payments.totalPagos || !payments.pagos?.length) {
    return "No veo pagos registrados para ese credito.";
  }

  const latestPayment = payments.pagos[0];
  const today = getCurrentDateInMexico();

  if (intent.paidThisMonth) {
    if (compareYearMonth(latestPayment.fechaPago, today)) {
      return `Si, el ultimo pago registrado fue el ${formatSpanishDate(
        latestPayment.fechaPago
      )} por ${formatMoney(latestPayment.abonoCliente)}.`;
    }

    return `No veo un pago registrado este mes. El ultimo pago registrado fue el ${formatSpanishDate(
      latestPayment.fechaPago
    )} por ${formatMoney(latestPayment.abonoCliente)}.`;
  }

  if (intent.paymentCount) {
    return `Tiene ${payments.totalPagos} pagos registrados en total.`;
  }

  if (
    /(ultimo pago|fecha de pago|abono|abone|pague|pago realizado)/.test(
      intent.normalized
    )
  ) {
    return `El ultimo pago registrado fue el ${formatSpanishDate(
      latestPayment.fechaPago
    )} por ${formatMoney(latestPayment.abonoCliente)}.`;
  }

  const lines = payments.pagos
    .map(
      (payment) =>
        `- ${formatSpanishDate(payment.fechaPago)}: ${formatMoney(
          payment.abonoCliente
        )}`
    )
    .join("\n");

  return `Estos son los pagos mas recientes:\n${lines}`;
}

async function buildChargesReply(intent, validation) {
  const charges = await handleToolCall("consultar_adeudos_adicionales_credito", {
    credito_id: validation.creditoId,
  });

  if (/agua/.test(intent.normalized) && !/predial/.test(intent.normalized)) {
    return `El adeudo de agua es ${formatMoney(charges.adeudoAgua)}.`;
  }

  if (/predial/.test(intent.normalized) && !/agua/.test(intent.normalized)) {
    return `El adeudo predial es ${formatMoney(charges.adeudoPredial)}.`;
  }

  return `Los adeudos adicionales son: agua ${formatMoney(
    charges.adeudoAgua
  )} y predial ${formatMoney(charges.adeudoPredial)}.`;
}

async function buildSummaryReply(intent, validation) {
  const summary = await handleToolCall("consultar_resumen_credito", {
    credito_id: validation.creditoId,
  });

  if (!summary.ok) {
    return summary.message;
  }

  const creditLabel = buildCreditLabel(validation, summary);

  if (intent.lotOrBlock) {
    if (/lote/.test(intent.normalized) && /manzana/.test(intent.normalized)) {
      return `Ese credito corresponde a lote ${summary.lote} y manzana ${summary.manzana}.`;
    }

    if (/lote/.test(intent.normalized)) {
      return `Ese credito corresponde al lote ${summary.lote}.`;
    }

    return `Ese credito corresponde a la manzana ${summary.manzana}.`;
  }

  if (intent.term) {
    return `El plazo de ${creditLabel} es de ${summary.plazoMeses} meses.`;
  }

  if (intent.startDate) {
    return `La fecha de inicio de ${creditLabel} es ${formatSpanishDate(
      summary.fechaInicio
    )}.`;
  }

  if (intent.nextPayment) {
    return `El proximo pago de ${creditLabel} es el ${formatSpanishDate(
      summary.proximoPago
    )} por ${formatMoney(summary.mensualidad)}.`;
  }

  if (intent.monthlyPayment && !intent.nextPayment) {
    return `La mensualidad actual de ${creditLabel} es ${formatMoney(
      summary.mensualidad
    )}.`;
  }

  if (intent.balance) {
    return `El saldo restante de ${creditLabel} es ${formatMoney(
      summary.saldoRestante
    )}.`;
  }

  return `Resumen de ${creditLabel}: saldo restante ${formatMoney(
    summary.saldoRestante
  )}, mensualidad ${formatMoney(summary.mensualidad)}, adeudo ${formatMoney(
    summary.adeudo
  )} y proximo pago ${formatSpanishDate(summary.proximoPago)}.`;
}

async function buildBusinessReply({ from, message, historyMessages }) {
  const intent = detectIntent(message);

  if (intent.offTopic) {
    return "Puedo ayudarle con detalles de su credito, como saldo, adeudo, pagos, lote, manzana y fechas.";
  }

  if (intent.writeAction) {
    return "Puedo ayudarle con consultas de su credito y de sus pagos, pero desde este chat no es posible registrar o modificar pagos.";
  }

  const validation = await validateCreditContext(
    from,
    historyMessages,
    intent,
    message
  );

  if (!validation.exists || !validation.activeCredit) {
    return validation.message;
  }

  if (intent.multipleCreditsCorrection) {
    const resetValidation = await handleToolCall("validar_cliente_por_telefono", {
      telefono: from,
    });

    if (resetValidation.requiresCreditSelection) {
      if (resetValidation.sameCampestre) {
        const summaries = await summarizeCredits(resetValidation.creditos || []);
        return buildCreditsOverview(resetValidation.creditos || [], summaries);
      }

      return buildSelectionPrompt(resetValidation);
    }
  }

  if (validation.requiresCreditSelection) {
    if (validation.sameCampestre && intent.wantsAllCredits) {
      const summaries = await summarizeCredits(validation.creditos || []);
      return buildCreditsOverview(validation.creditos || [], summaries);
    }

    return buildSelectionPrompt(validation);
  }

  if (intent.additionalCharges) {
    return buildChargesReply(intent, validation);
  }

  if (intent.paymentIntent || intent.paidThisMonth) {
    return buildPaymentReply(intent, validation);
  }

  if (intent.debt && !intent.balance) {
    const debt = await handleToolCall("consultar_adeudo_credito", {
      credito_id: validation.creditoId,
    });

    return `El adeudo actual es ${formatMoney(debt.adeudoTotal)}.`;
  }

  if (
    intent.balance ||
    intent.creditDetail ||
    intent.monthlyPayment ||
    intent.nextPayment ||
    intent.term ||
    intent.startDate ||
    intent.lotOrBlock
  ) {
    return buildSummaryReply(intent, validation);
  }

  return "Puedo ayudarle con saldo, adeudo, pagos, agua, predial y otros detalles de su credito.";
}

async function runCustomerAgent({ from, message }) {
  await saveChatMessage({
    telefono: from,
    role: "user",
    content: message,
  });

  const historyMessages = await getRecentChatMessages(from, 20);
  const intent = detectIntent(message);

  let reply;

  if (intent.greetingOnly) {
    reply = buildGreetingReply(intent.normalized);
  } else if (intent.socialOnly) {
    reply = "Bien, gracias.";
  } else if (intent.thanksOnly) {
    reply = "Para servirle.";
  } else {
    const baseReply = await buildBusinessReply({
      from,
      message,
      historyMessages,
    });

    reply = await polishWhatsAppReply({
      customerMessage: message,
      baseReply,
    });
  }

  await saveChatMessage({
    telefono: from,
    role: "assistant",
    content: reply,
  });

  return reply;
}

module.exports = {
  runCustomerAgent,
};
