import express from 'express';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserPassword,
  updateUserProfile,
  updateUserEmail,
  deleteUserAccount,
  createSession,
  deleteSession,
  deleteUserSessions,
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  cancelInvoice,
  deleteInvoice,
  createReminder,
  getReminders,
  createActivityLog,
  getActivityLogs,
  getDashboardStats,
  checkDatabaseHealth,
  getSubscription,
  upsertSubscription,
  getUserUsage,
  checkCanCreateClient,
  checkCanCreateInvoice,
  checkFeatureAccess,
  getSubscriptionDetails,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent,
  getSubscriptionByCustomerId,
  getSubscriptionByProviderSubId,
  updateUserLastLogin,
  getAdminDashboardStats,
  getAdminUsers,
  suspendUser,
  restoreUser,
  updateUserRole,
  getAdminSubscriptions,
  getAdminActivityLogs,
  getAdminSystemHealth,
} from './db.js';
import {
  isStripeConfigured,
  createStripeCheckoutSession,
  createStripePortalSession,
  retrieveStripeCheckoutSession,
  constructStripeWebhookEvent,
} from './stripe.js';
import {
  PLAN_CONFIGS,
  type PlanTier,
  type BillingInterval,
  getEffectivePlan,
  isPaidSubscriptionActive,
} from './plans.js';
import {
  hashPassword,
  verifyPassword,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireVerified,
  requireAdmin,
  optionalAuth,
  authRateLimiter,
  type AuthenticatedRequest,
} from './auth.js';
import {
  issueAndSendVerification,
  verifyUserOTP,
  resendVerificationCode,
  RESEND_COOLDOWN_SECONDS,
} from './verification.js';
import {
  sendReminderEmail,
  generateReminderEmailContent,
  escapeHtml,
  sendSubscriptionConfirmationEmail,
  sendPaymentFailureEmail,
  sendSubscriptionCancelledEmail,
} from './email.js';
import { getWorkerStatus, runWorkerCycle } from './worker.js';

export const router = express.Router();

// Email validation helper
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Date validation helper (YYYY-MM-DD)
function isValidDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

// ==========================================
// 1. HEALTH CHECKS
// ==========================================
export async function healthHandler(req: Request, res: Response) {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(200).json({
      status: 'ok',
      app: 'Receipto',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbHealth.connected,
        engine: dbHealth.engine,
        configured: Boolean(process.env.DATABASE_URL),
        details: dbHealth.details,
      },
      email_service: {
        configured: Boolean(process.env.RESEND_API_KEY),
        provider: 'Resend',
      },
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      app: 'Receipto',
      error: 'Health check encountered an internal failure',
    });
  }
}

router.get('/health', healthHandler);

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================

// POST /api/auth/register
router.post('/auth/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, confirm_password, name, business_name, terms_accepted } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (!terms_accepted || terms_accepted !== true) {
      return res.status(400).json({ error: 'You must agree to the Terms and Conditions and Privacy Policy to create an account.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email: cleanEmail,
      password_hash: passwordHash,
      name: name.trim(),
      business_name: business_name?.trim() || `${name.trim()}'s Business`,
      email_verified: false,
      terms_accepted_at: new Date().toISOString(),
      terms_version: '1.0',
    });

    // Issue cryptographic 6-digit OTP challenge and dispatch real transactional email
    const verifResult = await issueAndSendVerification(user);

    // Create session (unverified status)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(user.id, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    await createActivityLog(user.id, 'USER_REGISTERED', `Account registered for ${user.email} (Pending Email Verification)`, { email: user.email });

    res.status(201).json({
      message: verifResult.statusText,
      requires_verification: true,
      email_delivery: verifResult.emailDelivery,
      email_sent: verifResult.emailDelivery === 'sent',
      email_error: verifResult.emailError,
      dev_preview_otp: verifResult.devPreviewOtp,
      token, // provided for automated clients or fallback
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        business_name: user.business_name,
        email_verified: false,
        role: user.role || 'USER',
        status: user.status || 'ACTIVE',
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('[Register Error]', err);
    res.status(500).json({ error: 'Registration failed due to a server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/auth/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    // Check if account has not yet completed email verification
    if (!user.email_verified) {
      // Re-issue a fresh verification code so they can verify immediately
      const verifResult = await resendVerificationCode(user.id);

      // Create session for verification screen context
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createSession(user.id, token, expiresAt);
      setAuthCookie(req, res, token, expiresAt);

      return res.status(200).json({
        message: verifResult.message,
        requires_verification: true,
        email_delivery: verifResult.emailDelivery,
        email_sent: verifResult.emailDelivery === 'sent',
        email_error: verifResult.emailError,
        dev_preview_otp: verifResult.devPreviewOtp,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          business_name: user.business_name,
          email_verified: false,
          role: user.role || 'USER',
          status: user.status || 'ACTIVE',
          created_at: user.created_at,
        },
      });
    }

    // Normal verified account login (7-day session)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(user.id, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    await updateUserLastLogin(user.id);
    await createActivityLog(user.id, 'USER_LOGGED_IN', `User logged in from ${req.ip || 'web'}`);

    res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        business_name: user.business_name,
        email_verified: true,
        role: user.role || 'USER',
        status: user.status || 'ACTIVE',
        last_login_at: new Date().toISOString(),
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Login failed due to a server error. Please try again.' });
  }
});

// POST /api/auth/verify-email
router.post('/auth/verify-email', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, email, user_id } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'A 6-digit verification code is required.' });
    }

    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
    }

    // Determine target user id
    let targetUserId = req.user?.id || user_id;
    if (!targetUserId && email && typeof email === 'string') {
      const u = await getUserByEmail(email.trim().toLowerCase());
      if (u) targetUserId = u.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Unable to identify the user for verification. Please provide your email address.' });
    }

    const result = await verifyUserOTP(targetUserId, cleanCode);
    if (!result.success) {
      const statusCode = result.reason === 'max_attempts_exceeded' ? 429 : result.reason === 'expired' ? 410 : 400;
      return res.status(statusCode).json({
        error: result.message,
        reason: result.reason,
        attempts_remaining: result.attemptsRemaining,
      });
    }

    // Verification successful! Establish fresh verified session
    const verifiedUser = result.user;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(verifiedUser.id, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    return res.status(200).json({
      success: true,
      message: 'Email address verified successfully. Welcome to Receipto!',
      token,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name,
        business_name: verifiedUser.business_name,
        email_verified: true,
        created_at: verifiedUser.created_at,
      },
    });
  } catch (err: any) {
    console.error('[Verify Email Error]', err);
    res.status(500).json({ error: 'Email verification failed due to a server error.' });
  }
});

