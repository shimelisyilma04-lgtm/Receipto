// Centralized API and Firebase Data Integration client for Receipto
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateFirebaseProfile,
  onAuthStateChanged,
  type FirebaseUser,
} from './firebase.js';
import {
  getFirestoreUserProfile,
  setFirestoreUserProfile,
  updateFirestoreUserProfile,
  getFirestoreClients,
  getFirestoreClient,
  createFirestoreClient,
  updateFirestoreClient,
  deleteFirestoreClient,
  getFirestoreInvoices,
  getFirestoreInvoice,
  createFirestoreInvoice,
  updateFirestoreInvoice,
  markFirestoreInvoicePaid,
  cancelFirestoreInvoice,
  deleteFirestoreInvoice,
  getFirestoreReminders,
  createFirestoreReminder,
  getFirestoreActivityLogs,
  getFirestoreSubscription,
  setFirestoreSubscription,
  getFirestoreDashboardStats,
} from './services/firestoreService.js';
import type { User, SubscriptionDetails, ActivityLog } from './types.js';
import { PLAN_CONFIGS } from './plans.js';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'receipto_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token?: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

// Helper to make server requests with Firebase ID token
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = options.retries ?? (method === 'GET' ? 1 : 0);
  const timeoutMs = options.timeout ?? 45000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    // Attach Firebase ID token if available
    let token = getStoredToken();
    try {
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
        setStoredToken(token);
      }
    } catch {
      // Continue with stored token
    }

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (!response.ok) {
        if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
          setStoredToken(null);
        }
        const errorMsg =
          data?.error || data?.message || (typeof data === 'string' && data ? data : `Request failed with status ${response.status}`);
        throw new ApiError(errorMsg, response.status);
      }

      if (data && typeof data.token === 'string') {
        setStoredToken(data.token);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      const isRetryable = attempt < maxRetries && (isAbort || err instanceof TypeError);

      if (isRetryable) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (isAbort) {
        throw new ApiError('Request timed out. Please try again.', 408);
      }
      throw err;
    }
  }

  throw new ApiError('Request failed after retries.', 500);
}

// Convert Firebase user & Firestore profile to Receipto User model
async function resolveUserProfile(firebaseUser: FirebaseUser): Promise<User> {
  let profile: User | null = null;
  try {
    profile = await getFirestoreUserProfile(firebaseUser.uid);
  } catch (err) {
    console.warn('Could not retrieve user profile from Firestore, creating initial profile:', err);
  }

  if (profile) {
    // Keep email_verified in sync with Firebase Auth
    if (firebaseUser.emailVerified && !profile.email_verified) {
      profile.email_verified = true;
      try {
        await updateFirestoreUserProfile(firebaseUser.uid, { email_verified: true });
      } catch (err) {
        console.warn('Could not sync email verification state:', err);
      }
    }
    return profile;
  }

  // Create initial profile in Firestore
  const newProfile = await setFirestoreUserProfile(firebaseUser.uid, {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    email_verified: firebaseUser.emailVerified,
    role: 'USER',
    status: 'ACTIVE',
    terms_accepted_at: new Date().toISOString(),
    terms_version: '1.0',
  });
  return newProfile;
}

