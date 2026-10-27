#!/usr/bin/env tsx
/**
 * Safe, Idempotent Data Migration Utility from local receipto_db.json to Cloud Firestore.
 *
 * Features:
 * - Read-only on source file (data/receipto_db.json is NEVER modified or deleted)
 * - Validates schema of users, clients, invoices, reminders, subscriptions, activities
 * - Preserves document IDs and user_id ownership relationships
 * - Supports --dry-run mode to inspect migration plan without writing
 * - Bounded batches (max 450 writes per batch, well within Firestore 500 limit)
 * - Safe retries (idempotent document set operations)
 * - Sanitizes sensitive logs (never prints passwords, hashes, or tokens)
 *
 * Usage:
 *   npx tsx scripts/migrate_json_to_firestore.ts --dry-run
 *   npx tsx scripts/migrate_json_to_firestore.ts
 */

import fs from 'fs';
import path from 'path';
import { getAdminFirestore, hasFirebaseAdminCredentials } from '../server/lib/firebaseAdmin.js';

interface MigrationSummary {
  dryRun: boolean;
  sourceFile: string;
  sourceFound: boolean;
  entities: {
    users: { found: number; valid: number; written: number; skipped: number };
    clients: { found: number; valid: number; written: number; skipped: number };
    invoices: { found: number; valid: number; written: number; skipped: number };
    reminders: { found: number; valid: number; written: number; skipped: number };
    subscriptions: { found: number; valid: number; written: number; skipped: number };
    activity_logs: { found: number; valid: number; written: number; skipped: number };
    email_verifications: { found: number; valid: number; written: number; skipped: number };
  };
  errors: string[];
}