// POST /api/auth/resend-code
router.post('/auth/resend-code', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, user_id } = req.body;
    let targetUserId = req.user?.id || user_id;
    if (!targetUserId && email && typeof email === 'string') {
      const u = await getUserByEmail(email.trim().toLowerCase());
      if (u) targetUserId = u.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Please specify your email address to resend the verification code.' });
    }

    const result = await resendVerificationCode(targetUserId);
    if (!result.success) {
      return res.status(429).json({
        error: result.message,
        cooldown_remaining: result.cooldownRemaining,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      email_delivery: result.emailDelivery,
      email_sent: result.emailDelivery === 'sent',
      email_error: result.emailError,
      dev_preview_otp: result.devPreviewOtp,
      cooldown_seconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (err: any) {
    console.error('[Resend Code Error]', err);
    res.status(500).json({ error: 'Failed to resend verification code.' });
  }
});

// POST /api/auth/change-registration-email
router.post('/auth/change-registration-email', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { current_email, new_email, user_id } = req.body;
    let targetUserId = req.user?.id || user_id;
    if (!targetUserId && current_email && typeof current_email === 'string') {
      const u = await getUserByEmail(current_email.trim().toLowerCase());
      if (u) targetUserId = u.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'User could not be identified.' });
    }

    const user = await getUserById(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'Verified accounts cannot change their registration email via this endpoint.' });
    }

    if (!new_email || !isValidEmail(new_email)) {
      return res.status(400).json({ error: 'A valid new email address is required.' });
    }

    const cleanNewEmail = new_email.trim().toLowerCase();
    if (cleanNewEmail === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'New email address must be different from current email.' });
    }

    const existing = await getUserByEmail(cleanNewEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Update email in persistent database
    await updateUserEmail(user.id, cleanNewEmail);

    const updatedUser = await getUserById(user.id);
    const verif = await issueAndSendVerification(updatedUser!);

    return res.status(200).json({
      success: true,
      message: verif.statusText,
      email: cleanNewEmail,
      email_delivery: verif.emailDelivery,
      email_sent: verif.emailDelivery === 'sent',
      email_error: verif.emailError,
      dev_preview_otp: verif.devPreviewOtp,
    });
  } catch (err: any) {
    console.error('[Change Registration Email Error]', err);
    res.status(500).json({ error: 'Failed to update email address.' });
  }
});

// POST /api/auth/logout
router.post('/auth/logout', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cookieVal = req.cookies?.receipto_session || req.headers['authorization']?.replace('Bearer ', '');
    if (cookieVal) {
      const token = cookieVal.includes('.') ? cookieVal.split('.')[0] : cookieVal;
      await deleteSession(token);
    }
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err: any) {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logged out' });
  }
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      business_name: user.business_name,
      email_verified: Boolean(user.email_verified),
      role: user.role || 'USER',
      status: user.status || 'ACTIVE',
      last_login_at: user.last_login_at || null,
      terms_accepted_at: user.terms_accepted_at,
      terms_version: user.terms_version,
      created_at: user.created_at,
    },
    requires_verification: !user.email_verified,
  });
});

