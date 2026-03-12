const {
  getRecentChatMessages,
  saveChatMessage,
} = require("../repositories/chatRepository");
const {
  getChatContext,
  saveChatContext,
} = require("../repositories/chatContextRepository");
const { handleToolCall } = require("../tools/customerTools");
const { detectIntent } = require("./intentDetector");
const {
  formatMoney,
  formatSpanishDate,
  getCurrentDateInMexico,
  compareYearMonth,
} = require("./textUtils");
const {
  extractCreditoId,
  extractLoteManzana,
} = require("./creditContext");
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

function normalizeState(summary) {
  return {
    pendingAction: summary?.pendingAction || null,
    lastTopic: summary?.lastTopic || null,
    sameCampestre: Boolean(summary?.sameCampestre),
    availableCredits: Array.isArray(summary?.availableCredits)
      ? summary.availableCredits
      : [],
    selectedCreditIds: Array.isArray(summary?.selectedCreditIds)
      ? summary.selectedCreditIds.map(Number).filter(Boolean)
      : [],
  };
}

function detectTopic(intent) {
  if (intent.additionalCharges) {
    return "charges";
  }

  if (intent.paidThisMonth) {
    return "paidThisMonth";
  }

  if (intent.paymentCount) {
    return "paymentCount";
  }

  if (intent.paymentIntent) {
    return "payments";
  }

  if (intent.debt && !intent.balance) {
    return "debt";
  }

  if (intent.nextPayment) {
    return "nextPayment";
  }

  if (intent.monthlyPayment) {
    return "monthlyPayment";
  }

  if (intent.term) {
    return "term";
  }

  if (intent.startDate) {
    return "startDate";
  }

  if (intent.lotOrBlock) {
    return "lotOrBlock";
  }

  if (intent.balance) {
    return "balance";
  }

  if (intent.creditDetail || intent.wantsAllCredits) {
    return "summary";
  }

  return null;
}

function isBothSelection(normalized) {
  return /^(ambos|los dos|las dos|sobre ambos|sobre los dos|de ambos|de los dos|ambas)[!. ]*$/.test(
    normalized
  );
}

function buildCreditLabel(credit, includeCampestre = false) {
  const base = `lote ${credit.lote}, manzana ${credit.manzana}`;

  if (includeCampestre && credit.campestreNombre) {
    return `${credit.campestreNombre}, ${base}`;
  }

  return base;
}

function buildSelectionPrompt(credits, sameCampestre) {
  const lines = credits
    .map((credit) => `- ${buildCreditLabel(credit, !sameCampestre)}`)
    .join("\n");

  if (sameCampestre) {
    return `Encontre mas de un credito activo:\n${lines}\nDigame sobre cual credito quiere informacion.`;
  }

  return `Encontre creditos activos en distintos desarrollos:\n${lines}\nDigame sobre cual credito quiere informacion.`;
}

function buildNoWriteReply() {
  return "Puedo ayudarle con consultas de su credito y de sus pagos, pero desde este chat no es posible registrar o modificar pagos.";
}

function buildOffTopicReply() {
  return "Puedo ayudarle con detalles de su credito, como saldo, adeudo, pagos, lote, manzana y fechas.";
}

function buildAvailableCredits(validation) {
  if (validation.creditos?.length) {
    return validation.creditos;
  }

  if (validation.creditoId) {
    return [
      {
        creditoId: validation.creditoId,
      },
    ];
  }

  return [];
}

function chooseExplicitCredit(validation, message) {
  const explicitCreditoId = extractCreditoId(message);
  if (explicitCreditoId) {
    return validation.creditos?.find(
      (credit) => Number(credit.creditoId) === explicitCreditoId
    );
  }

  const loteManzana = extractLoteManzana(message);
  if (loteManzana) {
    return validation.creditos?.find(
      (credit) =>
        Number(credit.lote) === Number(loteManzana.lote) &&
        Number(credit.manzana) === Number(loteManzana.manzana)
    );
  }

  return null;
}

