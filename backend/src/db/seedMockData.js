// Seed mock baseline data for development & tests that should NEVER be auto-deleted.
// Run manually or import from an initialization step if needed.
import { v4 as uuidv4 } from 'uuid';
import pool from './pool.js';

export async function seedMockData() {
  // Check if baseline marker project exists
  const markerName = 'Baseline Project';
  const existing = await pool.query('SELECT id FROM projects WHERE name = $1', [markerName]);
  if (existing.rows.length) return { skipped: true };

  const projectId = uuidv4();
  await pool.query('INSERT INTO projects (id, name, description) VALUES ($1,$2,$3)', [projectId, markerName, 'Seeded baseline project']);

  // Create a sample file/document under the baseline project
  const fileId = uuidv4();
  const sampleContent = 'This is a seeded baseline file. It will persist across test runs.';
  await pool.query('INSERT INTO files (id, filename, content, project_id) VALUES ($1,$2,$3,$4)', [fileId, 'baseline.txt', sampleContent, projectId]);

  return { projectId, fileId };
}

// Allow direct execution: `node src/db/seedMockData.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedMockData()
    .then(r => { console.log('Seed mock data complete', r); process.exit(0); })
    .catch(e => { console.error('Seed mock data failed', e); process.exit(1); });
}