// DELETE /api/auth/account (Self account deletion & clean purge)
router.delete('/auth/account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await deleteUserAccount(userId);
    clearAuthCookie(res);
    res.status(200).json({ success: true, message: 'Account and all associated records deleted successfully.' });
  } catch (err: any) {
    console.error('[Delete Account Error]', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// POST /api/test/purge-user (Test endpoint to cleanly delete test accounts by email)
router.post('/test/purge-user', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email parameter is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(cleanEmail);
    if (user) {
      await deleteUserAccount(user.id);
      return res.status(200).json({ success: true, message: `Purged user and associated data for ${cleanEmail}` });
    }
    return res.status(200).json({ success: true, message: `User ${cleanEmail} not found, nothing to purge` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/password
router.post('/auth/password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user!.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const isMatch = await verifyPassword(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(new_password);
    await updateUserPassword(userId, newHash);

    // Invalidate all previous sessions and create a fresh one for the current user
    await deleteUserSessions(userId);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(userId, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    await createActivityLog(userId, 'PASSWORD_CHANGED', 'Password changed and existing sessions invalidated');

    res.status(200).json({ message: 'Password updated successfully', token });
  } catch (err: any) {
    console.error('[Password Update Error]', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// ==========================================
// PROTECTED APPLICATION ROUTE ENFORCEMENT
// ==========================================
// All client, invoice, dashboard, reminder, activity, and settings operations
// strictly require an authenticated account with verified email (email_verified = true).
router.use('/clients', requireAuth, requireVerified);
router.use('/invoices', requireAuth, requireVerified);
router.use('/dashboard', requireAuth, requireVerified);
router.use('/reminders', requireAuth, requireVerified);
router.use('/activity', requireAuth, requireVerified);
router.use('/settings', requireAuth, requireVerified);

// ==========================================
// 3. CLIENT MANAGEMENT ROUTES
// ==========================================

// GET /api/clients
router.get('/clients', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const clients = await getClients(userId);
    res.status(200).json({ clients });
  } catch (err: any) {
    console.error('[Get Clients Error]', err);
    res.status(500).json({ error: 'Failed to retrieve clients.' });
  }
});

// POST /api/clients
router.post('/clients', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, email, phone, company, address } = req.body;

    // Enforce Plan Limits
    const limitCheck = await checkCanCreateClient(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.reason,
        code: 'PLAN_LIMIT_REACHED',
        limit_type: 'clients',
        current: limitCheck.current,
        max: limitCheck.max,
        plan: limitCheck.plan,
        upgrade_required: true,
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Client name is required.' });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid client email address is required.' });
    }

    const client = await createClient(userId, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      company: company?.trim(),
      address: address?.trim(),
    });

    await createActivityLog(userId, 'CLIENT_CREATED', `Added client ${client.name} (${client.email})`, { clientId: client.id });

    res.status(201).json({ client });
  } catch (err: any) {
    console.error('[Create Client Error]', err);
    res.status(500).json({ error: 'Failed to create client.' });
  }
});

// GET /api/clients/:id
router.get('/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const client = await getClientById(userId, req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }
    res.status(200).json({ client });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve client.' });
  }
});

// PUT /api/clients/:id
router.put('/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, email, phone, company, address } = req.body;

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const updated = await updateClient(userId, req.params.id, {
      name,
      email,
      phone,
      company,
      address,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }

    await createActivityLog(userId, 'CLIENT_UPDATED', `Updated client ${updated.name}`, { clientId: updated.id });

    res.status(200).json({ client: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update client.' });
  }
});

// DELETE /api/clients/:id
router.delete('/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const client = await getClientById(userId, req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }

    const success = await deleteClient(userId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Client could not be deleted.' });
    }

    await createActivityLog(userId, 'CLIENT_DELETED', `Deleted client ${client.name}`, { clientId: req.params.id });

    res.status(200).json({ message: 'Client and associated invoices deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete client.' });
  }
});

// ==========================================
// 4. INVOICE MANAGEMENT ROUTES
// ==========================================

// GET /api/invoices
router.get('/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, client_id, search, sort_by, sort_order } = req.query as Record<string, string>;

    const invoices = await getInvoices(userId, {
      status,
      clientId: client_id,
      search,
      sortBy: sort_by,
      sortOrder: sort_order as 'asc' | 'desc',
    });

    res.status(200).json({ invoices });
  } catch (err: any) {
    console.error('[Get Invoices Error]', err);
    res.status(500).json({ error: 'Failed to retrieve invoices.' });
  }
});

// GET /api/invoices/export/csv
router.get('/invoices/export/csv', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const accessCheck = await checkFeatureAccess(userId, 'csvExport');
    if (!accessCheck.allowed) {
      return res.status(403).json({
        error: 'CSV invoice export is a premium feature available on Starter and Growth plans.',
        code: 'FEATURE_LOCKED',
        feature: 'csvExport',
        plan: accessCheck.plan,
        upgrade_required: true,
      });
    }

    const invoices = await getInvoices(userId);
    const header = ['Invoice Number', 'Client Name', 'Client Email', 'Company', 'Amount', 'Currency', 'Issue Date', 'Due Date', 'Status', 'Paid Date', 'Notes'];
    const rows = invoices.map(inv => [
      inv.invoice_number,
      inv.client_name || '',
      inv.client_email || '',
      inv.client_company || '',
      inv.amount.toFixed(2),
      inv.currency,
      inv.issue_date,
      inv.due_date,
      inv.payment_status,
      inv.paid_date ? inv.paid_date.split('T')[0] : '',
      (inv.notes || '').replace(/"/g, '""'),
    ].map(val => `"${val}"`).join(','));

    const csvContent = [header.map(h => `"${h}"`).join(','), ...rows].join('\r\n');

    await createActivityLog(userId, 'CSV_EXPORTED', `Exported ${invoices.length} invoices to CSV`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="receipto-invoices-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(200).send(csvContent);
  } catch (err: any) {
    console.error('[CSV Export Error]', err);
    res.status(500).json({ error: 'Failed to generate invoice export CSV.' });
  }
});

