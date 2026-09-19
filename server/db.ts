import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  User,
  Session,
  Client,
  Invoice,
  Reminder,
  ActivityLog,
  DashboardStats,
  PaymentStatus,
  EmailVerification,
  Subscription,
  SubscriptionUsage,
  PlanTier,
  SubscriptionStatus,
  BillingInterval,
  SubscriptionProvider,
} from './types.js';
import {
  PLAN_CONFIGS,
  getEffectivePlan,
  isPaidSubscriptionActive,
  type PlanFeatures,
  type PlanConfig,
} from './plans.js';
import { isStripeConfigured } from './stripe.js';

const { Pool } = pg;

// Database connection state
let pool: pg.Pool | null = null;
let isPostgres = false;
let dbInitialized = false;

// Data directory for local fallback persistence
const DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'receipto_db.json');

interface LocalStore {
  users: User[];
  sessions: Session[];
  clients: Client[];
  invoices: Invoice[];
  reminders: Reminder[];
  activity_logs: ActivityLog[];
  email_verifications: EmailVerification[];
  subscriptions: Subscription[];
  processed_webhook_events: { id: string; event_type: string; processed_at: string }[];
}

let memoryStore: LocalStore = {
  users: [],
  sessions: [],
  clients: [],
  invoices: [],
  reminders: [],
  activity_logs: [],
  email_verifications: [],
  subscriptions: [],
  processed_webhook_events: [],
};

// Ensure local persistent store exists
function loadLocalStore(): LocalStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const targetFile = fs.existsSync(LOCAL_DB_FILE) ? LOCAL_DB_FILE : null;

    if (targetFile) {
      const data = fs.readFileSync(targetFile, 'utf-8');
      const parsed = JSON.parse(data);
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

      return {
        users: Array.isArray(parsed.users) ? parsed.users.map((u: any) => {
          const cleanEmail = (u.email || '').replace(/@invoicepilot\.test/g, '@receipto.test');
          const isConfiguredAdmin = adminEmail && cleanEmail.toLowerCase() === adminEmail;
          return {
            ...u,
            email: cleanEmail,
            email_verified: Boolean(u.email_verified),
            role: (isConfiguredAdmin ? 'ADMIN' : (u.role || 'USER')) as import('./types.js').UserRole,
            status: (u.status || 'ACTIVE') as import('./types.js').UserStatus,
            terms_accepted_at: u.terms_accepted_at || null,
            terms_version: u.terms_version || '1.0',
            last_login_at: u.last_login_at || null,
          };
        }) : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        clients: Array.isArray(parsed.clients) ? parsed.clients : [],
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        activity_logs: Array.isArray(parsed.activity_logs) ? parsed.activity_logs.map((a: any) => ({
          ...a,
          details: typeof a.details === 'string' ? a.details.replace(/@invoicepilot\.test/g, '@receipto.test') : a.details,
          metadata: a.metadata ? JSON.parse(JSON.stringify(a.metadata).replace(/@invoicepilot\.test/g, '@receipto.test')) : undefined,
        })) : [],
        email_verifications: Array.isArray(parsed.email_verifications) ? parsed.email_verifications : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        processed_webhook_events: Array.isArray(parsed.processed_webhook_events) ? parsed.processed_webhook_events : [],
      };
    }
  } catch (err) {
    console.error('Error loading local persistent store:', err);
  }
  return {
    users: [],
    sessions: [],
    clients: [],
    invoices: [],
    reminders: [],
    activity_logs: [],
    email_verifications: [],
    subscriptions: [],
    processed_webhook_events: [],
  };
}

function saveLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${LOCAL_DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(memoryStore, null, 2), 'utf-8');
    fs.renameSync(tempFile, LOCAL_DB_FILE);
  } catch (err) {
    console.error('Error saving local persistent store:', err);
  }
}

export function reloadLocalStore() {
  if (!isPostgres) {
    memoryStore = loadLocalStore();
  }
}

// Check and normalize overdue invoices dynamically based on current date
export function computeInvoiceStatus(invoice: Invoice, todayStr?: string): PaymentStatus {
  if (invoice.payment_status === 'PAID') return 'PAID';
  if (invoice.payment_status === 'CANCELLED') return 'CANCELLED';

  const today = todayStr || new Date().toISOString().split('T')[0];
  if (invoice.due_date < today) {
    return 'OVERDUE';
  }
  return 'UNPAID';
}

// Initialize database schema
export async function initDatabase(): Promise<{ success: boolean; engine: 'postgres' | 'local_persistent'; error?: string }> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    try {
      const useSsl = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create Users Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            business_name TEXT,
            email_verified BOOLEAN NOT NULL DEFAULT FALSE,
            terms_accepted_at TIMESTAMPTZ,
            terms_version TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
          CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        `);

        if (process.env.ADMIN_EMAIL) {
          await client.query(
            `UPDATE users SET role = 'ADMIN' WHERE LOWER(email) = LOWER($1)`,
            [process.env.ADMIN_EMAIL.trim()]
          );
        }

        // Create Sessions Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
        `);

        // Create Clients Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            company TEXT,
            address TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
          CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(user_id, email);
        `);

        // Create Invoices Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            invoice_number TEXT NOT NULL,
            amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
            currency TEXT NOT NULL DEFAULT 'USD',
            issue_date DATE NOT NULL,
            due_date DATE NOT NULL,
            payment_status TEXT NOT NULL DEFAULT 'UNPAID',
            paid_date TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_user_invoice_number UNIQUE (user_id, invoice_number)
          );
          CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
          CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
          CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(user_id, due_date);
          CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, payment_status);
        `);

        // Create Reminders Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            recipient_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status TEXT NOT NULL DEFAULT 'SENT',
            error_message TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
          CREATE INDEX IF NOT EXISTS idx_reminders_invoice_id ON reminders(invoice_id);
        `);

        // Create Activity Logs Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(user_id, created_at DESC);
        `);

        // Create Email Verifications Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS email_verifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            used_at TIMESTAMPTZ,
            purpose TEXT NOT NULL DEFAULT 'email_verification',
            resend_count INTEGER NOT NULL DEFAULT 0,
            last_resend_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_verif_user_id ON email_verifications(user_id);
          CREATE INDEX IF NOT EXISTS idx_verif_email ON email_verifications(email);
          CREATE INDEX IF NOT EXISTS idx_verif_active ON email_verifications(user_id, used_at, expires_at);
        `);

        // Create Subscriptions Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan TEXT NOT NULL DEFAULT 'FREE',
            status TEXT NOT NULL DEFAULT 'active',
            billing_interval TEXT NOT NULL DEFAULT 'monthly',
            provider TEXT NOT NULL DEFAULT 'manual',
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(provider_customer_id);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_sub_id ON subscriptions(provider_subscription_id);
        `);

        // Create Processed Webhook Events Table (for webhook idempotency)
        await client.query(`
          CREATE TABLE IF NOT EXISTS processed_webhook_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON processed_webhook_events(id);
        `);

        await client.query('COMMIT');
        isPostgres = true;
        dbInitialized = true;
        console.log('[Database] Connected to PostgreSQL/Supabase and initialized schema successfully.');
        return { success: true, engine: 'postgres' };
      } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[Database] Failed to connect to PostgreSQL with DATABASE_URL:', err.message);
      console.warn('[Database] Falling back to local persistent file store for high availability.');
    }
  } else {
    console.log('[Database] DATABASE_URL not set or not postgresql. Using local persistent storage in ./data/receipto_db.json.');
  }

  // Local persistent fallback
  memoryStore = loadLocalStore();
  isPostgres = false;
  dbInitialized = true;
  return { success: true, engine: 'local_persistent' };
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  engine: 'postgres' | 'local_persistent';
  details?: string;
}> {
  if (isPostgres && pool) {
    try {
      const res = await pool.query('SELECT 1 as alive');
      return { connected: res.rows.length > 0, engine: 'postgres' };
    } catch (err: any) {
      return { connected: false, engine: 'postgres', details: err.message };
    }
  }
  return { connected: true, engine: 'local_persistent', details: 'Local disk-backed atomic store active' };
}

