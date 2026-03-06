function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function lastTenDigits(phone) {
  const normalized = normalizePhone(phone);
  return normalized.slice(-10);
}

function normalizeWhatsAppRecipient(phone) {
  const normalized = normalizePhone(phone);

  // Meta test recipients for Mexico are commonly registered as 52 + 10 digits,
  // while inbound webhook messages may arrive as 521 + 10 digits.
  if (/^521\d{10}$/.test(normalized)) {
    return `52${normalized.slice(3)}`;
  }

  return normalized;
}

function getShortDisplayName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts.slice(0, 2).join(" ");
}

module.exports = {
  normalizePhone,
  lastTenDigits,
  normalizeWhatsAppRecipient,
  getShortDisplayName,
};
