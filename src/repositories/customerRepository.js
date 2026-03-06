const db = require("../db");
const { normalizePhone, lastTenDigits } = require("../utils/phone");

async function findCustomerWithActiveCreditByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  const phone10 = lastTenDigits(phone);

  const result = await db.query(
    `
      SELECT
        c.id AS cliente_id,
        c.telefono,
        c.nombre,
        cr.id AS credito_id,
        cr.status AS credito_status
      FROM clientes c
      LEFT JOIN creditos cr
        ON cr.cliente_id = c.id
       AND cr.status = 1
      WHERE regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') = $1
         OR right(regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g'), 10) = $2
      ORDER BY cr.id NULLS LAST
      LIMIT 1
    `,
    [normalizedPhone, phone10]
  );

  return result.rows[0] || null;
}

async function getDebtByCreditId(creditoId) {
  const result = await db.query(
    `
      SELECT
        COALESCE(SUM(adeudo), 0) AS adeudo_total,
        COUNT(*)::int AS registros
      FROM detalle_credito
      WHERE credito_id = $1
    `,
    [creditoId]
  );

  return {
    creditoId,
    adeudoTotal: Number(result.rows[0]?.adeudo_total || 0),
    registros: Number(result.rows[0]?.registros || 0),
  };
}

module.exports = {
  findCustomerWithActiveCreditByPhone,
  getDebtByCreditId,
};