// User methods
export async function getUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
    return res.rows[0] || null;
  }
  return memoryStore.users.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] || null;
  }
  return memoryStore.users.find(u => u.id === id) || null;
}

export async function createUser(data: {
  email: string;
  password_hash: string;
  name: string;
  business_name?: string;
  email_verified?: boolean;
  role?: import('./types.js').UserRole;
  status?: import('./types.js').UserStatus;
  terms_accepted_at?: string;
  terms_version?: string;
}): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanEmail = data.email.trim().toLowerCase();
  const isVerified = Boolean(data.email_verified ?? false);
  const termsAcceptedAt = data.terms_accepted_at || null;
  const termsVersion = data.terms_version || '1.0';

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const assignedRole: import('./types.js').UserRole =
    (adminEmail && cleanEmail === adminEmail)
      ? 'ADMIN'
      : (data.role || 'USER');
  const assignedStatus: import('./types.js').UserStatus = data.status || 'ACTIVE';

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, business_name, email_verified, role, status, terms_accepted_at, terms_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, cleanEmail, data.password_hash, data.name.trim(), data.business_name?.trim() || null, isVerified, assignedRole, assignedStatus, termsAcceptedAt, termsVersion, now, now]
    );
    return res.rows[0];
  }

  const newUser: User = {
    id,
    email: cleanEmail,
    password_hash: data.password_hash,
    name: data.name.trim(),
    business_name: data.business_name?.trim(),
    email_verified: isVerified,
    role: assignedRole,
    status: assignedStatus,
    terms_accepted_at: termsAcceptedAt || undefined,
    terms_version: termsVersion,
    last_login_at: undefined,
    created_at: now,
    updated_at: now,
  };
  memoryStore.users.push(newUser);
  saveLocalStore();
  return newUser;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [now, userId]);
    return;
  }
  const user = memoryStore.users.find(u => u.id === userId);
  if (user) {
    user.last_login_at = now;
    saveLocalStore();
  }
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    const res = await pool.query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [passwordHash, now, userId]);
    return (res.rowCount ?? 0) > 0;
  }
  const user = memoryStore.users.find(u => u.id === userId);
  if (user) {
    user.password_hash = passwordHash;
    user.updated_at = now;
    saveLocalStore();
    return true;
  }
  return false;
}

export async function updateUserProfile(userId: string, data: { name?: string; business_name?: string }): Promise<User | null> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           business_name = COALESCE($2, business_name),
           updated_at = $3
       WHERE id = $4
       RETURNING *`,
      [data.name?.trim() || null, data.business_name !== undefined ? data.business_name.trim() : null, now, userId]
    );
    return res.rows[0] || null;
  }
  const user = memoryStore.users.find(u => u.id === userId);
  if (user) {
    if (data.name) user.name = data.name.trim();
    if (data.business_name !== undefined) user.business_name = data.business_name.trim();
    user.updated_at = now;
    saveLocalStore();
    return user;
  }
  return null;
}

export async function updateUserEmail(userId: string, newEmail: string): Promise<boolean> {
  const cleanEmail = newEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    const res = await pool.query('UPDATE users SET email = $1, updated_at = $2 WHERE id = $3', [cleanEmail, now, userId]);
    return (res.rowCount ?? 0) > 0;
  }
  const user = memoryStore.users.find(u => u.id === userId);
  if (user) {
    user.email = cleanEmail;
    user.updated_at = now;
    saveLocalStore();
    return true;
  }
  return false;
}

// Session methods
export async function createSession(userId: string, token: string, expiresAt: Date): Promise<Session> {
  const now = new Date().toISOString();
  const expIso = expiresAt.toISOString();

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [token, userId, expIso, now]
    );
    return res.rows[0];
  }

  const session: Session = {
    id: token,
    user_id: userId,
    expires_at: expIso,
    created_at: now,
  };
  memoryStore.sessions.push(session);
  saveLocalStore();
  return session;
}

export async function getSession(token: string): Promise<(Session & { user: User }) | null> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    const res = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, s.created_at,
              u.id as u_id, u.email, u.name, u.business_name, u.email_verified, u.role, u.status, u.last_login_at, u.terms_accepted_at, u.terms_version, u.created_at as u_created_at, u.updated_at as u_updated_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.expires_at > $2
       LIMIT 1`,
      [token, now]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      created_at: row.created_at,
      user: {
        id: row.u_id,
        email: row.email,
        password_hash: '', // never return
        name: row.name,
        business_name: row.business_name,
        email_verified: Boolean(row.email_verified),
        role: row.role || 'USER',
        status: row.status || 'ACTIVE',
        last_login_at: row.last_login_at || null,
        terms_accepted_at: row.terms_accepted_at,
        terms_version: row.terms_version,
        created_at: row.u_created_at,
        updated_at: row.u_updated_at || row.u_created_at,
      },
    };
  }

  const session = memoryStore.sessions.find(s => s.id === token && s.expires_at > now);
  if (!session) return null;
  const user = memoryStore.users.find(u => u.id === session.user_id);
  if (!user) return null;

  return {
    ...session,
    user: {
      ...user,
      email_verified: Boolean(user.email_verified),
      password_hash: '',
    },
  };
}

export async function deleteSession(token: string): Promise<void> {
  if (isPostgres && pool) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
    return;
  }
  memoryStore.sessions = memoryStore.sessions.filter(s => s.id !== token);
  saveLocalStore();
}

export async function deleteUserSessions(userId: string): Promise<void> {
  if (isPostgres && pool) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return;
  }
  memoryStore.sessions = memoryStore.sessions.filter(s => s.user_id !== userId);
  saveLocalStore();
}

// ==========================================
// Email Verification methods
// ==========================================
export async function createEmailVerification(data: {
  user_id: string;
  email: string;
  otp_hash: string;
  salt: string;
  expires_at: string;
  purpose?: 'email_verification';
}): Promise<EmailVerification> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const purpose = data.purpose || 'email_verification';
  const cleanEmail = data.email.trim().toLowerCase();

  if (isPostgres && pool) {
    // Invalidate previous active OTPs for this user & purpose
    await pool.query(
      `UPDATE email_verifications
       SET used_at = 'SUPERSEDED'
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [data.user_id, purpose]
    );

    const res = await pool.query(
      `INSERT INTO email_verifications (id, user_id, email, otp_hash, salt, created_at, expires_at, attempt_count, used_at, purpose, resend_count, last_resend_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NULL, $8, 0, $9)
       RETURNING *`,
      [id, data.user_id, cleanEmail, data.otp_hash, data.salt, now, data.expires_at, purpose, now]
    );
    return res.rows[0];
  }

  // Local persistent store
  memoryStore.email_verifications.forEach(v => {
    if (v.user_id === data.user_id && v.purpose === purpose && !v.used_at) {
      v.used_at = 'SUPERSEDED';
    }
  });

  const record: EmailVerification = {
    id,
    user_id: data.user_id,
    email: cleanEmail,
    otp_hash: data.otp_hash,
    salt: data.salt,
    created_at: now,
    expires_at: data.expires_at,
    attempt_count: 0,
    used_at: null,
    purpose,
    resend_count: 0,
    last_resend_at: now,
  };

  memoryStore.email_verifications.push(record);
  saveLocalStore();
  return record;
}

export async function getLatestEmailVerification(userId: string, purpose = 'email_verification'): Promise<EmailVerification | null> {
  if (isPostgres && pool) {
    const res = await pool.query(
      `SELECT * FROM email_verifications
       WHERE user_id = $1 AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, purpose]
    );
    return res.rows[0] || null;
  }

  reloadLocalStore();
  const matches = memoryStore.email_verifications
    .filter(v => v.user_id === userId && v.purpose === purpose)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return matches[0] || null;
}

