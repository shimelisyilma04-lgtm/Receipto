#!/usr/bin/env node

/**
 * Receipto Administrator CLI Tool
 *
 * Promotes a registered user account to Administrator (ADMIN role)
 * directly in the database (PostgreSQL or local JSON storage).
 *
 * Usage:
 *   node scripts/make-admin.mjs <user-email>
 *   npm run make-admin <user-email>
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Pool } = pg;

const emailArg = process.argv[2]?.trim().toLowerCase();

if (!emailArg) {
  console.error('\n❌ Error: Please specify the user email to promote.');
  console.error('Usage: node scripts/make-admin.mjs <email>\n');
  process.exit(1);
}

async function run() {
  console.log(`\n========================================`);
  console.log(`Receipto Administrator Promotion Tool`);
  console.log(`Target: ${emailArg}`);
  console.log(`========================================\n`);

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && !databaseUrl.includes('localhost:5432/placeholder')) {
    console.log('Connecting to PostgreSQL database...');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const client = await pool.connect();
      const checkRes = await client.query('SELECT id, email, name, role FROM users WHERE LOWER(email) = $1', [emailArg]);

      if (checkRes.rows.length === 0) {
        console.error(`❌ User not found with email: ${emailArg}`);
        console.error(`Please register the account first in Receipto, then run this tool.`);
        client.release();
        await pool.end();
        process.exit(1);
      }

      const user = checkRes.rows[0];
      await client.query("UPDATE users SET role = 'ADMIN', updated_at = NOW() WHERE id = $1", [user.id]);
      console.log(`✅ Success! User "${user.name}" (${user.email}) has been promoted to ADMIN role.`);
      client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.warn(`⚠️  PostgreSQL connection unavailable (${err.message}). Checking local persistent store...`);
      await pool.end().catch(() => {});
    }
  }

  console.log('Checking local persistent storage (data/receipto_db.json)...');
  const localDbFile = path.resolve(process.cwd(), 'data', 'receipto_db.json');

  if (!fs.existsSync(localDbFile)) {
    console.error(`❌ Local database file not found at: ${localDbFile}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(localDbFile, 'utf-8');
    const db = JSON.parse(content);

    if (!Array.isArray(db.users)) {
      console.error(`❌ Invalid database format: users array missing.`);
      process.exit(1);
    }

    const user = db.users.find(u => u.email?.toLowerCase() === emailArg);

    if (!user) {
      console.error(`❌ User not found with email: ${emailArg}`);
      console.error(`Registered users in database:`);
      db.users.forEach(u => console.log(`  - ${u.email} (${u.role || 'USER'})`));
      process.exit(1);
    }

    user.role = 'ADMIN';
    user.updated_at = new Date().toISOString();

    fs.writeFileSync(localDbFile, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`✅ Success! User "${user.name}" (${user.email}) has been promoted to ADMIN role in local persistent store.`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ File Error:`, err.message);
    process.exit(1);
  }
}

run();
