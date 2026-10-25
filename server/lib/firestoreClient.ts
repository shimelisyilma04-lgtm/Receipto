import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { logger } from './logger.js';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let databaseId: string = '(default)';
let projectId: string = '';

export function getFirestoreApp(): { app: FirebaseApp; db: Firestore; databaseId: string; projectId: string } | null {
  if (db && app) {
    return { app, db, databaseId, projectId };
  }

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    projectId = cfg.projectId || '';
    databaseId = cfg.firestoreDatabaseId || '(default)';

    if (getApps().length === 0) {
      app = initializeApp(cfg);
    } else {
      app = getApp();
    }

    db = getFirestore(app, databaseId);
    return { app, db, databaseId, projectId };
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to initialize Firestore client from firebase-applet-config.json');
    return null;
  }
}

export async function pingFirestore(): Promise<{
  connected: boolean;
  latencyMs?: number;
  databaseId?: string;
  projectId?: string;
  error?: string;
}> {
  const client = getFirestoreApp();
  if (!client) {
    return {
      connected: false,
      error: 'firebase-applet-config.json is missing or unreadable on the server.',
    };
  }

  const start = Date.now();
  try {
    const testDocRef = doc(client.db, 'test', 'connection');
    await getDocFromServer(testDocRef);
    const latencyMs = Date.now() - start;
    return {
      connected: true,
      latencyMs,
      databaseId: client.databaseId,
      projectId: client.projectId,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, latencyMs }, 'Cloud Firestore connection probe failed');
    return {
      connected: false,
      latencyMs,
      databaseId: client.databaseId,
      projectId: client.projectId,
      error: msg,
    };
  }
}