// POST /api/invoices
router.post('/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { client_id, invoice_number, amount, currency, issue_date, due_date, notes } = req.body;

    // Enforce Plan Limits
    const limitCheck = await checkCanCreateInvoice(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.reason,
        code: 'PLAN_LIMIT_REACHED',
        limit_type: 'invoices',
        current: limitCheck.current,
        max: limitCheck.max,
        plan: limitCheck.plan,
        upgrade_required: true,
      });
    }

    if (!client_id) {
      return res.status(400).json({ error: 'A client must be selected for the invoice.' });
    }

    // Verify client belongs to authenticated user
    const client = await getClientById(userId, client_id);
    if (!client) {
      return res.status(404).json({ error: 'Selected client does not exist in your account.' });
    }

    if (!invoice_number || typeof invoice_number !== 'string' || invoice_number.trim().length === 0) {
      return res.status(400).json({ error: 'Invoice number is required (e.g. INV-001).' });
    }

    // Check unique invoice number for this user
    const existingInv = await getInvoiceByNumber(userId, invoice_number.trim());
    if (existingInv) {
      return res.status(409).json({ error: `Invoice number "${invoice_number.trim()}" already exists in your account.` });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Invoice amount must be a positive number.' });
    }

    if (!issue_date || !isValidDate(issue_date)) {
      return res.status(400).json({ error: 'Valid issue date (YYYY-MM-DD) is required.' });
    }

    if (!due_date || !isValidDate(due_date)) {
      return res.status(400).json({ error: 'Valid due date (YYYY-MM-DD) is required.' });
    }

    const invoice = await createInvoice(userId, {
      client_id,
      invoice_number: invoice_number.trim(),
      amount: Math.round(numAmount * 100) / 100,
      currency: currency || 'USD',
      issue_date,
      due_date,
      notes,
    });

    await createActivityLog(
      userId,
      'INVOICE_CREATED',
      `Created invoice #${invoice.invoice_number} for ${client.name} (${invoice.currency} ${invoice.amount})`,
      { invoiceId: invoice.id, amount: invoice.amount, status: invoice.payment_status }
    );

    res.status(201).json({
      invoice: {
        ...invoice,
        client_name: client.name,
        client_email: client.email,
        client_company: client.company,
      },
    });
  } catch (err: any) {
    console.error('[Create Invoice Error]', err);
    res.status(500).json({ error: 'Failed to create invoice.' });
  }
});

// GET /api/invoices/:id
router.get('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const invoice = await getInvoiceById(userId, req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found or does not belong to your account.' });
    }
    res.status(200).json({ invoice });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve invoice.' });
  }
});

// PUT /api/invoices/:id
router.put('/api/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { client_id, invoice_number, amount, currency, issue_date, due_date, notes } = req.body;

    const existing = await getInvoiceById(userId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (existing.payment_status === 'PAID') {
      return res.status(400).json({ error: 'Paid invoices cannot be edited. Mark as unpaid or create a new invoice.' });
    }

    if (client_id) {
      const client = await getClientById(userId, client_id);
      if (!client) {
        return res.status(404).json({ error: 'Client not found.' });
      }
    }

    if (invoice_number && invoice_number.trim() !== existing.invoice_number) {
      const dupe = await getInvoiceByNumber(userId, invoice_number.trim());
      if (dupe) {
        return res.status(409).json({ error: `Invoice number "${invoice_number.trim()}" already exists.` });
      }
    }

    let numAmount: number | undefined = undefined;
    if (amount !== undefined) {
      numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Invoice amount must be greater than zero.' });
      }
    }

    if (issue_date && !isValidDate(issue_date)) {
      return res.status(400).json({ error: 'Valid issue date (YYYY-MM-DD) is required.' });
    }

    if (due_date && !isValidDate(due_date)) {
      return res.status(400).json({ error: 'Valid due date (YYYY-MM-DD) is required.' });
    }

    const updated = await updateInvoice(userId, req.params.id, {
      client_id,
      invoice_number,
      amount: numAmount,
      currency,
      issue_date,
      due_date,
      notes,
    });

    await createActivityLog(
      userId,
      'INVOICE_UPDATED',
      `Updated invoice #${updated?.invoice_number || existing.invoice_number}`,
      { invoiceId: req.params.id }
    );

    res.status(200).json({ invoice: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update invoice.' });
  }
});

// POST /api/invoices/:id/pay
router.post('/invoices/:id/pay', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { paid_date } = req.body;

    const invoice = await getInvoiceById(userId, req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (invoice.payment_status === 'PAID') {
      return res.status(400).json({ error: 'This invoice is already marked as paid.' });
    }

    if (invoice.payment_status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot mark a cancelled invoice as paid.' });
    }

    const updated = await markInvoicePaid(userId, req.params.id, paid_date);

    await createActivityLog(
      userId,
      'INVOICE_PAID',
      `Marked invoice #${invoice.invoice_number} as PAID (${invoice.currency} ${invoice.amount})`,
      { invoiceId: invoice.id, amount: invoice.amount }
    );

    res.status(200).json({
      message: 'Invoice marked as paid successfully.',
      invoice: updated,
    });
  } catch (err: any) {
    console.error('[Pay Invoice Error]', err);
    res.status(500).json({ error: err.message || 'Failed to mark invoice as paid.' });
  }
});

// POST /api/invoices/:id/cancel
router.post('/invoices/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const invoice = await getInvoiceById(userId, req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (invoice.payment_status === 'PAID') {
      return res.status(400).json({ error: 'Cannot cancel an invoice that has already been paid.' });
    }

    const updated = await cancelInvoice(userId, req.params.id);

    await createActivityLog(
      userId,
      'INVOICE_CANCELLED',
      `Cancelled invoice #${invoice.invoice_number}`,
      { invoiceId: invoice.id }
    );

    res.status(200).json({
      message: 'Invoice cancelled successfully.',
      invoice: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel invoice.' });
  }
});

// DELETE /api/invoices/:id
router.delete('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const invoice = await getInvoiceById(userId, req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    await deleteInvoice(userId, req.params.id);

    await createActivityLog(
      userId,
      'INVOICE_DELETED',
      `Deleted invoice #${invoice.invoice_number}`,
      { invoiceId: req.params.id }
    );

    res.status(200).json({ message: 'Invoice deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete invoice.' });
  }
});