export const api = {
  // ==========================================
  // Authentication via Firebase Auth + Firestore
  // ==========================================
  getMe: async () => {
    // Immediate resolution if currentUser is already cached by Firebase
    let currentUser: FirebaseUser | null = auth.currentUser;
    if (!currentUser) {
      currentUser = await new Promise<FirebaseUser | null>((resolve) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          resolve(null);
        }, 2000);
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve(user);
        });
      });
    }

    if (!currentUser) {
      throw new ApiError('Unauthorized. Please log in.', 401);
    }

    const user = await resolveUserProfile(currentUser);
    const token = await currentUser.getIdToken();
    setStoredToken(token);

    return {
      user,
      requires_verification: !currentUser.emailVerified,
      email_delivery: 'sent' as const,
      message: currentUser.emailVerified ? undefined : 'Please check your inbox to verify your email address.',
      dev_preview_otp: undefined as string | undefined,
    };
  },

  login: async (credentials: { email: string; password: string }) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, credentials.email.trim(), credentials.password);
      const user = await resolveUserProfile(cred.user);
      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: !cred.user.emailVerified,
        email_delivery: 'sent' as const,
        email_sent: true,
        message: cred.user.emailVerified ? undefined : 'Please check your inbox to verify your email address.',
        dev_preview_otp: undefined as string | undefined,
      };
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        throw new ApiError('Invalid email or password.', 401);
      }
      if (err.code === 'auth/too-many-requests') {
        throw new ApiError('Too many unsuccessful login attempts. Please try again later.', 429);
      }
      throw new ApiError(err.message || 'Authentication failed.', 400);
    }
  },

  register: async (data: {
    email: string;
    password: string;
    confirm_password?: string;
    name: string;
    business_name?: string;
    terms_accepted: boolean;
  }) => {
    try {
      const cleanEmail = data.email.trim().toLowerCase();
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, data.password);

      if (data.name) {
        await updateFirebaseProfile(cred.user, { displayName: data.name });
      }

      // Send Firebase verification email
      try {
        await sendEmailVerification(cred.user);
      } catch (e) {
        console.warn('sendEmailVerification non-blocking notice:', e);
      }

      // Persist user record in Cloud Firestore
      const user = await setFirestoreUserProfile(cred.user.uid, {
        id: cred.user.uid,
        email: cleanEmail,
        name: data.name.trim(),
        business_name: data.business_name?.trim() || '',
        email_verified: false,
        role: 'USER',
        status: 'ACTIVE',
        terms_accepted_at: new Date().toISOString(),
        terms_version: '1.0',
      });

      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: true,
        email_delivery: 'sent' as const,
        email_sent: true,
        message: 'A verification link has been sent to your email. Please check your inbox and spam folder.',
        dev_preview_otp: undefined as string | undefined,
      };
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        throw new ApiError('An account with this email address already exists.', 409);
      }
      if (err.code === 'auth/weak-password') {
        throw new ApiError('Password should be at least 8 characters.', 400);
      }
      throw new ApiError(err.message || 'Registration failed.', 400);
    }
  },

  loginWithGoogle: async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = await resolveUserProfile(cred.user);
      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: !cred.user.emailVerified,
      };
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        throw new ApiError(
          'Google Sign-In is not yet enabled in Firebase Console. Please enable Google under Authentication > Sign-in method.',
          400
        );
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new ApiError(
          'This domain is not yet added to Authorized Domains in Firebase Console (Authentication > Settings > Authorized domains).',
          400
        );
      }
      if (err.code === 'auth/popup-closed-by-user') {
        throw new ApiError('Sign-in popup was closed before completing authentication.', 400);
      }
      throw new ApiError(err.message || 'Google authentication failed.', 400);
    }
  },

  sendPasswordReset: async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true, message: 'Password reset link sent to your email address.' };
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        // Return generic success for privacy
        return { success: true, message: 'If an account exists, a password reset link has been dispatched.' };
      }
      throw new ApiError(err.message || 'Failed to dispatch password reset email.', 400);
    }
  },

  verifyEmail: async (data: { code: string; email?: string; user_id?: string }) => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        const user = await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
        return {
          success: true,
          message: 'Email verified successfully.',
          user,
        };
      }
    }

    // Support 6-digit code validation with server endpoint or mark verified
    try {
      const res = await request<{ success: boolean; message: string; user: any; token?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (auth.currentUser) {
        await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
      }
      return res;
    } catch {
      // In Firebase mode, if the user reloaded their verified status, mark verified
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          const user = await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
          return { success: true, message: 'Email verified successfully.', user };
        }
      }
      throw new ApiError('Verification pending. Please click the link sent to your email, or check spam folder.', 400);
    }
  },

  resendVerificationCode: async (data: { email?: string; user_id?: string }) => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        return {
          success: true,
          message: 'Verification email sent. Please check your inbox and spam folder.',
          email_delivery: 'sent' as const,
          email_sent: true,
          cooldown_seconds: 60,
        };
      } catch (err: any) {
        if (err.code === 'auth/too-many-requests') {
          return {
            success: false,
            message: 'Too many requests. Please wait a minute before requesting another email.',
            email_delivery: 'error' as const,
            cooldown_seconds: 60,
          };
        }
      }
    }

    return request<{
      success: boolean;
      message: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
      cooldown_seconds?: number;
    }>('/api/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  changeRegistrationEmail: async (data: { new_email: string; current_email?: string; user_id?: string }) => {
    return request<{
      success: boolean;
      message: string;
      email: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
    }>('/api/auth/change-registration-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAccount: async () => {
    const user = auth.currentUser;
    if (user) {
      await user.delete();
    }
    setStoredToken(null);
    return { success: true, message: 'Account deleted successfully.' };
  },

  logout: async () => {
    try {
      await signOut(auth);
      await request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      }).catch(() => {});
    } finally {
      setStoredToken(null);
    }
  },

  updatePassword: async (data: { current_password: string; new_password: string }) => {
    return request<{ message: string }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ==========================================
  // Dashboard & Analytics (Cloud Firestore)
  // ==========================================
  getDashboard: async () => {
    const user = auth.currentUser;
    if (!user) {
      return {
        stats: {
          total_outstanding: 0,
          total_overdue: 0,
          total_paid: 0,
          invoice_counts: { total: 0, paid: 0, overdue: 0, unpaid: 0, cancelled: 0 },
          client_count: 0,
          urgent_invoices: [],
          recent_activity: [],
          upcoming_due_invoices: [],
        },
      };
    }
    const stats = await getFirestoreDashboardStats(user.uid);
    return { stats };
  },

  // ==========================================
  // Client Management (Cloud Firestore)
  // ==========================================
  getClients: async () => {
    const user = auth.currentUser;
    if (!user) return { clients: [] };
    const clients = await getFirestoreClients(user.uid);
    return { clients };
  },

  getClient: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const client = await getFirestoreClient(user.uid, id);
    if (!client) throw new ApiError('Client not found', 404);
    return { client };
  },

  createClient: async (clientData: { name: string; email: string; phone?: string; company?: string; address?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    // Enforce tier limits
    const sub = await getFirestoreSubscription(user.uid);
    if (sub.usage.client_limit_reached) {
      throw new ApiError(
        `Client limit reached for your ${sub.usage.plan} tier (${sub.usage.max_clients} clients). Please upgrade to add more clients.`,
        403
      );
    }

    const client = await createFirestoreClient(user.uid, clientData);
    return { client };
  },

  updateClient: async (id: string, clientData: Partial<{ name: string; email: string; phone?: string; company?: string; address?: string }>) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const client = await updateFirestoreClient(user.uid, id, clientData);
    return { client };
  },

  deleteClient: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await deleteFirestoreClient(user.uid, id);
    return { message: 'Client deleted successfully.' };
  },

  // ==========================================
  // Invoice Management (Cloud Firestore)
  // ==========================================
  getInvoices: async (params?: { status?: string; client_id?: string; search?: string }) => {
    const user = auth.currentUser;
    if (!user) return { invoices: [] };
    const invoices = await getFirestoreInvoices(user.uid, params);
    return { invoices };
  },

  getInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await getFirestoreInvoice(user.uid, id);
    if (!invoice) throw new ApiError('Invoice not found', 404);
    return { invoice };
  },

  createInvoice: async (invoiceData: {
    client_id: string;
    invoice_number: string;
    amount: number;
    currency?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
  }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    // Enforce tier limits
    const sub = await getFirestoreSubscription(user.uid);
    if (sub.usage.invoice_limit_reached) {
      throw new ApiError(
        `Invoice limit reached for your ${sub.usage.plan} tier (${sub.usage.max_invoices_per_month} invoices). Please upgrade to add more invoices.`,
        403
      );
    }

    const invoice = await createFirestoreInvoice(user.uid, invoiceData);
    return { invoice };
  },

  updateInvoice: async (
    id: string,
    data: Partial<{
      client_id: string;
      invoice_number: string;
      amount: number;
      currency?: string;
      issue_date: string;
      due_date: string;
      notes?: string;
    }>
  ) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await updateFirestoreInvoice(user.uid, id, data);
    return { invoice };
  },

  markInvoicePaid: async (id: string, paid_date?: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await markFirestoreInvoicePaid(user.uid, id, paid_date);
    return { invoice, message: 'Invoice marked as paid.' };
  },

  cancelInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await cancelFirestoreInvoice(user.uid, id);
    return { invoice, message: 'Invoice cancelled.' };
  },

  deleteInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await deleteFirestoreInvoice(user.uid, id);
    return { message: 'Invoice deleted successfully.' };
  },

  // ==========================================
  // Reminders & Email Dispatches
  // ==========================================
  getReminders: async (invoiceId?: string) => {
    const user = auth.currentUser;
    if (!user) return { reminders: [] };
    const reminders = await getFirestoreReminders(user.uid, invoiceId);
    return { reminders };
  },

  previewReminder: async (invoice_id: string, tone: 'friendly' | 'standard' | 'urgent', custom_message?: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    // Call server preview endpoint with fallback to client generator
    try {
      return await request<{ preview: { subject: string; html: string; text: string }; recipient: string; isEmailConfigured: boolean }>(
        '/api/reminders/preview',
        {
          method: 'POST',
          body: JSON.stringify({ invoice_id, tone, custom_message }),
        }
      );
    } catch {
      const inv = await getFirestoreInvoice(user.uid, invoice_id);
      const safeInvoice = inv?.invoice_number || invoice_id;
      return {
        preview: {
          subject: `Payment Reminder: Invoice #${safeInvoice}`,
          html: `<p>Payment reminder for invoice #${safeInvoice}</p>`,
          text: `Payment reminder for invoice #${safeInvoice}`,
        },
        recipient: inv?.client_email || 'client@example.com',
        isEmailConfigured: false,
      };
    }
  },

  sendReminder: async (invoice_id: string, tone: 'friendly' | 'standard' | 'urgent', custom_message?: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    const inv = await getFirestoreInvoice(user.uid, invoice_id);
    if (!inv) throw new ApiError('Invoice not found', 404);

    let res: any;
    try {
      res = await request<{ success: boolean; configured: boolean; message: string; reminder?: any }>('/api/reminders/send', {
        method: 'POST',
        body: JSON.stringify({ invoice_id, tone, custom_message }),
      });
    } catch (err: any) {
      res = {
        success: false,
        configured: false,
        message: err.message || 'Email dispatch failed. Please verify Resend credentials.',
      };
    }

    // Persist reminder document in Cloud Firestore
    const reminder = await createFirestoreReminder(user.uid, {
      invoice_id,
      client_id: inv.client_id,
      recipient_email: inv.client_email || '',
      subject: `Invoice #${inv.invoice_number} Payment Reminder`,
      message: custom_message || `Payment reminder for invoice #${inv.invoice_number} due on ${inv.due_date}`,
      sent_at: res.success ? new Date().toISOString() : undefined,
      status: res.success ? 'SENT' : res.configured ? 'FAILED' : 'CONFIG_REQUIRED',
      error_message: res.success ? undefined : res.message,
      reminder_type: 'manual',
      attempt_count: 1,
    });

    return {
      success: res.success,
      configured: res.configured ?? false,
      message: res.message || 'Reminder logged successfully.',
      reminder,
    };
  },

  // ==========================================
  // Activity Logs & Audit Trail (Cloud Firestore)
  // ==========================================
  getActivity: async (limit = 50): Promise<{ logs: ActivityLog[]; upgrade_required?: boolean; plan?: string }> => {
    const user = auth.currentUser;
    if (!user) return { logs: [], upgrade_required: false, plan: 'FREE' };
    const logs = await getFirestoreActivityLogs(user.uid, limit);
    return { logs, upgrade_required: false, plan: 'FREE' };
  },

  getConfig: () => request<any>('/api/settings/config'),

  updateProfile: async (profile: { name?: string; business_name?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const updatedUser = await updateFirestoreUserProfile(user.uid, profile);
    return { message: 'Profile updated successfully.', user: updatedUser };
  },

  runAutomatedReminders: () =>
    request<{ message: string; processed: number; results: any[] }>('/api/reminders/automate', {
      method: 'POST',
    }),

  saveReminderSchedule: (cadence: string) =>
    request<{ message: string; cadence: string }>('/api/reminders/schedules', {
      method: 'POST',
      body: JSON.stringify({ cadence }),
    }),

  // ==========================================
  // Billing & Subscriptions (Paddle + Cloud Firestore)
  // ==========================================
  getSubscription: async (): Promise<SubscriptionDetails> => {
    const user = auth.currentUser;
    if (!user) {
      return {
        subscription: {
          id: 'sub_guest',
          user_id: 'guest',
          plan: 'FREE',
          status: 'active',
          billing_interval: 'monthly',
          provider: 'manual',
          provider_customer_id: null,
          provider_subscription_id: null,
          current_period_start: new Date().toISOString(),
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: {
          plan: 'FREE',
          client_count: 0,
          max_clients: 5,
          clients_remaining: 5,
          client_limit_reached: false,
          invoices_this_period: 0,
          invoice_count: 0,
          max_invoices_per_month: 10,
          invoices_remaining: 10,
          invoice_limit_reached: false,
          period_start: new Date().toISOString(),
          period_end: null,
          automated_reminders_count: 0,
          automated_reminders_enabled: false,
          csv_export_enabled: false,
          full_activity_history: false,
        },
        plan_config: PLAN_CONFIGS.FREE,
        is_active: true,
        is_owner_demo: false,
        access_mode: 'free' as const,
        billing_provider: 'manual' as const,
        paddle_configured: true,
      };
    }

    try {
      return await getFirestoreSubscription(user.uid);
    } catch {
      const isOwner = user.email?.trim().toLowerCase() === 'receiptobusiness@gmail.com' || user.email?.trim().toLowerCase() === 'rshimelis48@gmail.com';
      return {
        subscription: {
          id: `sub_${user.uid}`,
          user_id: user.uid,
          plan: 'FREE' as const,
          status: 'active' as const,
          billing_interval: 'monthly' as const,
          provider: 'manual' as const,
          provider_customer_id: null,
          provider_subscription_id: null,
          current_period_start: new Date().toISOString(),
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: {
          plan: 'FREE' as const,
          client_count: 0,
          max_clients: 5,
          clients_remaining: 5,
          client_limit_reached: false,
          invoice_count: 0,
          invoices_this_period: 0,
          max_invoices_per_month: 10,
          invoices_remaining: 10,
          invoice_limit_reached: false,
          period_start: new Date().toISOString(),
          period_end: null,
          automated_reminders_count: 0,
          automated_reminders_enabled: false,
          csv_export_enabled: false,
          full_activity_history: false,
        },
        plan_config: PLAN_CONFIGS.FREE,
        is_active: true,
        is_owner_demo: isOwner,
        owner_demo_available_plans: ['FREE', 'STARTER', 'GROWTH'],
        access_mode: isOwner ? 'owner_demo' : ('free' as const),
        billing_provider: 'manual' as const,
        paddle_configured: true,
      };
    }
  },

  createCheckoutSession: (plan: 'STARTER' | 'GROWTH', interval: 'monthly' | 'annual') =>
    request<{
      success: boolean;
      paddle_configured: boolean;
      environment: string;
      client_token: string;
      price_id: string;
      plan: 'STARTER' | 'GROWTH';
      interval: 'monthly' | 'annual';
      customer_email?: string;
      customer_id?: string;
      custom_data?: any;
      checkout_params: any;
    }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    }),

  createCustomerPortalSession: () =>
    request<{
      subscription_id?: string;
      status?: string;
      plan?: string;
      update_payment_method_url?: string | null;
      cancel_url?: string | null;
      message?: string;
    }>('/api/billing/portal', {
      method: 'POST',
    }),

  cancelSubscription: async () => {
    const user = auth.currentUser;
    if (user) {
      await setFirestoreSubscription(user.uid, {
        plan: 'FREE',
        status: 'canceled',
      });
    }
    return {
      message: 'Subscription cancelled successfully.',
      subscription: { plan: 'FREE', status: 'canceled' },
    };
  },

  confirmSession: async (data: string | { session_id?: string; transaction_id?: string; subscription_id?: string; customer_id?: string; plan?: string; interval?: string }) => {
    const user = auth.currentUser;
    const plan = typeof data === 'object' && data.plan ? (data.plan as any) : 'STARTER';
    const interval = typeof data === 'object' && data.interval ? (data.interval as any) : 'monthly';

    if (user) {
      await setFirestoreSubscription(user.uid, {
        plan,
        billing_interval: interval,
        status: 'active',
        provider: 'paddle',
        paddle_subscription_id: typeof data === 'object' ? data.subscription_id : undefined,
      });
      return await getFirestoreSubscription(user.uid);
    }
    throw new ApiError('Unauthorized', 401);
  },

  simulatePlan: async (plan: 'FREE' | 'STARTER' | 'GROWTH', interval?: 'monthly' | 'annual') => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await setFirestoreSubscription(user.uid, {
      plan,
      billing_interval: interval || 'monthly',
      status: 'active',
      provider: 'manual',
    });
    return await getFirestoreSubscription(user.uid);
  },

  switchOwnerDemoPlan: async (plan: 'FREE' | 'STARTER' | 'GROWTH') => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await setFirestoreSubscription(user.uid, {
      plan,
      status: 'active',
      provider: 'manual',
    });
    try {
      await request('/api/billing/owner-demo/switch-plan', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
    } catch {
      // Backend sync optional in pure client Firestore mode
    }
    return await getFirestoreSubscription(user.uid);
  },

  // ==========================================
  // Administrative Operations
  // ==========================================
  getAdminDashboard: () => request<import('./types.js').AdminDashboardStats>('/api/admin/dashboard'),
  getAdminUsers: (params?: { search?: string; role?: string; status?: string; plan?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    if (params?.plan) query.set('plan', params.plan);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ users: import('./types.js').AdminUserItem[]; total: number; page: number; totalPages: number }>(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },
  suspendUser: (userId: string) =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/suspend`, { method: 'POST' }),
  restoreUser: (userId: string) =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/restore`, { method: 'POST' }),
  updateUserRole: (userId: string, role: 'USER' | 'ADMIN') =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  getAdminSubscriptions: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ subscriptions: import('./types.js').AdminSubscriptionItem[]; total: number; page: number; totalPages: number }>(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`);
  },
  getAdminActivity: (params?: { userId?: string; action?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.action) query.set('action', params.action);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ logs: any[]; total: number; page: number; totalPages: number }>(`/api/admin/activity${qs ? `?${qs}` : ''}`);
  },
  getAdminSystemHealth: () => request<import('./types.js').AdminSystemHealth>('/api/admin/system'),
  triggerWorkerCycle: () => request<{ success: boolean; processedUsers: number; sentReminders: number; errors: any[] }>('/api/admin/system/trigger-worker', { method: 'POST' }),
};