function getSelectedCredits(validation, state, message, intent) {
  const availableCredits = validation.creditos || [];

  if (availableCredits.length <= 1) {
    return {
      scope: "single",
      credits:
        availableCredits.length > 0
          ? availableCredits
          : [{ creditoId: validation.creditoId }],
    };
  }

  if (intent.multipleCreditsCorrection) {
    return validation.sameCampestre
      ? { scope: "all", credits: availableCredits }
      : { scope: "ask", credits: availableCredits };
  }

  const explicitCredit = chooseExplicitCredit(validation, message);
  if (explicitCredit) {
    return {
      scope: "single",
      credits: [explicitCredit],
    };
  }

  if (isBothSelection(intent.normalized)) {
    return validation.sameCampestre
      ? { scope: "all", credits: availableCredits }
      : { scope: "ask", credits: availableCredits };
  }

  if (intent.wantsAllCredits) {
    return validation.sameCampestre
      ? { scope: "all", credits: availableCredits }
      : { scope: "ask", credits: availableCredits };
  }

  if (state.pendingAction === "choose_credit_scope") {
    if (state.selectedCreditIds.length > 1 && validation.sameCampestre) {
      return { scope: "all", credits: availableCredits };
    }

    return { scope: "ask", credits: availableCredits };
  }

  if (state.selectedCreditIds.length > 1 && validation.sameCampestre) {
    const selected = availableCredits.filter((credit) =>
      state.selectedCreditIds.includes(Number(credit.creditoId))
    );

    if (selected.length > 1) {
      return { scope: "all", credits: selected };
    }
  }

  if (state.selectedCreditIds.length === 1) {
    const selected = availableCredits.find(
      (credit) =>
        Number(credit.creditoId) === Number(state.selectedCreditIds[0])
    );

    if (selected) {
      return { scope: "single", credits: [selected] };
    }
  }

  return { scope: "ask", credits: availableCredits };
}

async function getCreditSummary(creditoId) {
  return handleToolCall("consultar_resumen_credito", { credito_id: creditoId });
}

async function getCreditPayments(creditoId, limit = 3) {
  return handleToolCall("consultar_pagos_credito", {
    credito_id: creditoId,
    limite: limit,
  });
}

async function getCreditCharges(creditoId) {
  return handleToolCall("consultar_adeudos_adicionales_credito", {
    credito_id: creditoId,
  });
}

async function getCreditDebt(creditoId) {
  return handleToolCall("consultar_adeudo_credito", { credito_id: creditoId });
}

async function buildSingleCreditReply(topic, credit) {
  if (topic === "payments" || topic === "paymentCount" || topic === "paidThisMonth") {
    const payments = await getCreditPayments(credit.creditoId, 3);

    if (!payments.totalPagos || !payments.pagos?.length) {
      return "No veo pagos registrados para ese credito.";
    }

    const latestPayment = payments.pagos[0];

    if (topic === "paidThisMonth") {
      const today = getCurrentDateInMexico();

      if (compareYearMonth(latestPayment.fechaPago, today)) {
        return `Si, el ultimo pago registrado fue el ${formatSpanishDate(
          latestPayment.fechaPago
        )} por ${formatMoney(latestPayment.abonoCliente)}.`;
      }

      return `No veo un pago registrado este mes. El ultimo pago registrado fue el ${formatSpanishDate(
        latestPayment.fechaPago
      )} por ${formatMoney(latestPayment.abonoCliente)}.`;
    }

    if (topic === "paymentCount") {
      return `Tiene ${payments.totalPagos} pagos registrados en total.`;
    }

    return `El ultimo pago registrado fue el ${formatSpanishDate(
      latestPayment.fechaPago
    )} por ${formatMoney(latestPayment.abonoCliente)}.`;
  }

  if (topic === "charges") {
    const charges = await getCreditCharges(credit.creditoId);
    return `Los adeudos adicionales son: agua ${formatMoney(
      charges.adeudoAgua
    )} y predial ${formatMoney(charges.adeudoPredial)}.`;
  }

  if (topic === "debt") {
    const debt = await getCreditDebt(credit.creditoId);
    return `El adeudo actual es ${formatMoney(debt.adeudoTotal)}.`;
  }

  const summary = await getCreditSummary(credit.creditoId);

  if (!summary.ok) {
    return summary.message;
  }

  const label = buildCreditLabel(
    {
      campestreNombre: credit.campestreNombre,
      lote: summary.lote,
      manzana: summary.manzana,
    },
    Boolean(credit.campestreNombre)
  );

  if (topic === "balance") {
    return `El saldo restante de ${label} es ${formatMoney(
      summary.saldoRestante
    )}.`;
  }

  if (topic === "monthlyPayment") {
    return `La mensualidad actual de ${label} es ${formatMoney(
      summary.mensualidad
    )}.`;
  }

  if (topic === "nextPayment") {
    return `El proximo pago de ${label} es el ${formatSpanishDate(
      summary.proximoPago
    )} por ${formatMoney(summary.mensualidad)}.`;
  }

  if (topic === "term") {
    return `El plazo de ${label} es de ${summary.plazoMeses} meses.`;
  }

  if (topic === "startDate") {
    return `La fecha de inicio de ${label} es ${formatSpanishDate(
      summary.fechaInicio
    )}.`;
  }

  if (topic === "lotOrBlock") {
    return `Ese credito corresponde a lote ${summary.lote} y manzana ${summary.manzana}.`;
  }

  return `Resumen de ${label}: saldo restante ${formatMoney(
    summary.saldoRestante
  )}, mensualidad ${formatMoney(summary.mensualidad)}, adeudo ${formatMoney(
    summary.adeudo
  )} y proximo pago ${formatSpanishDate(summary.proximoPago)}.`;
}