// ==========================================
// 5. DASHBOARD & ANALYTICS
// ==========================================

// GET /api/dashboard
router.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await getDashboardStats(userId);
    res.status(200).json({ stats });
  } catch (err: any) {
    console.error('[Dashboard Error]', err);
    res.status(500).json({ error: 'Failed to calculate dashboard statistics.' });
  }
});

// ==========================================
// 6. REMINDERS & EMAIL SYSTEM
// ==========================================

// GET /api/reminders
router.get('/reminders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoice_id } = req.query as { invoice_id?: string };
    const reminders = await getReminders(userId, invoice_id);
    res.status(200).json({ reminders });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve reminders.' });
  }
});

// POST /api/reminders/preview
router.post('/reminders/preview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoice_id, tone, custom_message } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'invoice_id is required.' });
    }

    const invoice = await getInvoiceById(userId, invoice_id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const client = await getClientById(userId, invoice.client_id);
    if (!client) {
      return res.status(404).json({ error: 'Client details missing.' });
    }

    const preview = generateReminderEmailContent({
      to: client.email,
      clientName: client.name,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      currency: invoice.currency,
      dueDate: invoice.due_date,
      businessName: req.user!.business_name || req.user!.name,
      tone: tone || 'standard',
      customMessage: custom_message,
    });

    res.status(200).json({
      preview,
      recipient: client.email,
      isEmailConfigured: Boolean(process.env.RESEND_API_KEY),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate reminder preview.' });
  }
});

// POST /api/reminders/send
router.post('/reminders/send', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoice_id, tone, custom_message } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'invoice_id is required.' });
    }

    const invoice = await getInvoiceById(userId, invoice_id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (invoice.payment_status === 'PAID') {
      return res.status(400).json({ error: 'Cannot send reminders for paid invoices.' });
    }

    const client = await getClientById(userId, invoice.client_id);
    if (!client) {
      return res.status(404).json({ error: 'Associated client record not found.' });
    }

    const emailOptions = {
      to: client.email,
      clientName: client.name,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      currency: invoice.currency,
      dueDate: invoice.due_date,
      businessName: req.user!.business_name || req.user!.name,
      tone: tone || 'standard',
      customMessage: custom_message,
    };

    const emailResult = await sendReminderEmail(emailOptions);
    const { subject, text } = generateReminderEmailContent(emailOptions);

    let status: 'SENT' | 'FAILED' | 'CONFIG_REQUIRED' = 'SENT';
    if (!emailResult.configured) {
      status = 'CONFIG_REQUIRED';
    } else if (!emailResult.success) {
      status = 'FAILED';
    }

    const reminder = await createReminder(userId, {
      invoice_id: invoice.id,
      client_id: client.id,
      recipient_email: client.email,
      subject,
      message: text,
      status,
      error_message: emailResult.error || (!emailResult.configured ? emailResult.statusText : undefined),
    });

    await createActivityLog(
      userId,
      'REMINDER_TRIGGERED',
      `Triggered reminder for invoice #${invoice.invoice_number} to ${client.email} (${status})`,
      { reminderId: reminder.id, status, configured: emailResult.configured }
    );

    res.status(200).json({
      success: emailResult.success,
      configured: emailResult.configured,
      message: emailResult.statusText,
      reminder,
    });
  } catch (err: any) {
    console.error('[Send Reminder Error]', err);
    res.status(500).json({ error: 'Failed to process reminder request.' });
  }
});

// POST /api/reminders/automate (Starter & Growth feature)
router.post('/reminders/automate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const accessCheck = await checkFeatureAccess(userId, 'automatedReminders');
    if (!accessCheck.allowed) {
      return res.status(403).json({
        error: 'Automated invoice follow-up reminders require a Starter or Growth subscription plan.',
        code: 'FEATURE_LOCKED',
        feature: 'automatedReminders',
        plan: accessCheck.plan,
        upgrade_required: true,
      });
    }

    const invoices = await getInvoices(userId, { status: 'OVERDUE' });
    const results: any[] = [];

    for (const invoice of invoices) {
      const client = await getClientById(userId, invoice.client_id);
      if (!client) continue;

      const emailOptions = {
        to: client.email,
        clientName: client.name,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        businessName: req.user!.business_name || req.user!.name,
        tone: 'standard' as const,
        customMessage: 'This is an automated follow-up reminder regarding your overdue balance.',
      };

      const emailResult = await sendReminderEmail(emailOptions);
      const { subject, text } = generateReminderEmailContent(emailOptions);

      let status: 'SENT' | 'FAILED' | 'CONFIG_REQUIRED' = 'SENT';
      if (!emailResult.configured) status = 'CONFIG_REQUIRED';
      else if (!emailResult.success) status = 'FAILED';

      const reminder = await createReminder(userId, {
        invoice_id: invoice.id,
        client_id: client.id,
        recipient_email: client.email,
        subject,
        message: text,
        status,
        error_message: emailResult.error || (!emailResult.configured ? emailResult.statusText : undefined),
      });

      results.push({ invoice_id: invoice.id, status, client: client.name, reminder_id: reminder.id });
    }

    await createActivityLog(
      userId,
      'AUTOMATED_REMINDERS_RUN',
      `Ran automated reminder cycle for ${results.length} overdue invoices`,
      { processed: results.length }
    );

    res.status(200).json({
      message: `Automated reminder cycle completed for ${results.length} overdue invoices.`,
      processed: results.length,
      results,
    });
  } catch (err: any) {
    console.error('[Automated Reminders Error]', err);
    res.status(500).json({ error: 'Failed to execute automated reminders.' });
  }
});

