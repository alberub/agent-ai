const db = require("../db");
const { normalizePhone, lastTenDigits } = require("../utils/phone");

function formatDate10(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
}

async function findCustomerWithActiveCreditByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  const phone10 = lastTenDigits(phone);

  const result = await db.query(
    String.raw`
      SELECT
        c.cliente_id,
        c.telefono,
        c.nombre,
        cr.credito_id,
        cr.status AS credito_status
      FROM clientes c
      LEFT JOIN creditos cr
        ON cr.cliente_id = c.cliente_id
       AND cr.status = 1
      WHERE regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') = $1
         OR right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 10) = $2
      ORDER BY
        CASE
          WHEN regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') = $1 THEN 0
          ELSE 1
        END,
        cr.credito_id NULLS LAST
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
        COALESCE(adeudo, 0) AS adeudo_total
      FROM detalle_credito
      WHERE credito_id = $1
    `,
    [creditoId]
  );

  return {
    creditoId,
    adeudoTotal: Number(result.rows[0]?.adeudo_total || 0),
  };
}

async function getCreditSummaryByCreditId(creditoId) {
  const result = await db.query(
    `
      SELECT
        cr.credito_id,
        cr.fecha_inicio,
        cr.plazo_meses,
        cr.tasa_anual,
        cr.enganche,
        cr.costo_terreno,
        cr.lote,
        cr.manzana,
        cr.status,
        cr.id_campestre,
        cr.precio_metro,
        cr.area,
        dc.mensualidad,
        dc.saldo_restante,
        dc.pagos_realizados,
        dc.pagos_vencidos,
        dc.ultimo_pago,
        dc.adeudo,
        dc.proximo_pago,
        dc.estado,
        dc.anualidad_pospuesta,
        dc.tipo_pago_extraordinario,
        dc.fecha_pago_extraordinario,
        dc.monto_pago_extraordinario,
        dc.fecha_pago_extraordinario2,
        dc.monto_pago_extraordinario2
      FROM creditos cr
      LEFT JOIN detalle_credito dc
        ON dc.credito_id = cr.credito_id
      WHERE cr.credito_id = $1
      LIMIT 1
    `,
    [creditoId]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    creditoId: row.credito_id,
    fechaInicio: row.fecha_inicio,
    plazoMeses: Number(row.plazo_meses || 0),
    tasaAnual: Number(row.tasa_anual || 0),
    enganche: Number(row.enganche || 0),
    costoTerreno: Number(row.costo_terreno || 0),
    lote: Number(row.lote || 0),
    manzana: Number(row.manzana || 0),
    status: Number(row.status || 0),
    campestreId: Number(row.id_campestre || 0),
    precioMetro: Number(row.precio_metro || 0),
    area: Number(row.area || 0),
    mensualidad: Number(row.mensualidad || 0),
    saldoRestante: Number(row.saldo_restante || 0),
    pagosRealizados: Number(row.pagos_realizados || 0),
    pagosVencidos: Number(row.pagos_vencidos || 0),
    ultimoPago: row.ultimo_pago,
    adeudo: Number(row.adeudo || 0),
    proximoPago: row.proximo_pago,
    estadoDetalle: Number(row.estado || 0),
    anualidadPospuesta: Boolean(row.anualidad_pospuesta),
    tipoPagoExtraordinario: Number(row.tipo_pago_extraordinario || 0),
    fechaPagoExtraordinario: row.fecha_pago_extraordinario,
    montoPagoExtraordinario: Number(row.monto_pago_extraordinario || 0),
    fechaPagoExtraordinario2: row.fecha_pago_extraordinario2,
    montoPagoExtraordinario2: Number(row.monto_pago_extraordinario2 || 0),
  };
}

async function getAdditionalChargesByCreditId(creditoId) {
  const result = await db.query(
    `
      SELECT
        COALESCE(da.adeudo, 0) AS adeudo_agua,
        COALESCE(dp.adeudo, 0) AS adeudo_predial
      FROM creditos cr
      LEFT JOIN detalle_agua da
        ON da.credito_id = cr.credito_id
      LEFT JOIN detalle_predial dp
        ON dp.credito_id = cr.credito_id
      WHERE cr.credito_id = $1
      LIMIT 1
    `,
    [creditoId]
  );

  const row = result.rows[0];

  return {
    creditoId,
    adeudoAgua: Number(row?.adeudo_agua || 0),
    adeudoPredial: Number(row?.adeudo_predial || 0),
  };
}

async function getCreditPaymentsByCreditId(creditoId, limit = 5) {
  const result = await db.query(
    `
      SELECT
        credito_id,
        fecha_pago,
        abono_cliente
      FROM pagos_credito
      WHERE credito_id = $1
      ORDER BY fecha_pago DESC, id DESC
      LIMIT $2
    `,
    [creditoId, limit]
  );

  const payments = result.rows.map((row) => ({
    creditoId: row.credito_id,
    fechaPago: formatDate10(row.fecha_pago),
    abonoCliente: Number(row.abono_cliente || 0),
  }));

  return {
    creditoId,
    pagos: payments,
    totalPagos: payments.length,
  };
}

module.exports = {
  findCustomerWithActiveCreditByPhone,
  getDebtByCreditId,
  getCreditSummaryByCreditId,
  getAdditionalChargesByCreditId,
  getCreditPaymentsByCreditId,
};