export async function recordVerificationAttempt(id: string): Promise<{ attempt_count: number }> {
  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE email_verifications
       SET attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING attempt_count`,
      [id]
    );
    return { attempt_count: res.rows[0]?.attempt_count ?? 1 };
  }

  const record = memoryStore.email_verifications.find(v => v.id === id);
  if (record) {
    record.attempt_count = (record.attempt_count || 0) + 1;
    saveLocalStore();
    return { attempt_count: record.attempt_count };
  }
  return { attempt_count: 1 };
}

export async function markVerificationUsed(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query(
      `UPDATE email_verifications
       SET used_at = $1
       WHERE id = $2`,
      [now, id]
    );
    return;
  }

  const record = memoryStore.email_verifications.find(v => v.id === id);
  if (record) {
    record.used_at = now;
    saveLocalStore();
  }
}

export async function invalidateVerification(id: string, reason = 'INVALIDATED'): Promise<void> {
  if (isPostgres && pool) {
    await pool.query(
      `UPDATE email_verifications
       SET used_at = $1
       WHERE id = $2`,
      [reason, id]
    );
    return;
  }

  const record = memoryStore.email_verifications.find(v => v.id === id);
  if (record) {
    record.used_at = reason;
    saveLocalStore();
  }
}

export async function updateVerificationResend(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query(
      `UPDATE email_verifications
       SET resend_count = resend_count + 1, last_resend_at = $1
       WHERE id = $2`,
      [now, id]
    );
    return;
  }

  const record = memoryStore.email_verifications.find(v => v.id === id);
  if (record) {
    record.resend_count = (record.resend_count || 0) + 1;
    record.last_resend_at = now;
    saveLocalStore();
  }
}

export async function setUserEmailVerified(userId: string, verified = true): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query(
      `UPDATE users
       SET email_verified = $1, updated_at = $2
       WHERE id = $3`,
      [verified, now, userId]
    );
    return;
  }

  const user = memoryStore.users.find(u => u.id === userId);
  if (user) {
    user.email_verified = verified;
    user.updated_at = now;
    saveLocalStore();
  }
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  if (isPostgres && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM invoices WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM reminders WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM clients WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM activity_logs WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      const res = await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Local persistent cascade deletion
  memoryStore.invoices = memoryStore.invoices.filter(i => i.user_id !== userId);
  memoryStore.reminders = memoryStore.reminders.filter(r => r.user_id !== userId);
  memoryStore.clients = memoryStore.clients.filter(c => c.user_id !== userId);
  memoryStore.activity_logs = memoryStore.activity_logs.filter(a => a.user_id !== userId);
  memoryStore.email_verifications = memoryStore.email_verifications.filter(v => v.user_id !== userId);
  memoryStore.sessions = memoryStore.sessions.filter(s => s.user_id !== userId);
  const initialLen = memoryStore.users.length;
  memoryStore.users = memoryStore.users.filter(u => u.id !== userId);
  saveLocalStore();
  return memoryStore.users.length < initialLen;
}

// Client methods
export async function getClients(userId: string): Promise<Client[]> {
  if (isPostgres && pool) {
    const res = await pool.query(
      'SELECT * FROM clients WHERE user_id = $1 ORDER BY name ASC',
      [userId]
    );
    return res.rows;
  }
  return memoryStore.clients
    .filter(c => c.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientById(userId: string, clientId: string): Promise<Client | null> {
  if (isPostgres && pool) {
    const res = await pool.query(
      'SELECT * FROM clients WHERE user_id = $1 AND id = $2 LIMIT 1',
      [userId, clientId]
    );
    return res.rows[0] || null;
  }
  return memoryStore.clients.find(c => c.user_id === userId && c.id === clientId) || null;
}

export async function createClient(userId: string, data: { name: string; email: string; phone?: string; company?: string; address?: string }): Promise<Client> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO clients (id, user_id, name, email, phone, company, address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, userId, data.name.trim(), data.email.trim().toLowerCase(), data.phone?.trim() || null, data.company?.trim() || null, data.address?.trim() || null, now, now]
    );
    return res.rows[0];
  }

  const client: Client = {
    id,
    user_id: userId,
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone?.trim(),
    company: data.company?.trim(),
    address: data.address?.trim(),
    created_at: now,
    updated_at: now,
  };
  memoryStore.clients.push(client);
  saveLocalStore();
  return client;
}

export async function updateClient(userId: string, clientId: string, data: { name?: string; email?: string; phone?: string; company?: string; address?: string }): Promise<Client | null> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE clients
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           company = COALESCE($4, company),
           address = COALESCE($5, address),
           updated_at = $6
       WHERE user_id = $7 AND id = $8
       RETURNING *`,
      [data.name?.trim() || null, data.email?.trim().toLowerCase() || null, data.phone?.trim() || null, data.company?.trim() || null, data.address?.trim() || null, now, userId, clientId]
    );
    return res.rows[0] || null;
  }

  const client = memoryStore.clients.find(c => c.user_id === userId && c.id === clientId);
  if (!client) return null;
  if (data.name) client.name = data.name.trim();
  if (data.email) client.email = data.email.trim().toLowerCase();
  if (data.phone !== undefined) client.phone = data.phone?.trim();
  if (data.company !== undefined) client.company = data.company?.trim();
  if (data.address !== undefined) client.address = data.address?.trim();
  client.updated_at = now;
  saveLocalStore();
  return client;
}

export async function deleteClient(userId: string, clientId: string): Promise<boolean> {
  if (isPostgres && pool) {
    const res = await pool.query('DELETE FROM clients WHERE user_id = $1 AND id = $2', [userId, clientId]);
    return (res.rowCount ?? 0) > 0;
  }

  const idx = memoryStore.clients.findIndex(c => c.user_id === userId && c.id === clientId);
  if (idx === -1) return false;
  memoryStore.clients.splice(idx, 1);
  // Cascade delete invoices and reminders
  const invIds = memoryStore.invoices.filter(i => i.client_id === clientId && i.user_id === userId).map(i => i.id);
  memoryStore.invoices = memoryStore.invoices.filter(i => !(i.client_id === clientId && i.user_id === userId));
  memoryStore.reminders = memoryStore.reminders.filter(r => !invIds.includes(r.invoice_id));
  saveLocalStore();
  return true;
}

