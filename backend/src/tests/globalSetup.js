import 'dotenv/config';
import { Pool } from 'pg';

// Global setup for Vitest: create and migrate a dedicated test DB, then switch env vars so app uses it.
export default async function() {
  if (process.env.NODE_ENV !== 'test') {
    return async () => {};
  }

  const devDbName = process.env.PGDATABASE || process.env.PGDATABASE_DEV || process.env.DB_DEV_DBNAME || 'qda_dev';
  const testDbName = process.env.TEST_DB_NAME || `${devDbName}_test`;

  // Build base connection (to dev DB) to create test DB if needed
  const baseConfig = {};
  if (process.env.DATABASE_URL) {
    baseConfig.connectionString = process.env.DATABASE_URL;
  } else {
    baseConfig.host = process.env.PGHOST || 'localhost';
    baseConfig.port = process.env.PGPORT ? Number(process.env.PGPORT) : 5432;
    baseConfig.user = process.env.PGUSER || process.env.DB_DEV_USER || 'postgres';
    baseConfig.password = process.env.PGPASSWORD || process.env.DB_DEV_PASSWORD || 'postgres';
    baseConfig.database = devDbName;
  }
  const adminPool = new Pool(baseConfig);

  try {
    // Create test DB if not exists
    const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${testDbName}`);
      console.log(`[test-db] Created database ${testDbName}`);
    } else {
      console.log(`[test-db] Using existing database ${testDbName}`);
    }
  } catch (e) {
    console.error('Failed ensuring test database:', e);
    throw e;
  } finally {
    await adminPool.end().catch(() => {});
  }

  // Point subsequent imports (pool.js) to test DB via env var override; app.init will create base schema and run migrations
  const testPoolConfig = { ...baseConfig, database: testDbName };
  process.env.TEST_DB_NAME = testDbName; // pool.js will prefer this when NODE_ENV=test
  process.env.PGDATABASE = testDbName; // fallback if logic checks PGDATABASE

  console.log(`[test-db] Ready: will use database ${testDbName} for tests`);

  // Teardown: truncate all tables in test DB only
  return async () => {
    try {
      const cleanupPool = new Pool(testPoolConfig);
      const tablesRes = await cleanupPool.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'schema_migrations'
      `);
      const tables = tablesRes.rows.map(r => r.tablename);
      if (tables.length) {
        const sql = `TRUNCATE ${tables.map(t => '"' + t + '"').join(', ')} RESTART IDENTITY CASCADE;`;
        await cleanupPool.query(sql);
        console.log('[test-db] Truncated test DB tables');
      }
      await cleanupPool.end().catch(() => {});
    } catch (e) {
      console.error('Test DB cleanup failed:', e);
    }
  };
}
