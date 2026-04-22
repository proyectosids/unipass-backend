import sql from 'mssql';

const dbSettings = {
  user: 'sa',
  password: 'Trencole5Q!',      // la misma que usaste al crear el contenedor
  server: 'localhost',           // se conecta al puerto 1433 expuesto
  database: 'UNIPASS',           // debe existir dentro del contenedor
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: false,              // ⚙️ desactiva TLS en entorno local
    trustServerCertificate: true // ✅ necesario en local o contenedor
  }
};

export const getConnection = async () => {
  try {
    const pool = await sql.connect(dbSettings);
    console.log('✅ Conexión exitosa a SQL Server');
    return pool;
  } catch (error) {
    console.error('❌ Error al conectar con SQL Server:', error);
  }
};