async function buildMultipleCreditsReply(topic, credits) {
  if (topic === "payments" || topic === "paymentCount" || topic === "paidThisMonth") {
    const paymentsByCredit = await Promise.all(
      credits.map(async (credit) => ({
        credit,
        payments: await getCreditPayments(credit.creditoId, 1),
      }))
    );

    if (topic === "paymentCount") {
      const lines = paymentsByCredit.map(
        ({ credit, payments }) =>
          `- ${buildCreditLabel(credit)}: ${payments.totalPagos} pagos registrados`
      );

      return `Estos son los pagos registrados por credito:\n${lines.join("\n")}`;
    }

    if (topic === "paidThisMonth") {
      const today = getCurrentDateInMexico();
      const lines = paymentsByCredit.map(({ credit, payments }) => {
        const latestPayment = payments.pagos?.[0];

        if (!latestPayment) {
          return `- ${buildCreditLabel(credit)}: sin pagos registrados`;
        }

        if (compareYearMonth(latestPayment.fechaPago, today)) {
          return `- ${buildCreditLabel(credit)}: si, pago el ${formatSpanishDate(
            latestPayment.fechaPago
          )} por ${formatMoney(latestPayment.abonoCliente)}`;
        }

        return `- ${buildCreditLabel(credit)}: no hay pago registrado este mes`;
      });

      return `Esto es lo que veo sobre el pago de este mes:\n${lines.join("\n")}`;
    }

    const lines = paymentsByCredit.map(({ credit, payments }) => {
      const latestPayment = payments.pagos?.[0];

      if (!latestPayment) {
        return `- ${buildCreditLabel(credit)}: sin pagos registrados`;
      }

      return `- ${buildCreditLabel(credit)}: ultimo pago ${formatSpanishDate(
        latestPayment.fechaPago
      )} por ${formatMoney(latestPayment.abonoCliente)}`;
    });

    return `Estos son los ultimos pagos por credito:\n${lines.join("\n")}`;
  }

  if (topic === "charges") {
    const chargesByCredit = await Promise.all(
      credits.map(async (credit) => ({
        credit,
        charges: await getCreditCharges(credit.creditoId),
      }))
    );

    const lines = chargesByCredit.map(
      ({ credit, charges }) =>
        `- ${buildCreditLabel(credit)}: agua ${formatMoney(
          charges.adeudoAgua
        )}, predial ${formatMoney(charges.adeudoPredial)}`
    );

    return `Estos son los adeudos adicionales por credito:\n${lines.join("\n")}`;
  }

  if (topic === "debt") {
    const debtsByCredit = await Promise.all(
      credits.map(async (credit) => ({
        credit,
        debt: await getCreditDebt(credit.creditoId),
      }))
    );

    const lines = debtsByCredit.map(
      ({ credit, debt }) =>
        `- ${buildCreditLabel(credit)}: adeudo ${formatMoney(debt.adeudoTotal)}`
    );

    return `Estos son los adeudos por credito:\n${lines.join("\n")}`;
  }

  const summaries = await Promise.all(
    credits.map(async (credit) => ({
      credit,
      summary: await getCreditSummary(credit.creditoId),
    }))
  );

  const validSummaries = summaries.filter(({ summary }) => summary.ok);

  const lines = validSummaries.map(({ credit, summary }) => {
    if (topic === "balance") {
      return `- ${buildCreditLabel(credit)}: saldo restante ${formatMoney(
        summary.saldoRestante
      )}`;
    }

    if (topic === "monthlyPayment") {
      return `- ${buildCreditLabel(credit)}: mensualidad ${formatMoney(
        summary.mensualidad
      )}`;
    }

    if (topic === "nextPayment") {
      return `- ${buildCreditLabel(credit)}: proximo pago ${formatSpanishDate(
        summary.proximoPago
      )} por ${formatMoney(summary.mensualidad)}`;
    }

    if (topic === "term") {
      return `- ${buildCreditLabel(credit)}: plazo ${summary.plazoMeses} meses`;
    }

    if (topic === "startDate") {
      return `- ${buildCreditLabel(credit)}: fecha de inicio ${formatSpanishDate(
        summary.fechaInicio
      )}`;
    }

    return `- ${buildCreditLabel(credit)}: saldo restante ${formatMoney(
      summary.saldoRestante
    )}, adeudo ${formatMoney(summary.adeudo)}, mensualidad ${formatMoney(
      summary.mensualidad
    )}`;
  });

  return `Esto es lo que veo sobre sus creditos:\n${lines.join("\n")}`;
}

