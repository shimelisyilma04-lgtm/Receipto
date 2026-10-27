import crypto from 'crypto';
import type { ActivityLog } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';

export async function createActivityLog(
  userIdOrData: string | { user_id: string; action: string; details: string; metadata?: any },
  actionArg?: string,
  detailsArg?: string,
  metadataArg?: any
): Promise<ActivityLog> {
  const db = getAdminFirestore();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let user_id = '';
  let action = '';
  let details = '';
  let metadata: any = undefined;

  if (typeof userIdOrData === 'string') {
    user_id = userIdOrData;
    action = actionArg || 'INFO';
    details = detailsArg || '';
    metadata = metadataArg;
  } else {
    user_id = userIdOrData.user_id;
    action = userIdOrData.action;
    details = userIdOrData.details;
    metadata = userIdOrData.metadata;
  }

  const log: ActivityLog = {
    id,
    user_id,
    action,
    details,
    created_at: now,
  };
  if (metadata !== undefined) {
    log.metadata = metadata;
  }

  await db.collection('users').doc(user_id).collection('activity_logs').doc(id).set(log);
  return log;
}

export async function getActivityLogs(userId: string, limit = 50): Promise<ActivityLog[]> {
  const db = getAdminFirestore();
  const snap = await db.collection('users').doc(userId).collection('activity_logs').get();
  const logs: ActivityLog[] = [];

  snap.forEach((d: any) => {
    logs.push(d.data() as ActivityLog);
  });

  return logs
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