// Invoice methods
export async function getInvoices(
  userId: string,
  options?: { status?: string; clientId?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }
): Promise<Invoice[]> {
  const today = new Date().toISOString().split('T')[0];

  if (isPostgres && pool) {
    let sql = `
      SELECT i.*, c.name as client_name, c.email as client_email, c.company as client_company
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.user_id = $1
    `;
    const params: any[] = [userId];

    if (options?.clientId) {
      params.push(options.clientId);
      sql += ` AND i.client_id = $${params.length}`;
    }

    if (options?.search) {
      params.push(`%${options.search.toLowerCase()}%`);
      sql += ` AND (LOWER(i.invoice_number) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length} OR LOWER(c.company) LIKE $${params.length})`;
    }

    sql += ` ORDER BY i.due_date ASC, i.created_at DESC`;

    const res = await pool.query(sql, params);
    let invoices: Invoice[] = res.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: computeInvoiceStatus({
        ...r,
        due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      }, today),
    }));

    if (options?.status && options.status !== 'ALL') {
      invoices = invoices.filter(i => i.payment_status === options.status);
    }

    return invoices;
  }

  // Local store
  const clientMap = new Map(memoryStore.clients.map(c => [c.id, c]));
  let list = memoryStore.invoices
    .filter(i => i.user_id === userId)
    .map(i => {
      const c = clientMap.get(i.client_id);
      return {
        ...i,
        client_name: c?.name || 'Unknown Client',
        client_email: c?.email || '',
        client_company: c?.company || '',
        payment_status: computeInvoiceStatus(i, today),
      };
    });

  if (options?.clientId) {
    list = list.filter(i => i.client_id === options.clientId);
  }

  if (options?.status && options.status !== 'ALL') {
    list = list.filter(i => i.payment_status === options.status);
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    list = list.filter(i =>
      i.invoice_number.toLowerCase().includes(q) ||
      (i.client_name && i.client_name.toLowerCase().includes(q)) ||
      (i.client_company && i.client_company.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return list;
}

export async function getInvoiceById(userId: string, invoiceId: string): Promise<Invoice | null> {
  const today = new Date().toISOString().split('T')[0];

  if (isPostgres && pool) {
    const res = await pool.query(
      `SELECT i.*, c.name as client_name, c.email as client_email, c.company as client_company, c.address as client_address, c.phone as client_phone
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       WHERE i.user_id = $1 AND i.id = $2
       LIMIT 1`,
      [userId, invoiceId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const dueDateStr = typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0];
    const issueDateStr = typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: issueDateStr,
      due_date: dueDateStr,
      payment_status: computeInvoiceStatus({ ...r, due_date: dueDateStr }, today),
    };
  }

  const invoice = memoryStore.invoices.find(i => i.user_id === userId && i.id === invoiceId);
  if (!invoice) return null;
  const client = memoryStore.clients.find(c => c.id === invoice.client_id);
  return {
    ...invoice,
    client_name: client?.name,
    client_email: client?.email,
    client_company: client?.company,
    payment_status: computeInvoiceStatus(invoice, today),
  };
}

export async function getInvoiceByNumber(userId: string, invoiceNumber: string): Promise<Invoice | null> {
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM invoices WHERE user_id = $1 AND LOWER(invoice_number) = LOWER($2) LIMIT 1', [userId, invoiceNumber.trim()]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: computeInvoiceStatus(r),
    };
  }
  return memoryStore.invoices.find(i => i.user_id === userId && i.invoice_number.toLowerCase() === invoiceNumber.trim().toLowerCase()) || null;
}

export async function createInvoice(
  userId: string,
  data: {
    client_id: string;
    invoice_number: string;
    amount: number;
    currency?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
  }
): Promise<Invoice> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const currency = data.currency || 'USD';
  const today = now.split('T')[0];
  const initialStatus: PaymentStatus = data.due_date < today ? 'OVERDUE' : 'UNPAID';

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO invoices (id, user_id, client_id, invoice_number, amount, currency, issue_date, due_date, payment_status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, userId, data.client_id, data.invoice_number.trim(), data.amount, currency, data.issue_date, data.due_date, initialStatus, data.notes?.trim() || null, now, now]
    );
    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: computeInvoiceStatus(r, today),
    };
  }

  const invoice: Invoice = {
    id,
    user_id: userId,
    client_id: data.client_id,
    invoice_number: data.invoice_number.trim(),
    amount: data.amount,
    currency,
    issue_date: data.issue_date,
    due_date: data.due_date,
    payment_status: initialStatus,
    paid_date: null,
    notes: data.notes?.trim(),
    created_at: now,
    updated_at: now,
  };
  memoryStore.invoices.push(invoice);
  saveLocalStore();
  return invoice;
}

export async function updateInvoice(
  userId: string,
  invoiceId: string,
  data: {
    client_id?: string;
    invoice_number?: string;
    amount?: number;
    currency?: string;
    issue_date?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<Invoice | null> {
  const existing = await getInvoiceById(userId, invoiceId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE invoices
       SET client_id = COALESCE($1, client_id),
           invoice_number = COALESCE($2, invoice_number),
           amount = COALESCE($3, amount),
           currency = COALESCE($4, currency),
           issue_date = COALESCE($5, issue_date),
           due_date = COALESCE($6, due_date),
           notes = COALESCE($7, notes),
           updated_at = $8
       WHERE user_id = $9 AND id = $10
       RETURNING *`,
      [
        data.client_id || null,
        data.invoice_number?.trim() || null,
        data.amount !== undefined ? data.amount : null,
        data.currency || null,
        data.issue_date || null,
        data.due_date || null,
        data.notes !== undefined ? data.notes.trim() : null,
        now,
        userId,
        invoiceId,
      ]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: computeInvoiceStatus(r, today),
    };
  }

  const inv = memoryStore.invoices.find(i => i.user_id === userId && i.id === invoiceId);
  if (!inv) return null;
  if (data.client_id) inv.client_id = data.client_id;
  if (data.invoice_number) inv.invoice_number = data.invoice_number.trim();
  if (data.amount !== undefined) inv.amount = data.amount;
  if (data.currency) inv.currency = data.currency;
  if (data.issue_date) inv.issue_date = data.issue_date;
  if (data.due_date) inv.due_date = data.due_date;
  if (data.notes !== undefined) inv.notes = data.notes.trim();
  inv.updated_at = now;
  saveLocalStore();
  return {
    ...inv,
    payment_status: computeInvoiceStatus(inv, today),
  };
}

export async function markInvoicePaid(userId: string, invoiceId: string, paidDate?: string): Promise<Invoice | null> {
  const existing = await getInvoiceById(userId, invoiceId);
  if (!existing) return null;

  if (existing.payment_status === 'CANCELLED') {
    throw new Error('Cannot mark a cancelled invoice as paid.');
  }

  const now = new Date().toISOString();
  const effectivePaidDate = paidDate || now;

  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE invoices
       SET payment_status = 'PAID',
           paid_date = $1,
           updated_at = $2
       WHERE user_id = $3 AND id = $4
       RETURNING *`,
      [effectivePaidDate, now, userId, invoiceId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: 'PAID',
    };
  }

  const inv = memoryStore.invoices.find(i => i.user_id === userId && i.id === invoiceId);
  if (!inv) return null;
  inv.payment_status = 'PAID';
  inv.paid_date = effectivePaidDate;
  inv.updated_at = now;
  saveLocalStore();
  return inv;
}

export async function cancelInvoice(userId: string, invoiceId: string): Promise<Invoice | null> {
  const existing = await getInvoiceById(userId, invoiceId);
  if (!existing) return null;

  if (existing.payment_status === 'PAID') {
    throw new Error('Cannot cancel a paid invoice.');
  }

  const now = new Date().toISOString();

  if (isPostgres && pool) {
    const res = await pool.query(
      `UPDATE invoices
       SET payment_status = 'CANCELLED',
           updated_at = $1
       WHERE user_id = $2 AND id = $3
       RETURNING *`,
      [now, userId, invoiceId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount),
      issue_date: typeof r.issue_date === 'string' ? r.issue_date.split('T')[0] : r.issue_date.toISOString().split('T')[0],
      due_date: typeof r.due_date === 'string' ? r.due_date.split('T')[0] : r.due_date.toISOString().split('T')[0],
      payment_status: 'CANCELLED',
    };
  }

  const inv = memoryStore.invoices.find(i => i.user_id === userId && i.id === invoiceId);
  if (!inv) return null;
  inv.payment_status = 'CANCELLED';
  inv.updated_at = now;
  saveLocalStore();
  return inv;
}

export async function deleteInvoice(userId: string, invoiceId: string): Promise<boolean> {
  if (isPostgres && pool) {
    const res = await pool.query('DELETE FROM invoices WHERE user_id = $1 AND id = $2', [userId, invoiceId]);
    return (res.rowCount ?? 0) > 0;
  }

  const idx = memoryStore.invoices.findIndex(i => i.user_id === userId && i.id === invoiceId);
  if (idx === -1) return false;
  memoryStore.invoices.splice(idx, 1);
  memoryStore.reminders = memoryStore.reminders.filter(r => r.invoice_id !== invoiceId);
  saveLocalStore();
  return true;
}

// Reminders
export async function createReminder(
  userId: string,
  data: {
    invoice_id: string;
    client_id: string;
    recipient_email: string;
    subject: string;
    message: string;
    status: 'SENT' | 'FAILED' | 'CONFIG_REQUIRED';
    error_message?: string;
  }
): Promise<Reminder> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO reminders (id, user_id, invoice_id, client_id, recipient_email, subject, message, sent_at, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, userId, data.invoice_id, data.client_id, data.recipient_email, data.subject, data.message, now, data.status, data.error_message || null]
    );
    return res.rows[0];
  }

  const reminder: Reminder = {
    id,
    user_id: userId,
    invoice_id: data.invoice_id,
    client_id: data.client_id,
    recipient_email: data.recipient_email,
    subject: data.subject,
    message: data.message,
    sent_at: now,
    status: data.status,
    error_message: data.error_message,
  };
  memoryStore.reminders.push(reminder);
  saveLocalStore();
  return reminder;
}

