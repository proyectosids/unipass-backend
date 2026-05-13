import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const required = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[DB] Falta variable de entorno: ${key}`);
  }
}

const dbSettings = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '0', 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '30000', 10)
  },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
  }
};

export const getConnection = async () => {
  try {
    const pool = new sql.ConnectionPool(dbSettings);
    await pool.connect();
    return pool;
  } catch (error) {
    console.error('❌ Error al conectar con SQL Server:', error.message);
    throw error;
  }
};
