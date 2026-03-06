const express = require("express");
const { port, validateEnv } = require("./config/env");
const db = require("./db");
const webhookRouter = require("./routes/webhook");

validateEnv();

const app = express();

app.use(express.json());
app.use(webhookRouter);

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
