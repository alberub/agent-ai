function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function lastTenDigits(phone) {
  const normalized = normalizePhone(phone);
  return normalized.slice(-10);
}

module.exports = {
  normalizePhone,
  lastTenDigits,
};
