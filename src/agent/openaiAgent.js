const {
  getRecentChatMessages,
  saveChatMessage,
} = require("../repositories/chatRepository");
const { handleToolCall } = require("../tools/customerTools");

function normalizeUserText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getCurrentDateInMexico() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatSpanishDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = String(value).slice(0, 10).split("-");

  if (!year || !month || !day) {
    return String(value);
  }

  const monthNames = {
    "01": "enero",
    "02": "febrero",
    "03": "marzo",
    "04": "abril",
    "05": "mayo",
    "06": "junio",
    "07": "julio",
    "08": "agosto",
    "09": "septiembre",
    "10": "octubre",
    "11": "noviembre",
    "12": "diciembre",
  };

  return `${Number(day)} de ${monthNames[month]}, ${year}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function extractCreditoId(text) {
  const value = String(text || "");

  const labeledMatch = value.match(/credito[_\s-]*id[:\s#-]*(\d+)/i);
  if (labeledMatch) {
    return Number(labeledMatch[1]);
  }

  const creditoMatch = value.match(/credito[:\s#-]*(\d+)/i);
  if (creditoMatch) {
    return Number(creditoMatch[1]);
  }

  const hashMatch = value.match(/#(\d{2,})/);
  if (hashMatch) {
    return Number(hashMatch[1]);
  }

  const onlyNumberMatch = value.trim().match(/^(\d{2,})$/);
  if (onlyNumberMatch) {
    return Number(onlyNumberMatch[1]);
  }

  return null;
}

function findCreditoIdInHistory(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const creditoId = extractCreditoId(message.content);

    if (creditoId) {
      return creditoId;
    }
  }

  return null;
}

function isGreetingOnly(normalized) {
  return /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|que tal|hey|ey|holi)[!. ]*$/.test(
    normalized
  );
}

function isThanksOnly(normalized) {
  return /^(gracias|muchas gracias|ok gracias|sale gracias|perfecto gracias|grcs)[!. ]*$/.test(
    normalized
  );
}

function isSocialOnly(normalized) {
  return /^(como estas|como te encuentras|como andas|que tal estas)[?.! ]*$/.test(
    normalized
  );
}

function isOffTopic(normalized) {
  return /(direccion|colonia|municipio|correo|email|telefono secundario|telefono alterno|datos del cliente|numero de cliente|cliente id)/.test(
    normalized
  );
}

function isPaymentIntent(normalized) {
  return /(ultimo pago|ultimos pagos|mis pagos|historial de pagos|abono|abone|abone|pague|pago realizado|pago de este mes|ya pague|ya realice el pago|fecha de pago|pagos)/.test(
    normalized
  );
}

function isAdditionalChargesIntent(normalized) {
  return /(agua|predial)/.test(normalized);
}

function isDebtIntent(normalized) {
  return /(adeudo|mora|vencido|pendiente al dia|debo hoy|pago vencido)/.test(
    normalized
  );
}

function isBalanceIntent(normalized) {
  return /(saldo restante|balance|cuanto debo|cuanto me falta|resta por pagar|balance total|saldo total|saldo del credito)/.test(
    normalized
  );
}

function isCreditDetailIntent(normalized) {
  return /(mensualidad|proximo pago|lote|manzana|plazo|fecha de inicio|resumen|informacion de mi credito|informacion acerca de mi credito|detalles del credito|credito)/.test(
    normalized
  );
}

function isPaidThisMonthIntent(normalized) {
  return /(ya pague este mes|ya realice el pago de este mes|pago de este mes|ya tengo registrado el pago de este mes)/.test(
    normalized
  );
}

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

function compareYearMonth(dateA, dateB) {
  return String(dateA || "").slice(0, 7) === String(dateB || "").slice(0, 7);
}

async function validateCreditContext(from, message, historyMessages) {
  const explicitCreditoId = extractCreditoId(message);
  const historicalCreditoId = findCreditoIdInHistory(
    historyMessages.filter((item) => item.role === "user")
  );
  const creditoId = explicitCreditoId || historicalCreditoId || undefined;

  const validation = await handleToolCall("validar_cliente_por_telefono", {
    telefono: from,
    ...(creditoId ? { credito_id: creditoId } : {}),
  });

  return validation;
}

async function buildBusinessReply({ from, message, historyMessages }) {
  const normalized = normalizeUserText(message);
  const validation = await validateCreditContext(from, message, historyMessages);

  if (!validation.exists || !validation.activeCredit) {
    return validation.message;
  }

  if (validation.requiresCreditSelection) {
    const creditList = (validation.creditos || [])
      .map((credit) => String(credit.creditoId))
      .join(", ");

    return `Encontré más de un crédito activo asociado a este número. Indícame el credito_id que deseas consultar: ${creditList}.`;
  }

  const creditoId = validation.creditoId;

  if (isOffTopic(normalized)) {
    return "Solo puedo ayudarle con información relacionada con su crédito.";
  }

  if (isPaidThisMonthIntent(normalized) || isPaymentIntent(normalized)) {
    const payments = await handleToolCall("consultar_pagos_credito", {
      credito_id: creditoId,
      limite: 3,
    });

    if (!payments.totalPagos || !payments.pagos?.length) {
      return `No encontré pagos registrados para el crédito ${creditoId}.`;
    }

    const latestPayment = payments.pagos[0];
    const today = getCurrentDateInMexico();

    if (isPaidThisMonthIntent(normalized)) {
      if (compareYearMonth(latestPayment.fechaPago, today)) {
        return `Sí, el último pago registrado del crédito ${creditoId} fue el ${formatSpanishDate(
          latestPayment.fechaPago
        )} por ${formatMoney(latestPayment.abonoCliente)}.`;
      }

      return `No veo un pago registrado este mes para el crédito ${creditoId}. El último pago registrado fue el ${formatSpanishDate(
        latestPayment.fechaPago
      )} por ${formatMoney(latestPayment.abonoCliente)}.`;
    }

    if (/(ultimo pago|fecha de pago|abono|abone|pague|pago realizado)/.test(normalized)) {
      return `El último pago registrado del crédito ${creditoId} fue el ${formatSpanishDate(
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

    return `Pagos registrados del crédito ${creditoId}:\n${lines}`;
  }

  if (isAdditionalChargesIntent(normalized)) {
    const charges = await handleToolCall("consultar_adeudos_adicionales_credito", {
      credito_id: creditoId,
    });

    if (/agua/.test(normalized) && !/predial/.test(normalized)) {
      return `El adeudo de agua del crédito ${creditoId} es ${formatMoney(
        charges.adeudoAgua
      )}.`;
    }

    if (/predial/.test(normalized) && !/agua/.test(normalized)) {
      return `El adeudo predial del crédito ${creditoId} es ${formatMoney(
        charges.adeudoPredial
      )}.`;
    }

    return `Los adeudos adicionales del crédito ${creditoId} son: agua ${formatMoney(
      charges.adeudoAgua
    )} y predial ${formatMoney(charges.adeudoPredial)}.`;
  }

  if (isDebtIntent(normalized) && !isBalanceIntent(normalized)) {
    const debt = await handleToolCall("consultar_adeudo_credito", {
      credito_id: creditoId,
    });

    return `El adeudo actual del crédito ${creditoId} es ${formatMoney(
      debt.adeudoTotal
    )}.`;
  }

  if (isBalanceIntent(normalized) || isCreditDetailIntent(normalized)) {
    const summary = await handleToolCall("consultar_resumen_credito", {
      credito_id: creditoId,
    });

    if (!summary.ok) {
      return summary.message;
    }

    if (/lote/.test(normalized) || /manzana/.test(normalized)) {
      const parts = [];

      if (/lote/.test(normalized)) {
        parts.push(`lote ${summary.lote}`);
      }

      if (/manzana/.test(normalized)) {
        parts.push(`manzana ${summary.manzana}`);
      }

      return `El crédito ${creditoId} corresponde a ${parts.join(" y ")}.`;
    }

    if (/plazo/.test(normalized)) {
      return `El plazo del crédito ${creditoId} es de ${summary.plazoMeses} meses.`;
    }

    if (/fecha de inicio/.test(normalized)) {
      return `La fecha de inicio del crédito ${creditoId} es ${formatSpanishDate(
        summary.fechaInicio
      )}.`;
    }

    if (/mensualidad/.test(normalized) && !/proximo pago/.test(normalized)) {
      return `La mensualidad del crédito ${creditoId} es ${formatMoney(
        summary.mensualidad
      )}.`;
    }

    if (/proximo pago/.test(normalized)) {
      return `El próximo pago del crédito ${creditoId} es el ${formatSpanishDate(
        summary.proximoPago
      )} por ${formatMoney(summary.mensualidad)}.`;
    }

    if (isBalanceIntent(normalized)) {
      return `El saldo restante del crédito ${creditoId} es ${formatMoney(
        summary.saldoRestante
      )}.`;
    }

    return `Resumen del crédito ${creditoId}: saldo restante ${formatMoney(
      summary.saldoRestante
    )}, mensualidad ${formatMoney(summary.mensualidad)}, adeudo ${formatMoney(
      summary.adeudo
    )} y próximo pago ${formatSpanishDate(summary.proximoPago)}.`;
  }

  return "Puedo ayudarle con saldo, adeudo, pagos, agua, predial y otros detalles de su crédito.";
}

async function runCustomerAgent({ from, message }) {
  await saveChatMessage({
    telefono: from,
    role: "user",
    content: message,
  });

  const historyMessages = await getRecentChatMessages(from, 20);
  const normalized = normalizeUserText(message);

  let reply;

  if (isGreetingOnly(normalized)) {
    reply = buildGreetingReply(normalized);
  } else if (isSocialOnly(normalized)) {
    reply = "Bien, gracias.";
  } else if (isThanksOnly(normalized)) {
    reply = "Para servirle.";
  } else {
    reply = await buildBusinessReply({
      from,
      message,
      historyMessages,
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
