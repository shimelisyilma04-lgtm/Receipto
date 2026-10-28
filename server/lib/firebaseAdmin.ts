import { initializeApp, cert, applicationDefault, getApps, getApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { InMemoryFirestore } from './inMemoryFirestore.js';

let adminApp: App | null = null;
let firestoreInstance: any = null;
let testFirestoreInstance: InMemoryFirestore | null = null;
let customTestFirestore: any = null;

export interface FirebaseAdminConfig {
  projectId: string;
  databaseId: string;
  source: 'service_account_env' | 'google_credentials_file' | 'application_default' | 'test_in_memory';
}

function loadConfigDefaults(): { projectId: string; databaseId: string } {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || '';
  let databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

  const configFile = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (!projectId && parsed.projectId) projectId = parsed.projectId;
      if (databaseId === '(default)' && parsed.firestoreDatabaseId) databaseId = parsed.firestoreDatabaseId;
    } catch {
      // Ignore parse errors, use fallback
    }
  }

  return { projectId, databaseId };
}

/**
 * Determine if valid credentials or emulator are available in environment.
 */
export function hasFirebaseAdminCredentials(): boolean {
  if (process.env.FIRESTORE_EMULATOR_HOST) return true;
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    // In test environment, do not hijack with ambient machine credentials
    if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Initialize Firebase Admin SDK safely and only once.
 */
export function initFirebaseAdmin(): { app: App | null; db: any; config: FirebaseAdminConfig } {
  if (customTestFirestore) {
    return {
      app: adminApp,
      db: customTestFirestore,
      config: { projectId: 'test-project', databaseId: 'test-db', source: 'test_in_memory' },
    };
  }

  const { projectId, databaseId } = loadConfigDefaults();
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const forceInMemory = process.env.USE_IN_MEMORY_FIRESTORE === 'true';

  // In test environment without explicit service account or emulator, use the in-memory engine
  if ((isTest || forceInMemory) && !process.env.FIREBASE_SERVICE_ACCOUNT?.trim() && !process.env.FIRESTORE_EMULATOR_HOST) {
    if (!testFirestoreInstance) {
      testFirestoreInstance = new InMemoryFirestore();
    }
    return {
      app: null,
      db: testFirestoreInstance,
      config: { projectId, databaseId, source: 'test_in_memory' },
    };
  }

  if (firestoreInstance && adminApp) {
    return {
      app: adminApp,
      db: firestoreInstance,
      config: { projectId, databaseId, source: 'application_default' },
    };
  }

  try {
    let credential: any;
    let source: FirebaseAdminConfig['source'] = 'application_default';

    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    if (saEnv) {
      try {
        let raw = saEnv;
        if (!raw.startsWith('{') && !raw.startsWith('"')) {
          raw = Buffer.from(raw, 'base64').toString('utf-8');
        }
        const parsed = JSON.parse(raw);
        credential = cert(parsed);
        source = 'service_account_env';
      } catch (err: any) {
        logger.error({ err: err.message }, 'Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable');
        throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT JSON: ${err.message}`);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      credential = applicationDefault();
      source = 'google_credentials_file';
    } else {
      credential = applicationDefault();
      source = 'application_default';
    }

    if (getApps().length === 0) {
      adminApp = initializeApp({
        credential,
        projectId: projectId || undefined,
      });
    } else {
      adminApp = getApp();
    }

    // Initialize Firestore with specific database ID
    if (databaseId && databaseId !== '(default)') {
      firestoreInstance = getFirestore(adminApp, databaseId);
    } else {
      firestoreInstance = getFirestore(adminApp);
    }

    logger.info({ projectId, databaseId, source }, 'Firebase Admin initialized successfully');
    return {
      app: adminApp,
      db: firestoreInstance,
      config: { projectId, databaseId, source },
    };
  } catch (err: any) {
    if (process.env.NODE_ENV === 'production') {
      logger.fatal(
        { err: err.message },
        'CRITICAL: Firebase Admin credentials failed to initialize in production. Refusing fallback.'
      );
      throw err;
    }

    // In non-production development without credentials, provide explicit warning
    logger.warn(
      { err: err.message },
      'Firebase Admin credentials not found in environment. Using in-memory adapter for local dev.'
    );
    if (!testFirestoreInstance) {
      testFirestoreInstance = new InMemoryFirestore();
    }
    return {
      app: null,
      db: testFirestoreInstance,
      config: { projectId, databaseId, source: 'test_in_memory' },
    };
  }
}

/**
 * Enable in-memory Firestore adapter (e.g. for development when credentials are unavailable)
 */
export function enableInMemoryFallback(): void {
  if (!testFirestoreInstance) {
    testFirestoreInstance = new InMemoryFirestore();
  }
  firestoreInstance = testFirestoreInstance;
}

/**
 * Get authoritative Firestore instance.
 */
export function getAdminFirestore(): any {
  if (customTestFirestore) return customTestFirestore;
  if (firestoreInstance === testFirestoreInstance && testFirestoreInstance) {
    return testFirestoreInstance;
  }
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (isTest && !process.env.FIREBASE_SERVICE_ACCOUNT?.trim() && !process.env.FIRESTORE_EMULATOR_HOST) {
    if (!testFirestoreInstance) {
      testFirestoreInstance = new InMemoryFirestore();
    }
    return testFirestoreInstance;
  }
  const { db } = initFirebaseAdmin();
  return db;
}

/**
 * Get Firebase Admin Auth instance (for token verification).
 */
export function getAdminAuth(): Auth | null {
  if (!adminApp) {
    try {
      const { app } = initFirebaseAdmin();
      if (!app) return null;
    } catch {
      return null;
    }
  }
  return adminApp ? getAuth(adminApp) : null;
}

/**
 * Set custom Firestore instance for testing.
 */
export function setAdminFirestoreForTesting(db: any): void {
  customTestFirestore = db;
}

/**
 * Reset test Firestore state between test runs.
 */
export function resetTestFirestore(): void {
  if (!testFirestoreInstance) {
    testFirestoreInstance = new InMemoryFirestore();
  } else {
    testFirestoreInstance.clear();
  }
  if (customTestFirestore && typeof customTestFirestore.clear === 'function') {
    customTestFirestore.clear();
  }
}

/**
 * Check connectivity and latency to Cloud Firestore.
 */
export async function pingAdminFirestore(): Promise<{
  connected: boolean;
  latencyMs?: number;
  databaseId?: string;
  projectId?: string;
  source?: string;
  error?: string;
}> {
  const { projectId, databaseId } = loadConfigDefaults();
  const start = Date.now();

  try {
    const db = getAdminFirestore();
    if (!db) {
      return {
        connected: false,
        databaseId,
        projectId,
        error: 'Firestore client is not initialized.',
      };
    }

    // Ping document
    const ref = db.collection('test').doc('connection');
    await ref.get();
    const latencyMs = Date.now() - start;

    return {
      connected: true,
      latencyMs,
      databaseId,
      projectId,
      source: customTestFirestore || testFirestoreInstance ? 'test_in_memory' : 'cloud_firestore',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      connected: false,
      latencyMs,
      databaseId,
      projectId,
      error: err.message || String(err),
    };
  }
}
