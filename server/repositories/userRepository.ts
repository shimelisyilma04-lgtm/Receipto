import crypto from 'crypto';
import type { User, Session, UserRole, UserStatus } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore } from '../lib/dbStore.js';
import { logger } from '../lib/logger.js';

export async function getUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.trim().toLowerCase();
  reloadLocalStore();
  return memoryStore.users.find((u) => u.email.toLowerCase() === cleanEmail) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  reloadLocalStore();
  return memoryStore.users.find((u) => u.id === id) || null;
}

export async function createUser(data: {
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
  const id = crypto.randomUUID();
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

  memoryStore.users.push(newUser);
  saveStore();
  logger.info({ userId: id, email: cleanEmail, role: assignedRole }, 'User registered successfully');
  return newUser;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const user = memoryStore.users.find((u) => u.id === userId);
  if (user) {
    user.last_login_at = now;
    saveStore();
  }
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const now = new Date().toISOString();
  const user = memoryStore.users.find((u) => u.id === userId);
  if (user) {
    user.password_hash = passwordHash;
    user.updated_at = now;
    saveStore();
    logger.info({ userId }, 'User password updated');
    return true;
  }
  return false;
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; business_name?: string }
): Promise<User | null> {
  const now = new Date().toISOString();
  const user = memoryStore.users.find((u) => u.id === userId);
  if (user) {
    if (data.name) user.name = data.name.trim();
    if (data.business_name !== undefined) user.business_name = data.business_name.trim();
    user.updated_at = now;
    saveStore();
    return user;
  }
  return null;
}

export async function updateUserEmail(userId: string, newEmail: string): Promise<User | null> {
  const now = new Date().toISOString();
  const cleanEmail = newEmail.trim().toLowerCase();
  const user = memoryStore.users.find((u) => u.id === userId);
  if (user) {
    user.email = cleanEmail;
    user.email_verified = false;
    user.updated_at = now;
    saveStore();
    logger.info({ userId, newEmail: cleanEmail }, 'User email updated');
    return user;
  }
  return null;
}

export async function setUserEmailVerified(userId: string, verified = true): Promise<void> {
  const now = new Date().toISOString();
  const user = memoryStore.users.find((u) => u.id === userId);
  if (user) {
    user.email_verified = verified;
    user.updated_at = now;
    saveStore();
    logger.info({ userId, verified }, 'User email verification status updated');
  }
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  memoryStore.invoices = memoryStore.invoices.filter((i) => i.user_id !== userId);
  memoryStore.reminders = memoryStore.reminders.filter((r) => r.user_id !== userId);
  memoryStore.clients = memoryStore.clients.filter((c) => c.user_id !== userId);
  memoryStore.activity_logs = memoryStore.activity_logs.filter((a) => a.user_id !== userId);
  memoryStore.email_verifications = memoryStore.email_verifications.filter((v) => v.user_id !== userId);
  memoryStore.sessions = memoryStore.sessions.filter((s) => s.user_id !== userId);
  memoryStore.users = memoryStore.users.filter((u) => u.id !== userId);
  saveStore();
  logger.info({ userId }, 'User account deleted completely');
  return true;
}

// Session methods
export async function createSession(userId: string, token: string, expiresAt: Date): Promise<Session> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    created_at: new Date().toISOString(),
  };
  memoryStore.sessions.push(session);
  saveStore();
  return session;
}

export async function getSession(token: string): Promise<{ session: Session; user: User } | null> {
  reloadLocalStore();
  const now = new Date().toISOString();
  const session = memoryStore.sessions.find((s) => s.token === token && s.expires_at > now);
  if (!session) return null;

  const user = memoryStore.users.find((u) => u.id === session.user_id);
  if (!user) return null;

  return { session, user };
}

export async function deleteSession(token: string): Promise<void> {
  memoryStore.sessions = memoryStore.sessions.filter((s) => s.token !== token);
  saveStore();
}

export async function deleteUserSessions(userId: string): Promise<void> {
  memoryStore.sessions = memoryStore.sessions.filter((s) => s.user_id !== userId);
  saveStore();
}

export async function getUserByStripeCustomerId(customerId: string): Promise<User | null> {
  reloadLocalStore();
  const sub = memoryStore.subscriptions.find(
    (s) => s.stripe_customer_id === customerId || s.provider_customer_id === customerId
  );
  if (sub) {
    return memoryStore.users.find((u) => u.id === sub.user_id) || null;
  }
  return null;
}
