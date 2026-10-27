import crypto from 'crypto';
import type { EmailVerification } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { logger } from '../lib/logger.js';

export async function createEmailVerification(data: {
  user_id: string;
  email: string;
  otp_hash: string;
  salt: string;
  expires_at: string;
  purpose?: 'email_verification' | 'password_reset' | 'email_change';
}): Promise<EmailVerification> {
  const db = getAdminFirestore();
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

  await db.collection('email_verifications').doc(id).set(record);
  logger.info({ userId: data.user_id, email: data.email, purpose: record.purpose }, 'Email verification challenge created in Firestore');
  return record;
}

export async function getLatestEmailVerification(
  userIdOrEmail: string,
  purpose: 'email_verification' | 'password_reset' | 'email_change' = 'email_verification'
): Promise<EmailVerification | null> {
  const db = getAdminFirestore();
  const clean = userIdOrEmail.trim().toLowerCase();

  // Query records matching purpose
  const snap = await db.collection('email_verifications').where('purpose', '==', purpose).get();
  const records: EmailVerification[] = [];

  snap.forEach((d: any) => {
    const v = d.data() as EmailVerification;
    if ((v.user_id === userIdOrEmail || v.email.toLowerCase() === clean) && !v.used_at) {
      records.push(v);
    }
  });

  records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return records[0] || null;
}

export async function markVerificationUsed(id: string): Promise<void> {
  const db = getAdminFirestore();
  const docRef = db.collection('email_verifications').doc(id);
  const snap = await docRef.get();
  if (snap.exists) {
    await docRef.set({ used_at: new Date().toISOString() }, { merge: true });
    logger.info({ verificationId: id }, 'Email verification marked as used in Firestore');
  }
}

export async function invalidateVerification(id: string, reason?: string): Promise<void> {
  const db = getAdminFirestore();
  const docRef = db.collection('email_verifications').doc(id);
  const snap = await docRef.get();
  if (snap.exists) {
    await docRef.set({ used_at: new Date().toISOString() }, { merge: true });
    logger.info({ verificationId: id, reason }, 'Email verification invalidated in Firestore');
  }
}

export async function recordVerificationAttempt(id: string): Promise<{ attempt_count: number }> {
  const db = getAdminFirestore();
  const docRef = db.collection('email_verifications').doc(id);
  const snap = await docRef.get();
  if (snap.exists) {
    const current = (snap.data().attempt_count || 0) + 1;
    await docRef.set({ attempt_count: current }, { merge: true });
    return { attempt_count: current };
  }
  return { attempt_count: 0 };
}
