const { Pool } = require("pg");
const {
  databaseUrl,
  dbHost,
  dbUser,
  dbPassword,
  dbName,
  dbPort,
} = require("../config/env");

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
    }
  : {
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
    };

const pool = new Pool(poolConfig);

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
