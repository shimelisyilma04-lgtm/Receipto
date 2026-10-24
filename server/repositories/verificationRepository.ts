import crypto from 'crypto';
import type { EmailVerification } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore } from '../lib/dbStore.js';
import { logger } from '../lib/logger.js';

export async function createEmailVerification(data: {
  user_id: string;
  email: string;
  otp_hash: string;
  salt: string;
  expires_at: string;
  purpose?: 'email_verification' | 'password_reset' | 'email_change';
}): Promise<EmailVerification> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: EmailVerification = {
    id,
    user_id: data.user_id,
    email: data.email.trim().toLowerCase(),
    otp_hash: data.otp_hash,
    salt: data.salt,
    expires_at: data.expires_at,
    attempt_count: 0,
    used_at: null,
    purpose: data.purpose || 'email_verification',
    resend_count: 0,
    last_resend_at: now,
    created_at: now,
  };
  memoryStore.email_verifications.push(record);
  saveStore();
  logger.info({ userId: data.user_id, email: data.email, purpose: record.purpose }, 'Email verification challenge created');
  return record;
}

export async function getLatestEmailVerification(
  userIdOrEmail: string,
  purpose: 'email_verification' | 'password_reset' | 'email_change' = 'email_verification'
): Promise<EmailVerification | null> {
  reloadLocalStore();
  const clean = userIdOrEmail.trim().toLowerCase();
  const records = memoryStore.email_verifications
    .filter(
      (v) =>
        (v.user_id === userIdOrEmail || v.email.toLowerCase() === clean) &&
        v.purpose === purpose &&
        !v.used_at
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return records[0] || null;
}

export async function markVerificationUsed(id: string): Promise<void> {
  const v = memoryStore.email_verifications.find((x) => x.id === id);
  if (v) {
    v.used_at = new Date().toISOString();
    saveStore();
    logger.info({ verificationId: id }, 'Email verification marked as used');
  }
}

export async function invalidateVerification(id: string, reason?: string): Promise<void> {
  const v = memoryStore.email_verifications.find((x) => x.id === id);
  if (v) {
    v.used_at = new Date().toISOString();
    saveStore();
    logger.info({ verificationId: id, reason }, 'Email verification invalidated');
  }
}

export async function recordVerificationAttempt(id: string): Promise<{ attempt_count: number }> {
  const v = memoryStore.email_verifications.find((x) => x.id === id);
  if (v) {
    v.attempt_count = (v.attempt_count || 0) + 1;
    saveStore();
    return { attempt_count: v.attempt_count };
  }
  return { attempt_count: 0 };
}
