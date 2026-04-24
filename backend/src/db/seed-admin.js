/**
 * seed-admin.js
 *
 * One-time migration script: creates the default admin user and assigns
 * all existing projects to them as owner.
 *
 * Usage: node src/db/seed-admin.js
 *        (from backend/ directory, DATABASE_URL must be set in .env)
 */

import { createRequire } from 'module';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import pool from './pool.js';

dotenv.config({ path: '../../../.env' });
dotenv.config({ path: '../../.env' });
dotenv.config();

const ADMIN_EMAIL    = 'hdz+admin@di.ku.dk';
const ADMIN_PASSWORD = 'password';
const ADMIN_NAME     = 'Admin';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert the admin user
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]);
    let adminId;
    if (existing.rows.length > 0) {
      adminId = existing.rows[0].id;
      console.log(`Admin user already exists: ${adminId}`);
    } else {
      adminId = uuidv4();
      await client.query(
        'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4)',
        [adminId, ADMIN_EMAIL, hash, ADMIN_NAME]
      );
      console.log(`Created admin user: ${adminId}`);
    }

    // Assign all projects without an owner to this admin
    const projects = await client.query('SELECT id FROM projects WHERE owner_id IS NULL');
    for (const { id: projectId } of projects.rows) {
      await client.query(
        'UPDATE projects SET owner_id=$1 WHERE id=$2',
        [adminId, projectId]
      );
      // Add to project_members as owner (ignore if already exists)
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (project_id, user_id) DO UPDATE SET role='owner'`,
        [projectId, adminId]
      );
    }
    console.log(`Migrated ${projects.rows.length} project(s) to admin.`);

    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