export async function getReminders(userId: string, invoiceId?: string): Promise<Reminder[]> {
  if (isPostgres && pool) {
    let sql = 'SELECT * FROM reminders WHERE user_id = $1';
    const params: any[] = [userId];
    if (invoiceId) {
      params.push(invoiceId);
      sql += ' AND invoice_id = $2';
    }
    sql += ' ORDER BY sent_at DESC';
    const res = await pool.query(sql, params);
    return res.rows;
  }

  let list = memoryStore.reminders.filter(r => r.user_id === userId);
  if (invoiceId) {
    list = list.filter(r => r.invoice_id === invoiceId);
  }
  return list.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

// Activity logs
export const logActivity = createActivityLog;
export async function createActivityLog(
  userId: string,
  action: string,
  details: string,
  metadata?: Record<string, any>
): Promise<ActivityLog> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO activity_logs (id, user_id, action, details, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, userId, action, details, metadata ? JSON.stringify(metadata) : null, now]
    );
    return res.rows[0];
  }

  const log: ActivityLog = {
    id,
    user_id: userId,
    action,
    details,
    metadata,
    created_at: now,
  };
  memoryStore.activity_logs.unshift(log);
  // Keep last 100 entries per user in memory store
  if (memoryStore.activity_logs.length > 200) {
    memoryStore.activity_logs = memoryStore.activity_logs.slice(0, 200);
  }
  saveLocalStore();
  return log;
}

export async function getActivityLogs(userId: string, limit = 25): Promise<ActivityLog[]> {
  if (isPostgres && pool) {
    const res = await pool.query(
      'SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return res.rows.map(r => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));
  }

  return memoryStore.activity_logs
    .filter(l => l.user_id === userId)
    .slice(0, limit);
}

// Dashboard statistics
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const invoices = await getInvoices(userId);
  const clients = await getClients(userId);
  const recentLogs = await getActivityLogs(userId, 6);

  let total_outstanding = 0;
  let total_overdue = 0;
  let total_paid = 0;

  const counts = {
    total: invoices.length,
    unpaid: 0,
    overdue: 0,
    paid: 0,
    cancelled: 0,
  };

  const urgent: Invoice[] = [];

  for (const inv of invoices) {
    const status = inv.payment_status;
    if (status === 'UNPAID') {
      counts.unpaid++;
      total_outstanding += inv.amount;
    } else if (status === 'OVERDUE') {
      counts.overdue++;
      total_outstanding += inv.amount;
      total_overdue += inv.amount;
      urgent.push(inv);
    } else if (status === 'PAID') {
      counts.paid++;
      total_paid += inv.amount;
    } else if (status === 'CANCELLED') {
      counts.cancelled++;
    }
  }

  // Sort urgent overdue invoices by highest amount or oldest due date
  urgent.sort((a, b) => a.due_date.localeCompare(b.due_date));

  return {
    total_outstanding: Math.round(total_outstanding * 100) / 100,
    total_overdue: Math.round(total_overdue * 100) / 100,
    total_paid: Math.round(total_paid * 100) / 100,
    invoice_counts: counts,
    client_count: clients.length,
    urgent_invoices: urgent.slice(0, 5),
    recent_activity: recentLogs,
  };
}

// ==========================================
// 9. SUBSCRIPTIONS & BILLING
// ==========================================

export async function getSubscription(userId: string): Promise<Subscription> {
  const now = new Date().toISOString();

  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1', [userId]);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        ...r,
        current_period_start: typeof r.current_period_start === 'string' ? r.current_period_start : r.current_period_start.toISOString(),
        current_period_end: r.current_period_end ? (typeof r.current_period_end === 'string' ? r.current_period_end : r.current_period_end.toISOString()) : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
      };
    }

    // Auto-create default FREE subscription for user
    const id = crypto.randomUUID();
    const insertRes = await pool.query(
      `INSERT INTO subscriptions (
        id, user_id, plan, status, billing_interval, provider,
        provider_customer_id, provider_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [id, userId, 'FREE', 'active', 'monthly', 'manual', null, null, now, null, false, now, now]
    );
    const r = insertRes.rows[0];
    return {
      ...r,
      current_period_start: typeof r.current_period_start === 'string' ? r.current_period_start : r.current_period_start.toISOString(),
      current_period_end: null,
      created_at: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
    };
  }

  // Local persistent fallback
  reloadLocalStore();
  let sub = memoryStore.subscriptions.find(s => s.user_id === userId);
  if (!sub) {
    sub = {
      id: crypto.randomUUID(),
      user_id: userId,
      plan: 'FREE',
      status: 'active',
      billing_interval: 'monthly',
      provider: 'manual',
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_start: now,
      current_period_end: null,
      cancel_at_period_end: false,
      created_at: now,
      updated_at: now,
    };
    memoryStore.subscriptions.push(sub);
    saveLocalStore();
  }
  return sub;
}

export async function upsertSubscription(data: Partial<Subscription> & { user_id: string }): Promise<Subscription> {
  const current = await getSubscription(data.user_id);
  const now = new Date().toISOString();

  const updated: Subscription = {
    ...current,
    ...data,
    updated_at: now,
  };

  if (isPostgres && pool) {
    const res = await pool.query(
      `INSERT INTO subscriptions (
        id, user_id, plan, status, billing_interval, provider,
        provider_customer_id, provider_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        billing_interval = EXCLUDED.billing_interval,
        provider = EXCLUDED.provider,
        provider_customer_id = EXCLUDED.provider_customer_id,
        provider_subscription_id = EXCLUDED.provider_subscription_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        updated.id,
        updated.user_id,
        updated.plan,
        updated.status,
        updated.billing_interval,
        updated.provider,
        updated.provider_customer_id,
        updated.provider_subscription_id,
        updated.current_period_start,
        updated.current_period_end,
        updated.cancel_at_period_end,
        updated.created_at,
        updated.updated_at,
      ]
    );
    const r = res.rows[0];
    return {
      ...r,
      current_period_start: typeof r.current_period_start === 'string' ? r.current_period_start : r.current_period_start.toISOString(),
      current_period_end: r.current_period_end ? (typeof r.current_period_end === 'string' ? r.current_period_end : r.current_period_end.toISOString()) : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
    };
  }

  const idx = memoryStore.subscriptions.findIndex(s => s.user_id === data.user_id);
  if (idx >= 0) {
    memoryStore.subscriptions[idx] = updated;
  } else {
    memoryStore.subscriptions.push(updated);
  }
  saveLocalStore();
  return updated;
}

