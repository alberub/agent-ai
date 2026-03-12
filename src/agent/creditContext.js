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

function extractLoteManzana(text) {
  const value = String(text || "");
  const loteMatch = value.match(/lote[:\s#-]*(\d+)/i);
  const manzanaMatch = value.match(/manzana[:\s#-]*(\d+)/i);

  if (!loteMatch || !manzanaMatch) {
    return null;
  }

  return {
    lote: Number(loteMatch[1]),
    manzana: Number(manzanaMatch[1]),
  };
}

function findPreviousCreditSelection(historyMessages) {
  for (let index = historyMessages.length - 1; index >= 0; index -= 1) {
    const message = historyMessages[index];
    if (message.role !== "user") {
      continue;
    }

    const creditoId = extractCreditoId(message.content);
    if (creditoId) {
      return { creditoId };
    }

    const loteManzana = extractLoteManzana(message.content);
    if (loteManzana) {
      return loteManzana;
    }
  }

  return null;
}

function resolveCreditSelection(message, historyMessages, wantsAllCredits) {
  const creditoId = extractCreditoId(message);
  if (creditoId) {
    return { creditoId };
  }

  const loteManzana = extractLoteManzana(message);
  if (loteManzana) {
    return loteManzana;
  }

  if (wantsAllCredits) {
    return null;
  }

  return findPreviousCreditSelection(historyMessages);
}

module.exports = {
  extractCreditoId,
  extractLoteManzana,
  resolveCreditSelection,
};