// POST /api/reminders/schedules (Growth exclusive feature)
router.post('/reminders/schedules', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const accessCheck = await checkFeatureAccess(userId, 'customReminderSchedules');
    if (!accessCheck.allowed) {
      return res.status(403).json({
        error: 'Custom reminder cadences and schedules are an exclusive feature of the Growth plan.',
        code: 'FEATURE_LOCKED',
        feature: 'customReminderSchedules',
        plan: accessCheck.plan,
        upgrade_required: true,
      });
    }

    const { cadence } = req.body;
    await createActivityLog(userId, 'SCHEDULES_UPDATED', 'Updated custom automated reminder schedule cadence');
    res.status(200).json({ message: 'Custom reminder schedule configured successfully.', cadence });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to configure reminder schedules.' });
  }
});

// ==========================================
// 7. ACTIVITY LOGS (Plan Gated)
// ==========================================

// GET /api/activity
router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fullAccess = await checkFeatureAccess(userId, 'fullActivityHistory');
    const requestedLimit = parseInt(req.query.limit as string) || 50;
    const effectiveLimit = fullAccess.allowed ? Math.min(requestedLimit, 100) : Math.min(requestedLimit, 10);

    const logs = await getActivityLogs(userId, effectiveLimit);
    res.status(200).json({
      logs,
      full_history_unlocked: fullAccess.allowed,
      upgrade_required: !fullAccess.allowed,
      plan: fullAccess.plan,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve activity logs.' });
  }
});

// ==========================================
// 8. BILLING & SUBSCRIPTION SYSTEM
// ==========================================

// GET /api/billing/subscription
router.get('/billing/subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const details = await getSubscriptionDetails(userId);
    res.status(200).json(details);
  } catch (err: any) {
    console.error('[Get Subscription Error]', err);
    res.status(500).json({ error: 'Failed to fetch subscription details.' });
  }
});

// POST /api/billing/checkout
router.post('/billing/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const { plan, interval } = req.body as { plan: 'STARTER' | 'GROWTH'; interval: BillingInterval };

    if (!plan || (plan !== 'STARTER' && plan !== 'GROWTH')) {
      return res.status(400).json({ error: 'Valid plan (STARTER or GROWTH) is required.' });
    }

    const billingInterval: BillingInterval = interval === 'annual' ? 'annual' : 'monthly';

    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'Stripe payments are not configured. To activate real Stripe checkout, provide STRIPE_SECRET_KEY in settings or environment.',
        code: 'STRIPE_NOT_CONFIGURED',
        stripe_configured: false,
      });
    }

    const appUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const sub = await getSubscription(userId);

    const session = await createStripeCheckoutSession({
      userId,
      userEmail,
      plan,
      interval: billingInterval,
      successUrl: `${appUrl}/?billing_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/?billing_status=cancelled`,
      existingCustomerId: sub.provider_customer_id,
    });

    await createActivityLog(
      userId,
      'CHECKOUT_INITIATED',
      `Initiated checkout session for ${plan} (${billingInterval})`
    );

    res.status(200).json({
      url: session.url,
      session_id: session.sessionId,
    });
  } catch (err: any) {
    console.error('[Stripe Checkout Error]', err);
    res.status(500).json({ error: err.message || 'Failed to create Stripe Checkout session.' });
  }
});

// POST /api/billing/portal
router.post('/billing/portal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await getSubscription(userId);

    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'Stripe customer portal is not configured. STRIPE_SECRET_KEY is required.',
        code: 'STRIPE_NOT_CONFIGURED',
        stripe_configured: false,
      });
    }

    if (!sub.provider_customer_id) {
      return res.status(400).json({
        error: 'No active Stripe customer found for this account. Please subscribe to a paid plan first.',
      });
    }

    const appUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const portal = await createStripePortalSession(sub.provider_customer_id, `${appUrl}/`);

    res.status(200).json({ url: portal.url });
  } catch (err: any) {
    console.error('[Stripe Portal Error]', err);
    res.status(500).json({ error: err.message || 'Failed to open billing portal.' });
  }
});

