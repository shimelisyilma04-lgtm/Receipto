#!/usr/bin/env node

/**
 * Receipto Administrator CLI Tool
 *
 * Promotes a registered user account to Administrator (ADMIN role).
 *
 * Usage:
 *   node scripts/make-admin.mjs <user-email>
 *   npm run make-admin <user-email>
 */

import fs from 'fs';
import path from 'path';

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

  const localDbFile = path.resolve(process.cwd(), 'data', 'receipto_db.json');

  if (fs.existsSync(localDbFile)) {
    try {
      const content = fs.readFileSync(localDbFile, 'utf-8');
      const db = JSON.parse(content);

      if (Array.isArray(db.users)) {
        const user = db.users.find((u) => u.email?.toLowerCase() === emailArg);

        if (user) {
          user.role = 'ADMIN';
          user.updated_at = new Date().toISOString();
          fs.writeFileSync(localDbFile, JSON.stringify(db, null, 2), 'utf-8');
          console.log(`✅ Success! User "${user.name}" (${user.email}) has been promoted to ADMIN role.`);
          process.exit(0);
        }
      }
    } catch (err) {
      console.warn('Note on store read:', err.message);
    }
  }

  // Also check if user can be configured via ADMIN_EMAIL environment variable
  console.log(`ℹ️ User ${emailArg} will also have permanent administrative privileges when setting:`);
  console.log(`   ADMIN_EMAIL=${emailArg}\n`);
}

run();
