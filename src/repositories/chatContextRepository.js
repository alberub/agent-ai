const db = require("../db");

const fallbackContextStore = new Map();

function defaultContext(telefono) {
  return {
    telefono,
    summary: {},
    lastCreditoId: null,
    lastClienteId: null,
  };
}

function parseSummary(summary) {
  if (!summary) {
    return {};
  }

  if (typeof summary === "object") {
    return summary;
  }

  try {
    return JSON.parse(summary);
  } catch (_error) {
    return {};
  }
}

function cloneForFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

async function getChatContext(telefono) {
  try {
    const result = await db.query(
      `
        SELECT telefono, summary, last_credito_id, last_cliente_id
        FROM chat_context
        WHERE telefono = $1
        LIMIT 1
      `,
      [telefono]
    );

    if (result.rows.length === 0) {
      return fallbackContextStore.get(telefono) || defaultContext(telefono);
    }

    const row = result.rows[0];

    return {
      telefono: row.telefono,
      summary: parseSummary(row.summary),
      lastCreditoId: row.last_credito_id || null,
      lastClienteId: row.last_cliente_id || null,
    };
  } catch (error) {
    if (error.code !== "42P01") {
      throw error;
    }

    return fallbackContextStore.get(telefono) || defaultContext(telefono);
  }
}

async function saveChatContext({
  telefono,
  summary,
  lastCreditoId = null,
  lastClienteId = null,
}) {
  const payload = {
    telefono,
    summary: summary || {},
    lastCreditoId,
    lastClienteId,
  };

  fallbackContextStore.set(telefono, cloneForFallback(payload));

  try {
    await db.query(
      `
        INSERT INTO chat_context (
          telefono,
          summary,
          last_credito_id,
          last_cliente_id,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (telefono)
        DO UPDATE SET
          summary = EXCLUDED.summary,
          last_credito_id = EXCLUDED.last_credito_id,
          last_cliente_id = EXCLUDED.last_cliente_id,
          updated_at = NOW()
      `,
      [
        telefono,
        JSON.stringify(summary || {}),
        lastCreditoId,
        lastClienteId,
      ]
    );
  } catch (error) {
    if (error.code !== "42P01") {
      throw error;
    }
  }
}

async function clearChatContext(telefono) {
  fallbackContextStore.delete(telefono);

  try {
    await db.query(`DELETE FROM chat_context WHERE telefono = $1`, [telefono]);
  } catch (error) {
    if (error.code !== "42P01") {
      throw error;
    }
  }
}

module.exports = {
  getChatContext,
  saveChatContext,
  clearChatContext,
};
