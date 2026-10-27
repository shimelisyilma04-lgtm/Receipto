import crypto from 'crypto';
import type { User, Session, UserRole, UserStatus } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { logger } from '../lib/logger.js';

export async function getUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.trim().toLowerCase();
  const db = getAdminFirestore();
  const snap = await db.collection('users').where('email', '==', cleanEmail).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as User;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getAdminFirestore();
  const snap = await db.collection('users').doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as User;
}

export async function createUser(data: {
  id?: string;
  email: string;
  password_hash: string;
  name: string;
  business_name?: string;
  email_verified?: boolean;
  role?: UserRole;
  status?: UserStatus;
  terms_accepted_at?: string;
  terms_version?: string;
}): Promise<User> {
  const db = getAdminFirestore();
  const id = data.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanEmail = data.email.trim().toLowerCase();
  const isVerified = Boolean(data.email_verified ?? false);
  const termsAcceptedAt = data.terms_accepted_at || null;
  const termsVersion = data.terms_version || '1.0';

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const assignedRole: UserRole =
    adminEmail && cleanEmail === adminEmail ? 'ADMIN' : data.role || 'USER';
  const assignedStatus: UserStatus = data.status || 'ACTIVE';

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

  await db.collection('users').doc(id).set(newUser);
  logger.info({ userId: id, email: cleanEmail, role: assignedRole }, 'User registered in Firestore');
  return newUser;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  const docRef = db.collection('users').doc(userId);
  await docRef.set({ last_login_at: now, updated_at: now }, { merge: true });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId);
  const snap = await docRef.get();
  if (!snap.exists) return false;

  const now = new Date().toISOString();
  await docRef.set({ password_hash: passwordHash, updated_at: now }, { merge: true });
  logger.info({ userId }, 'User password updated in Firestore');
  return true;
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; business_name?: string }
): Promise<User | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const existing = snap.data() as User;
  const now = new Date().toISOString();
  const updated: User = {
    ...existing,
    name: data.name ? data.name.trim() : existing.name,
    business_name: data.business_name !== undefined ? data.business_name.trim() : existing.business_name,
    updated_at: now,
  };

  await docRef.set(updated, { merge: true });
  return updated;
}

export async function updateUserEmail(userId: string, newEmail: string): Promise<User | null> {
  const db = getAdminFirestore();
  const cleanEmail = newEmail.trim().toLowerCase();
  const docRef = db.collection('users').doc(userId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const existing = snap.data() as User;
  const now = new Date().toISOString();
  const updated: User = {
    ...existing,
    email: cleanEmail,
    email_verified: false,
    updated_at: now,
  };

  await docRef.set(updated, { merge: true });
  logger.info({ userId, newEmail: cleanEmail }, 'User email updated in Firestore');
  return updated;
}

export async function setUserEmailVerified(userId: string, verified = true): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  const docRef = db.collection('users').doc(userId);
  await docRef.set({ email_verified: verified, updated_at: now }, { merge: true });
  logger.info({ userId, verified }, 'User email verification status updated in Firestore');
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const batch = db.batch();

  // Delete user doc
  const userRef = db.collection('users').doc(userId);
  batch.delete(userRef);

  // Delete subcollections: clients, invoices, reminders, activity_logs, subscription
  const subcollections = ['clients', 'invoices', 'reminders', 'activity_logs', 'subscription'];
  for (const sub of subcollections) {
    const snap = await userRef.collection(sub).get();
    snap.forEach((doc: any) => batch.delete(doc.ref));
  }

  // Delete user sessions
  const sessionsSnap = await db.collection('sessions').where('user_id', '==', userId).get();
  sessionsSnap.forEach((sDoc: any) => batch.delete(sDoc.ref));

  // Delete email verifications
  const verifsSnap = await db.collection('email_verifications').where('user_id', '==', userId).get();
  verifsSnap.forEach((vDoc: any) => batch.delete(vDoc.ref));

  await batch.commit();
  logger.info({ userId }, 'User account and all associated documents deleted from Firestore');
  return true;
}

// Session methods
export async function createSession(userId: string, token: string, expiresAt: Date): Promise<Session> {
  const db = getAdminFirestore();
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    created_at: new Date().toISOString(),
  };

  await db.collection('sessions').doc(token).set(session);
  return session;
}

export async function getSession(token: string): Promise<{ session: Session; user: User } | null> {
  const db = getAdminFirestore();
  const sessionDoc = await db.collection('sessions').doc(token).get();
  if (!sessionDoc.exists) return null;

  const session = sessionDoc.data() as Session;
  const now = new Date().toISOString();
  if (session.expires_at <= now) {
    // Expired session - cleanup asynchronously
    db.collection('sessions').doc(token).delete().catch(() => {});
    return null;
  }

  const user = await getUserById(session.user_id);
  if (!user) return null;

  return { session, user };
}

export async function deleteSession(token: string): Promise<void> {
  const db = getAdminFirestore();
  await db.collection('sessions').doc(token).delete();
}

export async function deleteUserSessions(userId: string): Promise<void> {
  const db = getAdminFirestore();
  const snap = await db.collection('sessions').where('user_id', '==', userId).get();
  const batch = db.batch();
  snap.forEach((d: any) => batch.delete(d.ref));
  await batch.commit();
}

export async function getUserByStripeCustomerId(customerId: string): Promise<User | null> {
  const db = getAdminFirestore();
  // Query subscription documents across users using collectionGroup
  const subSnap = await db.collectionGroup('subscription').where('stripe_customer_id', '==', customerId).limit(1).get();
  if (!subSnap.empty) {
    const sub = subSnap.docs[0].data();
    return await getUserById(sub.user_id);
  }

  const subSnap2 = await db.collectionGroup('subscription').where('provider_customer_id', '==', customerId).limit(1).get();
  if (!subSnap2.empty) {
    const sub = subSnap2.docs[0].data();
    return await getUserById(sub.user_id);
  }

  return null;
}
