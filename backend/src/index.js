import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Database setup
const databaseUrl = process.env.DATABASE_URL;
let pool = null;
if (databaseUrl) {
  pool = new Pool({ connectionString: databaseUrl });
  pool.on('error', (err) => {
    console.error('Unexpected PG pool error', err);
  });
}

app.get('/api/health', async (req, res) => {
  try {
    let dbOk = false;
    if (pool) {
      const r = await pool.query('SELECT 1 as ok');
      dbOk = r?.rows?.[0]?.ok === 1;
    }
    res.json({ ok: true, dbOk });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Placeholder routes matching frontend expectations
app.get('/api/files', (req, res) => res.json([]));
app.post('/api/files', (req, res) => res.status(201).json({ ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() }));
app.get('/api/highlights', (req, res) => res.json([]));
app.get('/api/themes', (req, res) => res.json([]));
app.get('/api/insights', (req, res) => res.json([]));
app.get('/api/annotations', (req, res) => res.json([]));

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