export async function getSubscriptionByProviderSubId(subId: string): Promise<Subscription | null> {
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM subscriptions WHERE provider_subscription_id = $1 LIMIT 1', [subId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      current_period_start: typeof r.current_period_start === 'string' ? r.current_period_start : r.current_period_start.toISOString(),
      current_period_end: r.current_period_end ? (typeof r.current_period_end === 'string' ? r.current_period_end : r.current_period_end.toISOString()) : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
    };
  }

  reloadLocalStore();
  return memoryStore.subscriptions.find(s => s.provider_subscription_id === subId) || null;
}

export async function getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM subscriptions WHERE provider_customer_id = $1 LIMIT 1', [customerId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      current_period_start: typeof r.current_period_start === 'string' ? r.current_period_start : r.current_period_start.toISOString(),
      current_period_end: r.current_period_end ? (typeof r.current_period_end === 'string' ? r.current_period_end : r.current_period_end.toISOString()) : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
    };
  }

  reloadLocalStore();
  return memoryStore.subscriptions.find(s => s.provider_customer_id === customerId) || null;
}

export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  if (isPostgres && pool) {
    const res = await pool.query('SELECT id FROM processed_webhook_events WHERE id = $1 LIMIT 1', [eventId]);
    return res.rows.length > 0;
  }
  reloadLocalStore();
  return memoryStore.processed_webhook_events.some(e => e.id === eventId);
}

export async function recordProcessedWebhookEvent(eventId: string, eventType: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query(
      'INSERT INTO processed_webhook_events (id, event_type, processed_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [eventId, eventType, now]
    );
    return;
  }
  if (!memoryStore.processed_webhook_events.some(e => e.id === eventId)) {
    memoryStore.processed_webhook_events.push({ id: eventId, event_type: eventType, processed_at: now });
    // Keep last 500 events
    if (memoryStore.processed_webhook_events.length > 500) {
      memoryStore.processed_webhook_events = memoryStore.processed_webhook_events.slice(-500);
    }
    saveLocalStore();
  }
}

/**
 * Accurately tracks current resource consumption against plan limits for a user.
 */
