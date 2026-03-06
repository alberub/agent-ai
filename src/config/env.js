const dotenv = require("dotenv");

dotenv.config();

const requiredVars = [
  "OPENAI_API_KEY",
  "META_VERIFY_TOKEN",
  "META_PHONE_NUMBER_ID",
  "META_ACCESS_TOKEN",
];

function cleanEnvValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/^'(.*)'$/, "$1").trim();
}

function validateEnv() {
  const missing = requiredVars.filter((key) => !cleanEnvValue(process.env[key]));
  const hasDatabaseUrl = !!cleanEnvValue(process.env.DATABASE_URL);
  const hasSplitDatabaseConfig =
    !!cleanEnvValue(process.env.HOST) &&
    !!cleanEnvValue(process.env.USER) &&
    !!cleanEnvValue(process.env.PASSWORD) &&
    !!cleanEnvValue(process.env.DATABASE);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(", ")}`
    );
  }

  if (!hasDatabaseUrl && !hasSplitDatabaseConfig) {
    throw new Error(
      "Falta configuracion de base de datos. Usa DATABASE_URL o define HOST, USER, PASSWORD y DATABASE."
    );
  }
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  openAiApiKey: cleanEnvValue(process.env.OPENAI_API_KEY),
  openAiModel: cleanEnvValue(process.env.OPENAI_MODEL) || "gpt-4.1-mini",
  databaseUrl: cleanEnvValue(process.env.DATABASE_URL),
  dbHost: cleanEnvValue(process.env.HOST),
  dbUser: cleanEnvValue(process.env.USER),
  dbPassword: cleanEnvValue(process.env.PASSWORD),
  dbName: cleanEnvValue(process.env.DATABASE),
  dbPort: Number(cleanEnvValue(process.env.PORTDB) || 5432),
  metaVerifyToken: cleanEnvValue(process.env.META_VERIFY_TOKEN),
  metaPhoneNumberId: cleanEnvValue(process.env.META_PHONE_NUMBER_ID),
  metaAccessToken: cleanEnvValue(process.env.META_ACCESS_TOKEN),
  validateEnv,
};
