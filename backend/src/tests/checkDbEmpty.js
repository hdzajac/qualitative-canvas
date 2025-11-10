import 'dotenv/config';
import pool from '../db/pool.js';

async function main() {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[checkDbEmpty] Skipped (NODE_ENV not test)');
    return;
  }
  const tables = [
    'projects','files','codes','themes','insights','annotations',
    'media_files','transcription_jobs','participants','transcript_segments','transcripts_finalized'
  ];
  try {
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      if (r.rows[0].c !== 0) {
        throw new Error(`Table ${t} not empty after tests (count=${r.rows[0].c}).`);
      }
    }
    console.log('[checkDbEmpty] All target tables empty after tests.');
  } catch (e) {
    console.error('[checkDbEmpty] Failure:', e.message);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

main();
