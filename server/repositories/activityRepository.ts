import crypto from 'crypto';
import type { ActivityLog } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore } from '../lib/dbStore.js';

export async function createActivityLog(
  userIdOrData: string | { user_id: string; action: string; details: string; metadata?: any },
  actionArg?: string,
  detailsArg?: string,
  metadataArg?: any
): Promise<ActivityLog> {
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
    metadata,
    created_at: now,
  };
  memoryStore.activity_logs.push(log);
  saveStore();
  return log;
}

export async function getActivityLogs(userId: string, limit = 50): Promise<ActivityLog[]> {
  reloadLocalStore();
  return memoryStore.activity_logs
    .filter((a) => a.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