// POST /api/billing/cancel
router.post('/billing/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await getSubscription(userId);

    if (sub.plan === 'FREE') {
      return res.status(400).json({ error: 'You are currently on the Free plan.' });
    }

    const updated = await upsertSubscription({
      user_id: userId,
      cancel_at_period_end: true,
      status: 'cancelled',
    });

    await createActivityLog(
      userId,
      'SUBSCRIPTION_CANCELLED',
      `Scheduled subscription cancellation for ${sub.plan} at period end`
    );

    res.status(200).json({
      message: 'Subscription set to cancel at end of current billing period. All features remain active until period end.',
      subscription: updated,
    });
  } catch (err: any) {
    console.error('[Cancel Subscription Error]', err);
    res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

// POST /api/billing/confirm-session (Verifies real Stripe checkout session directly with Stripe API)
router.post('/billing/confirm-session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { session_id } = req.body;

    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ error: 'session_id is required.' });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'Stripe is not configured on this server.',
        code: 'STRIPE_NOT_CONFIGURED',
      });
    }

    const session = await retrieveStripeCheckoutSession(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Checkout session not found on Stripe.' });
    }

    // Security check: verify this checkout session belongs to authenticated user
    if (session.metadata?.user_id && session.metadata.user_id !== userId) {
      return res.status(403).json({ error: 'Checkout session belongs to another user.' });
    }

    // Check payment status or session status
    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    if (!isPaid) {
      return res.status(400).json({
        error: 'Payment has not been completed yet.',
        payment_status: session.payment_status,
      });
    }

    const plan = (session.metadata?.plan as PlanTier) || 'STARTER';
    const interval = (session.metadata?.billing_interval as BillingInterval) || 'monthly';
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id || null;

    const now = new Date();
    const periodEnd = new Date(
      interval === 'annual'
        ? now.getTime() + 365 * 24 * 60 * 60 * 1000
        : now.getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    await upsertSubscription({
      user_id: userId,
      plan,
      status: 'active',
      billing_interval: interval,
      provider: 'stripe',
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    });

    await createActivityLog(
      userId,
      'SUBSCRIPTION_ACTIVATED',
      `Confirmed active subscription to ${plan} (${interval}) via verified Stripe checkout session`,
      { customerId, subscriptionId, sessionId: session.id }
    );

    const details = await getSubscriptionDetails(userId);
    res.status(200).json({
      success: true,
      message: 'Your plan is now active.',
      ...details,
    });
  } catch (err: any) {
    console.error('[Confirm Checkout Session Error]', err);
    res.status(500).json({ error: err.message || 'Failed to verify Stripe checkout session.' });
  }
});

// POST /api/billing/simulate (Enables instant testing/demo of plan changes without live cards)
router.post('/billing/simulate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { plan, interval, status } = req.body as {
      plan: PlanTier;
      interval?: BillingInterval;
      status?: import('./plans.js').SubscriptionStatus;
    };

    if (!plan || !['FREE', 'STARTER', 'GROWTH'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose FREE, STARTER, or GROWTH.' });
    }

    const now = new Date();
    const periodEnd = plan === 'FREE' ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const updated = await upsertSubscription({
      user_id: userId,
      plan,
      status: status || 'active',
      billing_interval: interval || 'monthly',
      provider: 'manual',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    });

    await createActivityLog(
      userId,
      'PLAN_SIMULATED',
      `Switched plan to ${plan} (${interval || 'monthly'}) via developer sandbox`
    );

    const details = await getSubscriptionDetails(userId);
    res.status(200).json({
      message: `Plan successfully updated to ${plan}.`,
      ...details,
    });
  } catch (err: any) {
    console.error('[Simulate Plan Error]', err);
    res.status(500).json({ error: 'Failed to simulate plan change.' });
  }
});