export async function getUserUsage(userId: string): Promise<SubscriptionUsage> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);

  const clients = await getClients(userId);
  const clientCount = clients.length;

  // Determine current billing period start for monthly invoice tracking
  let periodStart: string;
  const now = new Date();

  if (sub.current_period_start && isPaidSubscriptionActive(sub.status, sub.current_period_end)) {
    periodStart = sub.current_period_start;
  } else {
    // For FREE plan, calculate start of the current calendar month UTC (or 30 days window)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodStart = monthStart.toISOString();
  }

  let invoicesThisPeriod = 0;
  let automatedRemindersCount = 0;

  if (isPostgres && pool) {
    const invRes = await pool.query(
      'SELECT COUNT(*)::int as count FROM invoices WHERE user_id = $1 AND created_at >= $2',
      [userId, periodStart]
    );
    invoicesThisPeriod = invRes.rows[0]?.count || 0;

    const remRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM reminders WHERE user_id = $1 AND sent_at >= $2 AND status = 'SENT'`,
      [userId, periodStart]
    );
    automatedRemindersCount = remRes.rows[0]?.count || 0;
  } else {
    reloadLocalStore();
    const startTime = new Date(periodStart).getTime();
    invoicesThisPeriod = memoryStore.invoices.filter(
      i => i.user_id === userId && new Date(i.created_at).getTime() >= startTime
    ).length;

    automatedRemindersCount = memoryStore.reminders.filter(
      r => r.user_id === userId && new Date(r.sent_at).getTime() >= startTime && r.status === 'SENT'
    ).length;
  }

  return {
    client_count: clientCount,
    max_clients: planConfig.limits.maxClients,
    invoices_this_period: invoicesThisPeriod,
    max_invoices_per_month: planConfig.limits.maxInvoicesPerMonth,
    period_start: periodStart,
    period_end: sub.current_period_end || null,
    automated_reminders_count: automatedRemindersCount,
  };
}

export async function checkCanCreateClient(
  userId: string
): Promise<{ allowed: boolean; reason?: string; current: number; max: number | null; plan: PlanTier }> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  const usage = await getUserUsage(userId);

  if (planConfig.limits.maxClients !== null && usage.client_count >= planConfig.limits.maxClients) {
    return {
      allowed: false,
      reason: `Client limit reached (${usage.client_count} of ${planConfig.limits.maxClients}) for the ${planConfig.name} plan. Upgrade to add more clients.`,
      current: usage.client_count,
      max: planConfig.limits.maxClients,
      plan: planConfig.tier,
    };
  }

  return {
    allowed: true,
    current: usage.client_count,
    max: planConfig.limits.maxClients,
    plan: planConfig.tier,
  };
}

export async function checkCanCreateInvoice(
  userId: string
): Promise<{ allowed: boolean; reason?: string; current: number; max: number | null; plan: PlanTier }> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  const usage = await getUserUsage(userId);

  if (
    planConfig.limits.maxInvoicesPerMonth !== null &&
    usage.invoices_this_period >= planConfig.limits.maxInvoicesPerMonth
  ) {
    return {
      allowed: false,
      reason: `Monthly invoice limit reached (${usage.invoices_this_period} of ${planConfig.limits.maxInvoicesPerMonth}) for the ${planConfig.name} plan. Upgrade to issue unlimited invoices.`,
      current: usage.invoices_this_period,
      max: planConfig.limits.maxInvoicesPerMonth,
      plan: planConfig.tier,
    };
  }

  return {
    allowed: true,
    current: usage.invoices_this_period,
    max: planConfig.limits.maxInvoicesPerMonth,
    plan: planConfig.tier,
  };
}

export async function checkFeatureAccess(
  userId: string,
  feature: keyof PlanFeatures
): Promise<{ allowed: boolean; plan: PlanTier; reason?: string }> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  const allowed = Boolean(planConfig.features[feature]);

  return {
    allowed,
    plan: planConfig.tier,
    reason: allowed
      ? undefined
      : `The feature "${String(feature)}" requires an upgraded subscription (Starter or Growth).`,
  };
}

export async function getSubscriptionDetails(userId: string) {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  const usage = await getUserUsage(userId);
  const isActive = isPaidSubscriptionActive(sub.status, sub.current_period_end);

  return {
    subscription: sub,
    plan_config: planConfig,
    usage,
    is_active: isActive,
    stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}

// ======================================================================
// Background Worker DB Helpers
// ======================================================================

export async function getUsersWithAutomatedReminders(): Promise<User[]> {
  if (isPostgres && pool) {
    const res = await pool.query(`
      SELECT u.* FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.status = 'ACTIVE'
        AND s.plan IN ('STARTER', 'GROWTH')
        AND s.status IN ('active', 'trialing')
    `);
    return res.rows;
  }

  const eligibleUserIds = new Set<string>();
  for (const s of memoryStore.subscriptions) {
    if ((s.plan === 'STARTER' || s.plan === 'GROWTH') && (s.status === 'active' || s.status === 'trialing')) {
      eligibleUserIds.add(s.user_id);
    }
  }

  return memoryStore.users.filter(u => u.status === 'ACTIVE' && eligibleUserIds.has(u.id));
}

export async function getRecentRemindersForInvoice(invoiceId: string, days: number = 3): Promise<Reminder[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  if (isPostgres && pool) {
    const res = await pool.query(
      'SELECT * FROM reminders WHERE invoice_id = $1 AND sent_at >= $2',
      [invoiceId, cutoff]
    );
    return res.rows;
  }

  return memoryStore.reminders.filter(
    r => r.invoice_id === invoiceId && (r.sent_at || '') >= cutoff
  );
}

// ======================================================================
// Admin Panel Management & Aggregation Queries
// ======================================================================

export async function getAdminDashboardStats(): Promise<import('./types.js').AdminDashboardStats> {
  const isEmailConfigured = Boolean(process.env.RESEND_API_KEY);
  const isStripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  let totalUsers = 0;
  let verifiedUsers = 0;
  let unverifiedUsers = 0;
  let freeUsers = 0;
  let starterUsers = 0;
  let growthUsers = 0;
  let activeSubs = 0;
  let pastDueSubs = 0;
  let cancelledSubs = 0;
  let totalInvoices = 0;
  let paidInvoices = 0;
  let overdueInvoices = 0;
  let remindersSent = 0;
  let recentActivity: ActivityLog[] = [];

  if (isPostgres && pool) {
    const usersRes = await pool.query('SELECT email_verified FROM users');
    totalUsers = usersRes.rows.length;
    verifiedUsers = usersRes.rows.filter(r => r.email_verified).length;
    unverifiedUsers = totalUsers - verifiedUsers;

    const subsRes = await pool.query('SELECT plan, status FROM subscriptions');
    for (const s of subsRes.rows) {
      if (s.plan === 'STARTER') starterUsers++;
      else if (s.plan === 'GROWTH') growthUsers++;
      else freeUsers++;

      if (s.status === 'active' || s.status === 'trialing') activeSubs++;
      else if (s.status === 'past_due') pastDueSubs++;
      else if (s.status === 'cancelled') cancelledSubs++;
    }
    // Any user without subscription row counts as free
    const userCountWithSub = subsRes.rows.length;
    if (totalUsers > userCountWithSub) {
      freeUsers += (totalUsers - userCountWithSub);
    }

    const invRes = await pool.query('SELECT payment_status FROM invoices');
    totalInvoices = invRes.rows.length;
    paidInvoices = invRes.rows.filter(i => i.payment_status === 'PAID').length;
    overdueInvoices = invRes.rows.filter(i => i.payment_status === 'OVERDUE').length;

    const remRes = await pool.query('SELECT COUNT(*) as count FROM reminders WHERE status = $1', ['SENT']);
    remindersSent = parseInt(remRes.rows[0]?.count || '0', 10);

    const actRes = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10');
    recentActivity = actRes.rows;
  } else {
    totalUsers = memoryStore.users.length;
    verifiedUsers = memoryStore.users.filter(u => u.email_verified).length;
    unverifiedUsers = totalUsers - verifiedUsers;

    const userSubMap = new Map<string, Subscription>();
    for (const s of memoryStore.subscriptions) {
      userSubMap.set(s.user_id, s);
      if (s.status === 'active' || s.status === 'trialing') activeSubs++;
      else if (s.status === 'past_due') pastDueSubs++;
      else if (s.status === 'cancelled') cancelledSubs++;
    }

    for (const u of memoryStore.users) {
      const sub = userSubMap.get(u.id);
      const plan = sub?.plan || 'FREE';
      if (plan === 'STARTER') starterUsers++;
      else if (plan === 'GROWTH') growthUsers++;
      else freeUsers++;
    }

    totalInvoices = memoryStore.invoices.length;
    paidInvoices = memoryStore.invoices.filter(i => i.payment_status === 'PAID').length;
    overdueInvoices = memoryStore.invoices.filter(i => i.payment_status === 'OVERDUE').length;
    remindersSent = memoryStore.reminders.filter(r => r.status === 'SENT').length;

    recentActivity = [...memoryStore.activity_logs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }

  return {
    total_users: totalUsers,
    verified_users: verifiedUsers,
    unverified_users: unverifiedUsers,
    free_users: freeUsers,
    starter_users: starterUsers,
    growth_users: growthUsers,
    active_subscriptions: activeSubs,
    past_due_subscriptions: pastDueSubs,
    cancelled_subscriptions: cancelledSubs,
    total_invoices: totalInvoices,
    paid_invoices: paidInvoices,
    overdue_invoices: overdueInvoices,
    reminders_sent: remindersSent,
    recent_activity: recentActivity,
    system_health: {
      database: 'PASS',
      email: isEmailConfigured ? 'PASS' : 'NOT CONFIGURED',
      stripe: isStripeConfigured ? 'PASS' : 'NOT CONFIGURED',
      worker: 'PASS',
    },
  };
}

export async function getAdminUsers(params: {
  search?: string;
  role?: string;
  status?: string;
  plan?: string;
  page?: number;
  limit?: number;
}): Promise<{
  users: import('./types.js').AdminUserItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));
  const search = params.search?.trim().toLowerCase();

  let allUsers: User[] = [];
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    allUsers = res.rows;
  } else {
    allUsers = [...memoryStore.users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const items: import('./types.js').AdminUserItem[] = [];

  for (const u of allUsers) {
    if (search) {
      const matchEmail = u.email.toLowerCase().includes(search);
      const matchName = u.name.toLowerCase().includes(search);
      const matchBiz = u.business_name?.toLowerCase().includes(search);
      if (!matchEmail && !matchName && !matchBiz) continue;
    }

    if (params.role && params.role !== 'ALL' && u.role !== params.role) {
      continue;
    }

    if (params.status && params.status !== 'ALL' && u.status !== params.status) {
      continue;
    }

    const sub = await getSubscription(u.id);
    if (params.plan && params.plan !== 'ALL' && sub.plan !== params.plan) {
      continue;
    }

    let clientCount = 0;
    let invoiceCount = 0;
    if (isPostgres && pool) {
      const cRes = await pool.query('SELECT COUNT(*) as c FROM clients WHERE user_id = $1', [u.id]);
      const iRes = await pool.query('SELECT COUNT(*) as c FROM invoices WHERE user_id = $1', [u.id]);
      clientCount = parseInt(cRes.rows[0]?.c || '0', 10);
      invoiceCount = parseInt(iRes.rows[0]?.c || '0', 10);
    } else {
      clientCount = memoryStore.clients.filter(c => c.user_id === u.id).length;
      invoiceCount = memoryStore.invoices.filter(i => i.user_id === u.id).length;
    }

    items.push({
      id: u.id,
      email: u.email,
      name: u.name,
      business_name: u.business_name,
      email_verified: u.email_verified,
      role: u.role || 'USER',
      status: u.status || 'ACTIVE',
      plan: sub.plan,
      subscription_status: sub.status,
      client_count: clientCount,
      invoice_count: invoiceCount,
      created_at: u.created_at,
      last_login_at: u.last_login_at || null,
    });
  }

  const total = items.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = items.slice((page - 1) * limit, page * limit);

  return {
    users: paginated,
    total,
    page,
    totalPages,
  };
}

export async function suspendUser(adminUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  if (adminUserId === targetUserId) {
    return { success: false, error: 'Cannot suspend your own administrator account.' };
  }

  const target = await getUserById(targetUserId);
  if (!target) {
    return { success: false, error: 'User not found.' };
  }

  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query('UPDATE users SET status = $1, updated_at = $2 WHERE id = $3', ['SUSPENDED', now, targetUserId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
  } else {
    target.status = 'SUSPENDED';
    target.updated_at = now;
    memoryStore.sessions = memoryStore.sessions.filter(s => s.user_id !== targetUserId);
    saveLocalStore();
  }

  await createActivityLog(
    targetUserId,
    'account_suspended',
    'Account suspended by administrator',
    { admin_id: adminUserId, target_user: target.email }
  );

  return { success: true };
}

export async function restoreUser(adminUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const target = await getUserById(targetUserId);
  if (!target) {
    return { success: false, error: 'User not found.' };
  }

  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query('UPDATE users SET status = $1, updated_at = $2 WHERE id = $3', ['ACTIVE', now, targetUserId]);
  } else {
    target.status = 'ACTIVE';
    target.updated_at = now;
    saveLocalStore();
  }

  await createActivityLog(
    targetUserId,
    'account_restored',
    'Account restored by administrator',
    { admin_id: adminUserId, target_user: target.email }
  );

  return { success: true };
}

export async function updateUserRole(
  adminUserId: string,
  targetUserId: string,
  newRole: import('./types.js').UserRole
): Promise<{ success: boolean; error?: string }> {
  const target = await getUserById(targetUserId);
  if (!target) {
    return { success: false, error: 'User not found.' };
  }

  if (adminUserId === targetUserId && newRole !== 'ADMIN') {
    return { success: false, error: 'Cannot demote your own administrator account.' };
  }

  const now = new Date().toISOString();
  if (isPostgres && pool) {
    await pool.query('UPDATE users SET role = $1, updated_at = $2 WHERE id = $3', [newRole, now, targetUserId]);
  } else {
    target.role = newRole;
    target.updated_at = now;
    saveLocalStore();
  }

  await createActivityLog(
    targetUserId,
    'role_updated',
    `Role changed to ${newRole} by administrator`,
    { admin_id: adminUserId, new_role: newRole }
  );

  return { success: true };
}

export async function getAdminSubscriptions(params: { page?: number; limit?: number }): Promise<{
  subscriptions: import('./types.js').AdminSubscriptionItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));

  let subs: Subscription[] = [];
  if (isPostgres && pool) {
    const res = await pool.query('SELECT * FROM subscriptions ORDER BY created_at DESC');
    subs = res.rows;
  } else {
    subs = [...memoryStore.subscriptions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const items: import('./types.js').AdminSubscriptionItem[] = [];
  for (const s of subs) {
    const u = await getUserById(s.user_id);
    items.push({
      id: s.id,
      user_id: s.user_id,
      user_name: u?.name || 'Unknown',
      user_email: u?.email || 'unknown@receipto.app',
      plan: s.plan,
      status: s.status,
      billing_interval: s.billing_interval,
      provider: s.provider,
      provider_customer_id: s.provider_customer_id,
      provider_subscription_id: s.provider_subscription_id,
      current_period_start: s.current_period_start,
      current_period_end: s.current_period_end,
      cancel_at_period_end: s.cancel_at_period_end,
      created_at: s.created_at,
    });
  }

  const total = items.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = items.slice((page - 1) * limit, page * limit);

  return {
    subscriptions: paginated,
    total,
    page,
    totalPages,
  };
}

export async function getAdminActivityLogs(params: {
  userId?: string;
  action?: string;
  page?: number;
  limit?: number;
}): Promise<{
  logs: (ActivityLog & { user_email?: string; user_name?: string })[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 25));

  let logs: ActivityLog[] = [];
  if (isPostgres && pool) {
    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const queryParams: any[] = [];
    if (params.userId) {
      queryParams.push(params.userId);
      query += ` AND user_id = $${queryParams.length}`;
    }
    if (params.action) {
      queryParams.push(params.action);
      query += ` AND action = $${queryParams.length}`;
    }
    query += ' ORDER BY created_at DESC';
    const res = await pool.query(query, queryParams);
    logs = res.rows;
  } else {
    logs = [...memoryStore.activity_logs];
    if (params.userId) {
      logs = logs.filter(l => l.user_id === params.userId);
    }
    if (params.action) {
      logs = logs.filter(l => l.action === params.action);
    }
    logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const enriched: (ActivityLog & { user_email?: string; user_name?: string })[] = [];
  for (const log of logs) {
    const u = await getUserById(log.user_id);
    enriched.push({
      ...log,
      user_email: u?.email,
      user_name: u?.name,
    });
  }

  const total = enriched.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = enriched.slice((page - 1) * limit, page * limit);

  return {
    logs: paginated,
    total,
    page,
    totalPages,
  };
}

export async function getAdminSystemHealth(workerStatus: any): Promise<import('./types.js').AdminSystemHealth> {
  const isEmailConfigured = Boolean(process.env.RESEND_API_KEY);
  const isStripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const isWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  let dbStatus: 'PASS' | 'FAIL' = 'PASS';
  let dbEngine: 'postgres' | 'local_persistent' = isPostgres ? 'postgres' : 'local_persistent';
  let dbLatencyMs = 0;
  let dbDetails = isPostgres ? 'PostgreSQL Pool Active' : 'Persistent Storage (data/receipto_db.json)';

  const startTime = Date.now();
  try {
    if (isPostgres && pool) {
      await pool.query('SELECT 1');
    }
    dbLatencyMs = Date.now() - startTime;
  } catch (err: any) {
    dbStatus = 'FAIL';
    dbDetails = `Database test error: ${err.message}`;
  }

  const memory = process.memoryUsage();
  const memoryMb = Math.round(memory.rss / (1024 * 1024));

  return {
    database: {
      status: dbStatus,
      engine: dbEngine,
      connected: dbStatus === 'PASS',
      latency_ms: dbLatencyMs,
      details: dbDetails,
    },
    email: {
      status: isEmailConfigured ? 'PASS' : 'NOT CONFIGURED',
      provider: 'Resend',
      configured: isEmailConfigured,
      from_email: process.env.RESEND_FROM_EMAIL || 'Receipto <billing@resend.dev>',
      details: isEmailConfigured ? 'Resend API key configured' : 'RESEND_API_KEY environment variable not set',
    },
    stripe: {
      status: isStripeConfigured ? 'PASS' : 'NOT CONFIGURED',
      configured: isStripeConfigured,
      webhook_configured: isWebhookConfigured,
      price_ids_configured: Boolean(
        process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ||
        process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ||
        process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID ||
        process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
      ),
    },
    application: {
      status: 'PASS',
      app: 'Receipto',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime_seconds: Math.round(process.uptime()),
      memory_usage_mb: memoryMb,
      node_version: process.version,
    },
    worker: {
      status: workerStatus.last_error ? 'WARNING' : 'PASS',
      running: workerStatus.running,
      last_run_at: workerStatus.last_run_at,
      last_success_at: workerStatus.last_success_at,
      last_failure_at: workerStatus.last_failure_at,
      last_error: workerStatus.last_error,
      total_runs: workerStatus.total_runs,
      total_reminders_sent: workerStatus.total_reminders_sent,
      interval_seconds: workerStatus.interval_seconds,
    },
  };
}


