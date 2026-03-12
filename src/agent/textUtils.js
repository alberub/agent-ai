function normalizeUserText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
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

  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");

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

function compareYearMonth(dateA, dateB) {
  return String(dateA || "").slice(0, 7) === String(dateB || "").slice(0, 7);
}

module.exports = {
  normalizeUserText,
  getCurrentDateInMexico,
  formatSpanishDate,
  formatMoney,
  compareYearMonth,
};
