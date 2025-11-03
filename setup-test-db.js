const { Pool } = require('pg');
require('dotenv').config();

const setupTestDatabase = async () => {
  // Connect to postgres database to create test database
  const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/\/[^/]+$/, '/postgres'),
    ssl: process.env.PGSSLMODE && { rejectUnauthorized: false },
  });

  try {
    // Check if test database exists
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'stress_less_glass_test'",
    );

    if (result.rows.length === 0) {
      // Create test database
      await adminPool.query('CREATE DATABASE stress_less_glass_test');
      // eslint-disable-next-line no-console
      console.log('✅ Test database created successfully');
    } else {
      // eslint-disable-next-line no-console
      console.log('✅ Test database already exists');
    }

    // Connect to test database and set up schema
    const testPool = new Pool({
      connectionString: process.env.DATABASE_URL.replace(/\/[^/]+$/, '/stress_less_glass_test'),
      ssl: process.env.PGSSLMODE && { rejectUnauthorized: false },
    });

    // Run setup script on test database
    const setup = require('./data/setup');
    await setup(testPool);
    // eslint-disable-next-line no-console
    console.log('✅ Test database schema set up successfully');

    await testPool.end();
  } catch (error) {
    console.error('❌ Error setting up test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }
};

if (require.main === module) {
  setupTestDatabase()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('✅ Test database setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupTestDatabase;