async function saveOperationalContext(from, validation, stateUpdate) {
  const mergedState = normalizeState(stateUpdate);

  await saveChatContext({
    telefono: from,
    summary: mergedState,
    lastCreditoId:
      mergedState.selectedCreditIds.length === 1
        ? mergedState.selectedCreditIds[0]
        : null,
    lastClienteId: validation?.clienteId || null,
  });
}

async function buildBusinessReply({ from, message, historyMessages }) {
  const intent = detectIntent(message);
  const storedContext = await getChatContext(from);
  const state = normalizeState(storedContext.summary);
  const topic = detectTopic(intent) || state.lastTopic;

  if (intent.offTopic) {
    return buildOffTopicReply();
  }

  if (intent.writeAction) {
    return buildNoWriteReply();
  }

  const baseValidation = await handleToolCall("validar_cliente_por_telefono", {
    telefono: from,
  });

  if (!baseValidation.exists || !baseValidation.activeCredit) {
    await saveOperationalContext(from, baseValidation, {
      pendingAction: null,
      lastTopic: null,
      sameCampestre: false,
      availableCredits: [],
      selectedCreditIds: [],
    });
    return baseValidation.message;
  }

  const availableCredits = buildAvailableCredits(baseValidation);
  let selection = getSelectedCredits(baseValidation, state, message, intent);

  if (!topic && isBothSelection(intent.normalized) && baseValidation.sameCampestre) {
    selection = { scope: "all", credits: availableCredits };
  }

  if (selection.scope === "ask") {
    await saveOperationalContext(from, baseValidation, {
      pendingAction: "choose_credit_scope",
      lastTopic: topic,
      sameCampestre: baseValidation.sameCampestre,
      availableCredits,
      selectedCreditIds: [],
    });

    return buildSelectionPrompt(availableCredits, baseValidation.sameCampestre);
  }

  const selectedCreditIds = selection.credits
    .map((credit) => Number(credit.creditoId))
    .filter(Boolean);

  await saveOperationalContext(from, baseValidation, {
    pendingAction: null,
    lastTopic: topic,
    sameCampestre: baseValidation.sameCampestre,
    availableCredits,
    selectedCreditIds,
  });

  if (!topic) {
    if (selection.scope === "all") {
      return buildMultipleCreditsReply("summary", selection.credits);
    }

    return buildSingleCreditReply("summary", selection.credits[0]);
  }

  if (selection.scope === "all") {
    return buildMultipleCreditsReply(topic, selection.credits);
  }

  return buildSingleCreditReply(topic, selection.credits[0]);
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
