const { Pool } = require('pg');

// Use test database when NODE_ENV is test
const getConnectionString = () => {
  if (process.env.NODE_ENV === 'test') {
    return process.env.DATABASE_URL.replace(/\/[^/]+$/, '/stress_less_glass_test');
  }
  return process.env.DATABASE_URL;
};

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.PGSSLMODE && { rejectUnauthorized: false },
});

pool.on('connect', () => {
  if (process.env.NODE_ENV === 'test') {
    console.info('🧪 Test Postgres connected');
  } else {
    console.info('🐘 Postgres connected');
  }
});

module.exports = pool;
