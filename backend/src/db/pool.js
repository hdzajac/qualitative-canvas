import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

export default pool;