// POST /api/billing/webhook (Stripe Webhook Handler with Idempotency)
router.post('/billing/webhook', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    let event: any;
    try {
      event = constructStripeWebhookEvent(rawBody, sig);
    } catch (err: any) {
      console.error('[Stripe Webhook Signature Verification Failed]:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Webhook idempotency check
    const isProcessed = await isWebhookEventProcessed(event.id);
    if (isProcessed) {
      console.log(`[Stripe Webhook] Event ${event.id} already processed. Skipping.`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    console.log(`[Stripe Webhook] Processing event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = (session.metadata?.plan as PlanTier) || 'STARTER';
        const interval = (session.metadata?.billing_interval as BillingInterval) || 'monthly';
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId) {
          const now = new Date();
          const periodEnd = new Date(
            interval === 'annual'
              ? now.getTime() + 365 * 24 * 60 * 60 * 1000
              : now.getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString();

          await upsertSubscription({
            user_id: userId,
            plan,
            status: 'active',
            billing_interval: interval,
            provider: 'stripe',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd,
            cancel_at_period_end: false,
          });

          await createActivityLog(
            userId,
            'SUBSCRIPTION_ACTIVATED',
            `Subscribed to ${plan} (${interval}) via Stripe Checkout`,
            { customerId, subscriptionId }
          );

          const targetUser = await getUserById(userId);
          if (targetUser) {
            const planCfg = PLAN_CONFIGS[plan];
            const amountStr = interval === 'annual' ? `$${planCfg.priceAnnual}/yr` : `$${planCfg.priceMonthly}/mo`;
            sendSubscriptionConfirmationEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: planCfg.name,
              billingInterval: interval === 'annual' ? 'Annual' : 'Monthly',
              amountFormatted: amountStr,
            }).catch(e => console.error('[Webhook Email Error]', e.message));
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const customerId = stripeSub.customer as string;
        const subscriptionId = stripeSub.id;
        const userId = stripeSub.metadata?.user_id;

        let targetSub = userId ? await getSubscription(userId) : null;
        if (!targetSub && subscriptionId) {
          targetSub = await getSubscriptionByProviderSubId(subscriptionId);
        }
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          let status: import('./plans.js').SubscriptionStatus = 'active';
          if (stripeSub.status === 'past_due') status = 'past_due';
          else if (stripeSub.status === 'canceled') status = 'cancelled';
          else if (stripeSub.status === 'trialing') status = 'trialing';
          else if (stripeSub.status === 'unpaid') status = 'expired';

          const periodStart = new Date(stripeSub.current_period_start * 1000).toISOString();
          const periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

          await upsertSubscription({
            user_id: targetSub.user_id,
            status,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: stripeSub.cancel_at_period_end || false,
            provider_subscription_id: subscriptionId,
            provider_customer_id: customerId,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const subscriptionId = stripeSub.id;
        const customerId = stripeSub.customer as string;

        let targetSub = await getSubscriptionByProviderSubId(subscriptionId);
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          // Safe downgrade: reset to FREE, keep all user data intact!
          await upsertSubscription({
            user_id: targetSub.user_id,
            plan: 'FREE',
            status: 'expired',
            cancel_at_period_end: false,
          });

          await createActivityLog(
            targetSub.user_id,
            'SUBSCRIPTION_EXPIRED',
            `Subscription ended. Reverted cleanly to Free tier without removing any data.`
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendSubscriptionCancelledEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch(e => console.error('[Webhook Email Error]', e.message));
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const targetSub = await getSubscriptionByCustomerId(customerId);

        if (targetSub) {
          await upsertSubscription({
            user_id: targetSub.user_id,
            status: 'past_due',
          });

          await createActivityLog(
            targetSub.user_id,
            'PAYMENT_FAILED',
            'Subscription invoice payment failed. Status changed to past_due.',
            { invoiceId: invoice.id }
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendPaymentFailureEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch(e => console.error('[Webhook Email Error]', e.message));
          }
        }
        break;
      }
    }

    // Record webhook event for idempotency
    await recordProcessedWebhookEvent(event.id, event.type);

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook Processing Error]', err);
    res.status(500).json({ error: 'Internal webhook error' });
  }
});

// ==========================================
// 9. SETTINGS & PROFILE
// ==========================================

// GET /api/settings/config
router.get('/settings/config', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(200).json({
      environment: process.env.NODE_ENV || 'development',
      database: {
        engine: dbHealth.engine,
        connected: dbHealth.connected,
        configured: Boolean(process.env.DATABASE_URL),
      },
      email_service: {
        provider: 'Resend',
        configured: Boolean(process.env.RESEND_API_KEY),
        from_email: process.env.RESEND_FROM_EMAIL || 'Receipto <billing@resend.dev>',
      },
      stripe_service: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null,
      },
      app_version: '1.2.0',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch settings configuration.' });
  }
});

// POST /api/settings/profile
router.post('/settings/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, business_name } = req.body;

    if (name && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const updated = await updateUserProfile(userId, { name, business_name });

    await createActivityLog(userId, 'PROFILE_UPDATED', 'Updated business profile settings');

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: updated?.id,
        email: updated?.email,
        name: updated?.name,
        business_name: updated?.business_name,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ==========================================
// 10. ADMIN MANAGEMENT ROUTES (Secured by requireAuth + requireAdmin)
// ==========================================

// GET /api/admin/dashboard
router.get('/admin/dashboard', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getAdminDashboardStats();
    res.status(200).json(stats);
  } catch (err: any) {
    console.error('[Admin Dashboard Error]', err);
    res.status(500).json({ error: 'Failed to retrieve admin dashboard stats.' });
  }
});

// GET /api/admin/users
router.get('/admin/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, role, status, plan, page, limit } = req.query;
    const data = await getAdminUsers({
      search: typeof search === 'string' ? search : undefined,
      role: typeof role === 'string' ? role : undefined,
      status: typeof status === 'string' ? status : undefined,
      plan: typeof plan === 'string' ? plan : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin Users Error]', err);
    res.status(500).json({ error: 'Failed to retrieve admin users list.' });
  }
});

// POST /api/admin/users/:id/suspend
router.post('/admin/users/:id/suspend', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const result = await suspendUser(adminId, targetId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: 'User account has been suspended and sessions invalidated.' });
  } catch (err: any) {
    console.error('[Admin Suspend Error]', err);
    res.status(500).json({ error: 'Failed to suspend user account.' });
  }
});

// POST /api/admin/users/:id/restore
router.post('/admin/users/:id/restore', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const result = await restoreUser(adminId, targetId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: 'User account has been restored to active status.' });
  } catch (err: any) {
    console.error('[Admin Restore Error]', err);
    res.status(500).json({ error: 'Failed to restore user account.' });
  }
});

// POST /api/admin/users/:id/role
router.post('/admin/users/:id/role', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const { role } = req.body;
    if (role !== 'USER' && role !== 'ADMIN') {
      return res.status(400).json({ error: 'Invalid role. Must be USER or ADMIN.' });
    }
    const result = await updateUserRole(adminId, targetId, role);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: `User role updated to ${role}.` });
  } catch (err: any) {
    console.error('[Admin Role Update Error]', err);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// GET /api/admin/subscriptions
router.get('/admin/subscriptions', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit } = req.query;
    const data = await getAdminSubscriptions({
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin Subscriptions Error]', err);
    res.status(500).json({ error: 'Failed to retrieve admin subscriptions list.' });
  }
});

// GET /api/admin/activity
router.get('/admin/activity', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, action, page, limit } = req.query;
    const data = await getAdminActivityLogs({
      userId: typeof userId === 'string' ? userId : undefined,
      action: typeof action === 'string' ? action : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 25,
    });
    res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin Activity Error]', err);
    res.status(500).json({ error: 'Failed to retrieve activity audit log.' });
  }
});

// GET /api/admin/system
router.get('/admin/system', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerStatus = getWorkerStatus();
    const health = await getAdminSystemHealth(workerStatus);
    res.status(200).json(health);
  } catch (err: any) {
    console.error('[Admin System Health Error]', err);
    res.status(500).json({ error: 'Failed to retrieve system health diagnostics.' });
  }
});

// POST /api/admin/system/trigger-worker
router.post('/admin/system/trigger-worker', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runWorkerCycle();
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin Trigger Worker Error]', err);
    res.status(500).json({ error: 'Worker manual execution failed.' });
  }
});