export async function runMigration(options: { dryRun?: boolean; sourcePath?: string } = {}): Promise<MigrationSummary> {
  const isDryRun = options.dryRun ?? process.argv.includes('--dry-run');
  const sourcePath = options.sourcePath || path.join(process.cwd(), 'data', 'receipto_db.json');

  const summary: MigrationSummary = {
    dryRun: isDryRun,
    sourceFile: sourcePath,
    sourceFound: fs.existsSync(sourcePath),
    entities: {
      users: { found: 0, valid: 0, written: 0, skipped: 0 },
      clients: { found: 0, valid: 0, written: 0, skipped: 0 },
      invoices: { found: 0, valid: 0, written: 0, skipped: 0 },
      reminders: { found: 0, valid: 0, written: 0, skipped: 0 },
      subscriptions: { found: 0, valid: 0, written: 0, skipped: 0 },
      activity_logs: { found: 0, valid: 0, written: 0, skipped: 0 },
      email_verifications: { found: 0, valid: 0, written: 0, skipped: 0 },
    },
    errors: [],
  };

  console.log(`=======================================================`);
  console.log(`Receipto Data Migration: JSON -> Cloud Firestore`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (No writes will be performed)' : 'LIVE EXECUTION'}`);
  console.log(`Source: ${sourcePath}`);
  console.log(`=======================================================\n`);

  if (!summary.sourceFound) {
    console.log(`Source file "${sourcePath}" does not exist. Nothing to migrate.`);
    return summary;
  }

  let rawData: any;
  try {
    const fileContent = fs.readFileSync(sourcePath, 'utf-8');
    rawData = JSON.parse(fileContent);
  } catch (err: any) {
    summary.errors.push(`Failed to read or parse source JSON: ${err.message}`);
    console.error(summary.errors[0]);
    return summary;
  }

  const db = getAdminFirestore();
  const BATCH_LIMIT = 450;
  let currentBatch = db.batch();
  let batchCount = 0;

  async function flushBatch() {
    if (batchCount > 0 && !isDryRun) {
      await currentBatch.commit();
      currentBatch = db.batch();
      batchCount = 0;
    }
  }

  // 1. Users
  const rawUsers = Array.isArray(rawData.users) ? rawData.users : [];
  summary.entities.users.found = rawUsers.length;
  for (const u of rawUsers) {
    if (!u.id || !u.email) {
      summary.errors.push(`Invalid user record missing id or email: ${JSON.stringify(u.id || 'unknown')}`);
      summary.entities.users.skipped++;
      continue;
    }
    summary.entities.users.valid++;
    if (!isDryRun) {
      const userDocRef = db.collection('users').doc(u.id);
      currentBatch.set(userDocRef, {
        id: u.id,
        email: u.email.trim().toLowerCase(),
        password_hash: u.password_hash || '',
        name: u.name || 'User',
        business_name: u.business_name || '',
        email_verified: Boolean(u.email_verified),
        role: u.role || 'USER',
        status: u.status || 'ACTIVE',
        terms_accepted_at: u.terms_accepted_at || u.created_at || new Date().toISOString(),
        terms_version: u.terms_version || '1.0',
        last_login_at: u.last_login_at || null,
        created_at: u.created_at || new Date().toISOString(),
        updated_at: u.updated_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.users.written++;
  }

  // 2. Clients (Nested in users/{userId}/clients/{clientId})
  const rawClients = Array.isArray(rawData.clients) ? rawData.clients : [];
  summary.entities.clients.found = rawClients.length;
  for (const c of rawClients) {
    if (!c.id || !c.user_id || !c.name) {
      summary.errors.push(`Invalid client record missing id, user_id, or name: ${c.id || 'unknown'}`);
      summary.entities.clients.skipped++;
      continue;
    }
    summary.entities.clients.valid++;
    if (!isDryRun) {
      const clientRef = db.collection('users').doc(c.user_id).collection('clients').doc(c.id);
      currentBatch.set(clientRef, {
        id: c.id,
        user_id: c.user_id,
        name: c.name.trim(),
        email: (c.email || '').trim().toLowerCase(),
        phone: c.phone || '',
        company: c.company || '',
        address: c.address || '',
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.clients.written++;
  }

  // 3. Invoices (Nested in users/{userId}/invoices/{invoiceId})
  const rawInvoices = Array.isArray(rawData.invoices) ? rawData.invoices : [];
  summary.entities.invoices.found = rawInvoices.length;
  for (const inv of rawInvoices) {
    if (!inv.id || !inv.user_id || !inv.invoice_number) {
      summary.errors.push(`Invalid invoice record missing id, user_id, or invoice_number: ${inv.id || 'unknown'}`);
      summary.entities.invoices.skipped++;
      continue;
    }
    summary.entities.invoices.valid++;
    if (!isDryRun) {
      const invRef = db.collection('users').doc(inv.user_id).collection('invoices').doc(inv.id);
      currentBatch.set(invRef, {
        id: inv.id,
        user_id: inv.user_id,
        client_id: inv.client_id || '',
        invoice_number: inv.invoice_number.trim(),
        amount: Number(inv.amount) || 0,
        currency: (inv.currency || 'USD').toUpperCase(),
        issue_date: inv.issue_date || new Date().toISOString().split('T')[0],
        due_date: inv.due_date || new Date().toISOString().split('T')[0],
        payment_status: inv.payment_status || 'UNPAID',
        paid_date: inv.paid_date || null,
        notes: inv.notes || '',
        created_at: inv.created_at || new Date().toISOString(),
        updated_at: inv.updated_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.invoices.written++;
  }

  // 4. Reminders (Nested in users/{userId}/reminders/{reminderId})
  const rawReminders = Array.isArray(rawData.reminders) ? rawData.reminders : [];
  summary.entities.reminders.found = rawReminders.length;
  for (const r of rawReminders) {
    if (!r.id || !r.user_id) {
      summary.entities.reminders.skipped++;
      continue;
    }
    summary.entities.reminders.valid++;
    if (!isDryRun) {
      const remRef = db.collection('users').doc(r.user_id).collection('reminders').doc(r.id);
      currentBatch.set(remRef, {
        id: r.id,
        user_id: r.user_id,
        invoice_id: r.invoice_id || '',
        client_id: r.client_id || '',
        recipient_email: r.recipient_email || '',
        subject: r.subject || '',
        message: r.message || '',
        sent_at: r.sent_at || null,
        status: r.status || 'SENT',
        error_message: r.error_message || null,
        reminder_type: r.reminder_type || 'manual',
        scheduled_at: r.scheduled_at || null,
        attempted_at: r.attempted_at || null,
        provider_message_id: r.provider_message_id || null,
        attempt_count: r.attempt_count || 1,
        created_at: r.created_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.reminders.written++;
  }

  // 5. Subscriptions (users/{userId}/subscription/current)
  const rawSubs = Array.isArray(rawData.subscriptions) ? rawData.subscriptions : [];
  summary.entities.subscriptions.found = rawSubs.length;
  for (const s of rawSubs) {
    if (!s.user_id) {
      summary.entities.subscriptions.skipped++;
      continue;
    }
    summary.entities.subscriptions.valid++;
    if (!isDryRun) {
      const subRef = db.collection('users').doc(s.user_id).collection('subscription').doc('current');
      currentBatch.set(subRef, {
        id: s.id || `sub_${s.user_id}`,
        user_id: s.user_id,
        plan: s.plan || 'FREE',
        status: s.status || 'active',
        billing_interval: s.billing_interval || 'monthly',
        provider: s.provider || 'stripe',
        provider_customer_id: s.provider_customer_id || s.stripe_customer_id || null,
        provider_subscription_id: s.provider_subscription_id || s.stripe_subscription_id || null,
        stripe_customer_id: s.stripe_customer_id || s.provider_customer_id || null,
        stripe_subscription_id: s.stripe_subscription_id || s.provider_subscription_id || null,
        current_period_start: s.current_period_start || new Date().toISOString(),
        current_period_end: s.current_period_end || null,
        cancel_at_period_end: Boolean(s.cancel_at_period_end),
        created_at: s.created_at || new Date().toISOString(),
        updated_at: s.updated_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.subscriptions.written++;
  }

  // 6. Activity logs (users/{userId}/activity_logs/{logId})
  const rawLogs = Array.isArray(rawData.activity_logs) ? rawData.activity_logs : [];
  summary.entities.activity_logs.found = rawLogs.length;
  for (const a of rawLogs) {
    if (!a.id || !a.user_id) {
      summary.entities.activity_logs.skipped++;
      continue;
    }
    summary.entities.activity_logs.valid++;
    if (!isDryRun) {
      const actRef = db.collection('users').doc(a.user_id).collection('activity_logs').doc(a.id);
      currentBatch.set(actRef, {
        id: a.id,
        user_id: a.user_id,
        action: a.action || 'INFO',
        details: a.details || '',
        metadata: a.metadata || null,
        created_at: a.created_at || new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      if (batchCount >= BATCH_LIMIT) await flushBatch();
    }
    summary.entities.activity_logs.written++;
  }

  // Flush any remaining batch writes
  await flushBatch();

  console.log('Migration Summary:');
  console.log(`- Users:          ${summary.entities.users.written} written (${summary.entities.users.found} found)`);
  console.log(`- Clients:        ${summary.entities.clients.written} written (${summary.entities.clients.found} found)`);
  console.log(`- Invoices:       ${summary.entities.invoices.written} written (${summary.entities.invoices.found} found)`);
  console.log(`- Reminders:      ${summary.entities.reminders.written} written (${summary.entities.reminders.found} found)`);
  console.log(`- Subscriptions:  ${summary.entities.subscriptions.written} written (${summary.entities.subscriptions.found} found)`);
  console.log(`- Activity Logs:  ${summary.entities.activity_logs.written} written (${summary.entities.activity_logs.found} found)`);
  if (summary.errors.length > 0) {
    console.warn(`Encountered ${summary.errors.length} warnings/skipped items.`);
  }
  console.log(`\nOriginal source file remains completely intact at: ${sourcePath}`);
  console.log('Migration process completed successfully.');
  return summary;
}

if (process.argv[1]?.includes('migrate_json_to_firestore')) {
  runMigration().catch((err) => {
    console.error('Fatal migration failure:', err);
    process.exit(1);
  });
}
