const db = require("../db");

async function saveChatMessage({ telefono, role, content }) {
  await db.query(
    `
      INSERT INTO chat_messages (telefono, role, content)
      VALUES ($1, $2, $3)
    `,
    [telefono, role, content]
  );
}

async function getRecentChatMessages(telefono, limit = 12) {
  const result = await db.query(
    `
      SELECT role, content, created_at
      FROM chat_messages
      WHERE telefono = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [telefono, limit]
  );

  return result.rows.reverse();
}

module.exports = {
  saveChatMessage,
  getRecentChatMessages,
};
