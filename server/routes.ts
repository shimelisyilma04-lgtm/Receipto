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
  isDatabaseConfigured,
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
  getUserByStripeCustomerId,
  updateUserLastLogin,
  getAdminDashboardStats,
  getAdminUsers,
  suspendUser,
  restoreUser,
  updateUserRole,
  getAdminSubscriptions,
  getAdminActivityLogs,
  getAdminSystemHealth,
  updateOwnerDemoPlan,
  createEmailVerification,
  getLatestEmailVerification,
  markVerificationUsed,
  recordVerificationAttempt,
} from './db.js';
import {
  isStripeConfigured,
  isStripeWebhookConfigured,
  getStripePublishableKey,
  getStripePriceId,
  createStripeCheckoutSession,
  createStripePortalSession,
  cancelStripeSubscription,
  verifyStripeWebhookSignature,
} from './stripe.js';
import {
  PLAN_CONFIGS,
  type PlanTier,
  type BillingInterval,
  getEffectivePlan,
  isPaidSubscriptionActive,
  isOwnerAccount,
  PlanLimitExceededError,
  getPlanLimitReachedMessage,
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
  generateSecureOTP,
  generateSalt,
  hashOTP,
  verifyOTPHash,
  OTP_EXPIRATION_MINUTES,
  MAX_VERIFICATION_ATTEMPTS,
} from './verification.js';
import {
  sendReminderEmail,
  generateReminderEmailContent,
  escapeHtml,
  sendSubscriptionConfirmationEmail,
  sendPaymentFailureEmail,
  sendSubscriptionCancelledEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from './email.js';
import { getWorkerStatus, runWorkerCycle } from './worker.js';
import { evaluateProductionReadiness } from './readiness.js';

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
// 1. HEALTH & READINESS CHECKS
// ==========================================
export async function healthHandler(req: Request, res: Response) {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(200).json({
      status: 'ok',
      app: 'Receipto',
      version: '1.2.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbHealth.connected,
        engine: dbHealth.engine,
        configured: isDatabaseConfigured(),
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

export function readinessHandler(req: Request, res: Response) {
  const report = evaluateProductionReadiness();
  const statusCode = report.overall_ready ? 200 : 200; // Returns full structured report
  res.status(statusCode).json(report);
}

router.get('/health', healthHandler);
router.get('/system/readiness', readinessHandler);
router.get('/readiness', readinessHandler);

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
    const { code: rawCode, otp, email, user_id } = req.body;
    const code = rawCode || otp;

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

    // Dispatch welcome email via Resend in background
    sendWelcomeEmail({
      to: verifiedUser.email,
      name: verifiedUser.name,
      businessName: verifiedUser.business_name,
    }).catch((err) => console.warn('[Welcome Email Notice]', err.message));

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

// POST /api/auth/forgot-password
router.post('/auth/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(cleanEmail);

    if (user) {
      const otp = generateSecureOTP();
      const salt = generateSalt();
      const otpHash = hashOTP(otp, salt);
      const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000).toISOString();

      await createEmailVerification({
        user_id: user.id,
        email: user.email,
        otp_hash: otpHash,
        salt,
        expires_at: expiresAt,
        purpose: 'password_reset',
      });

      sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        otp,
      }).catch((err) => console.warn('[Password Reset Email Error]', err.message));
    }

    // Privacy-preserving response (does not reveal user existence)
    res.status(200).json({
      success: true,
      message: 'If an account exists with that email address, password reset instructions have been sent.',
    });
  } catch (err: any) {
    console.error('[Forgot Password Error]', err);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// POST /api/auth/reset-password
router.post('/auth/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp, new_password } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return res.status(400).json({ error: 'Valid 6-digit verification code is required.' });
    }

    if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset code.' });
    }

    const verification = await getLatestEmailVerification(user.id, 'password_reset');
    if (!verification || verification.used_at) {
      return res.status(400).json({ error: 'No active password reset request found. Please request a new one.' });
    }

    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: 'Password reset code has expired. Please request a new one.' });
    }

    if (verification.attempt_count >= MAX_VERIFICATION_ATTEMPTS) {
      return res.status(400).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    await recordVerificationAttempt(verification.id);

    const isValid = verifyOTPHash(otp.trim(), verification.otp_hash, verification.salt);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const newHash = await hashPassword(new_password);
    await updateUserPassword(user.id, newHash);
    await markVerificationUsed(verification.id);
    await deleteUserSessions(user.id);

    await createActivityLog(user.id, 'PASSWORD_RESET', 'Password successfully reset via email verification');

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (err: any) {
    console.error('[Reset Password Error]', err);
    res.status(500).json({ error: 'Failed to reset password.' });
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
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'clients',
        limit_type: 'clients',
        current: limitCheck.current,
        limit: limitCheck.max,
        max: limitCheck.max,
        plan: limitCheck.plan,
        message: limitCheck.reason,
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
    if (err instanceof PlanLimitExceededError || err.code === 'PLAN_LIMIT_REACHED') {
      return res.status(403).json({
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'clients',
        limit_type: 'clients',
        current: err.current,
        limit: err.limit,
        max: err.limit,
        plan: err.plan,
        message: err.message,
        upgrade_required: true,
      });
    }
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

// GET /api/invoices/export/csv and GET /api/invoices/export.csv
router.get(['/invoices/export/csv', '/invoices/export.csv'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const accessCheck = await checkFeatureAccess(userId, 'csvExport');
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: 'CSV invoice export is available on Starter and Growth plans.',
        code: 'FEATURE_LOCKED',
        feature: 'csvExport',
        plan: accessCheck.plan,
        upgrade_required: true,
      });
    }

    const invoices = await getInvoices(userId);
    const escapeCsvCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Protect against CSV / Spreadsheet formula injection (unless it's a valid numeric value)
      const isPureNumber = /^-?\d+(\.\d+)?$/.test(str.trim());
      if (!isPureNumber && /^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const header = [
      'Invoice Number',
      'Client Name',
      'Client Email',
      'Company',
      'Amount',
      'Currency',
      'Issue Date',
      'Due Date',
      'Payment Status',
      'Paid Date',
      'Notes',
    ];

    const rows = invoices.map((inv) =>
      [
        escapeCsvCell(inv.invoice_number),
        escapeCsvCell(inv.client_name || ''),
        escapeCsvCell(inv.client_email || ''),
        escapeCsvCell(inv.client_company || ''),
        escapeCsvCell(inv.amount.toFixed(2)),
        escapeCsvCell(inv.currency),
        escapeCsvCell(inv.issue_date),
        escapeCsvCell(inv.due_date),
        escapeCsvCell(inv.payment_status),
        escapeCsvCell(inv.paid_date ? inv.paid_date.split('T')[0] : ''),
        escapeCsvCell(inv.notes || ''),
      ].join(',')
    );

    const csvContent = [header.map((h) => escapeCsvCell(h)).join(','), ...rows].join('\r\n');

    await createActivityLog(userId, 'CSV_EXPORTED', `Exported ${invoices.length} invoices to CSV`);

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="receipto-invoices-${dateStr}.csv"`);
    res.status(200).send(csvContent);
  } catch (err: any) {
    console.error('[CSV Export Error]', err);
    res.status(500).json({ success: false, error: 'Failed to generate invoice export CSV.' });
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
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'invoices',
        limit_type: 'invoices',
        current: limitCheck.current,
        limit: limitCheck.max,
        max: limitCheck.max,
        plan: limitCheck.plan,
        message: limitCheck.reason,
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
    if (err instanceof PlanLimitExceededError || err.code === 'PLAN_LIMIT_REACHED') {
      return res.status(403).json({
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'invoices',
        limit_type: 'invoices',
        current: err.current,
        limit: err.limit,
        max: err.limit,
        plan: err.plan,
        message: err.message,
        upgrade_required: true,
      });
    }
    res.status(500).json({ error: 'Failed to create invoice.' });
  }
});

function renderInvoiceNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice Not Found - Receipto</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;color:#1e293b;background:#f8fafc;}.card{max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);}</style>
</head>
<body>
  <div class="card">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:12px;color:#0f172a;">Invoice Not Found</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.6;">The requested invoice does not exist or you do not have permission to view it.</p>
    <a href="/" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Return to Receipto</a>
  </div>
</body>
</html>`;
}

function renderInvoiceErrorHtml(message: string = 'An error occurred generating the printable invoice.'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Print Error - Receipto</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;color:#1e293b;background:#f8fafc;}.card{max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);}</style>
</head>
<body>
  <div class="card">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:12px;color:#e11d48;">Unable to Load Printable Invoice</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.6;">${escapeHtml(message)} Please try again.</p>
    <a href="/" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Return to Receipto</a>
  </div>
</body>
</html>`;
}

function renderInvoicePrintHtml(invoice: any, client: any, user: any): string {
  const isPaid = invoice.payment_status === 'PAID';
  const isOverdue = invoice.payment_status === 'OVERDUE';
  const isCancelled = invoice.payment_status === 'CANCELLED';

  let statusBg = '#fffbeb';
  let statusText = '#92400e';
  let statusBorder = '#fde68a';
  if (isPaid) {
    statusBg = '#ecfdf5';
    statusText = '#065f46';
    statusBorder = '#a7f3d0';
  } else if (isOverdue) {
    statusBg = '#fff1f2';
    statusText = '#9f1239';
    statusBorder = '#fecdd3';
  } else if (isCancelled) {
    statusBg = '#f1f5f9';
    statusText = '#475569';
    statusBorder = '#cbd5e1';
  }

  const formattedAmount = `${invoice.currency} $${Number(invoice.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${escapeHtml(invoice.invoice_number)} - Receipto</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      padding: 0;
      margin: 0;
    }
    .no-print {
      background-color: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .no-print-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-title {
      font-weight: 700;
      font-size: 15px;
      color: #0f172a;
    }
    .brand-hint {
      font-size: 12px;
      color: #64748b;
    }
    .no-print-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
    }
    .btn-primary {
      background-color: #4f46e5;
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #4338ca;
    }
    .btn-secondary {
      background-color: #ffffff;
      color: #334155;
      border-color: #cbd5e1;
    }
    .btn-secondary:hover {
      background-color: #f1f5f9;
    }
    .page-container {
      max-width: 820px;
      margin: 28px auto 40px auto;
      padding: 0 16px;
    }
    .invoice-card {
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      padding: 48px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 28px;
      margin-bottom: 32px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .company-sub {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .invoice-badge-title {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.03em;
      color: #0f172a;
      text-align: right;
    }
    .meta-list {
      margin-top: 8px;
      text-align: right;
      font-size: 13px;
      color: #475569;
    }
    .meta-list span {
      font-weight: 600;
      color: #0f172a;
    }
    .status-pill {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-radius: 9999px;
      background-color: ${statusBg};
      color: ${statusText};
      border: 1px solid ${statusBorder};
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 36px;
    }
    .party-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .party-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .party-detail {
      font-size: 13px;
      color: #475569;
      margin-top: 2px;
      white-space: pre-line;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .items-table th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 12px 16px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table th.text-right, .items-table td.text-right {
      text-align: right;
    }
    .items-table td {
      padding: 16px;
      font-size: 14px;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 36px;
    }
    .totals-box {
      width: 280px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      color: #475569;
    }
    .totals-grand {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      border-top: 2px solid #e2e8f0;
      margin-top: 6px;
    }
    .notes-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 32px;
    }
    .notes-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 6px;
    }
    .notes-content {
      font-size: 13px;
      color: #334155;
      white-space: pre-line;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 24px;
    }
    @media print {
      body {
        background-color: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .page-container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      @page {
        margin: 12mm;
        size: auto;
      }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div class="no-print-left">
      <span class="brand-title">Receipto Printable Invoice</span>
      <span class="brand-hint">Invoice #${escapeHtml(invoice.invoice_number)}</span>
    </div>
    <div class="no-print-actions">
      <button class="btn btn-primary" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print / Save PDF
      </button>
      <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  <div class="page-container">
    <div class="invoice-card">
      <div class="header-row">
        <div>
          <div class="company-name">${escapeHtml(user.business_name || user.name || 'Receipto Merchant')}</div>
          <div class="company-sub">Billed by: ${escapeHtml(user.name || '')} &bull; ${escapeHtml(user.email || '')}</div>
        </div>

        <div>
          <div class="invoice-badge-title">INVOICE</div>
          <div class="meta-list">
            <div>Invoice No: <span>#${escapeHtml(invoice.invoice_number)}</span></div>
            <div>Issue Date: <span>${escapeHtml(invoice.issue_date || 'N/A')}</span></div>
            <div>Due Date: <span>${escapeHtml(invoice.due_date || 'N/A')}</span></div>
            ${
              invoice.paid_date
                ? `<div>Paid Date: <span>${escapeHtml(invoice.paid_date.split('T')[0])}</span></div>`
                : ''
            }
            <div><span class="status-pill">${escapeHtml(invoice.payment_status || 'UNPAID')}</span></div>
          </div>
        </div>
      </div>

      <div class="parties-grid">
        <div>
          <div class="party-title">Billed From</div>
          <div class="party-name">${escapeHtml(user.business_name || user.name || 'Merchant')}</div>
          <div class="party-detail">${escapeHtml(user.email || '')}</div>
        </div>

        <div>
          <div class="party-title">Billed To</div>
          <div class="party-name">${escapeHtml(client?.name || invoice.client_name || 'Client')}</div>
          ${
            client?.company || invoice.client_company
              ? `<div class="party-detail"><strong>${escapeHtml(client?.company || invoice.client_company || '')}</strong></div>`
              : ''
          }
          <div class="party-detail">${escapeHtml(client?.email || invoice.client_email || '')}</div>
          ${
            client?.address
              ? `<div class="party-detail">${escapeHtml(client.address)}</div>`
              : ''
          }
          ${
            client?.phone
              ? `<div class="party-detail">${escapeHtml(client.phone)}</div>`
              : ''
          }
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Item & Description</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Professional Services / Products Deliverable</strong><br>
              <span style="font-size: 12px; color: #64748b;">As referenced in invoice #${escapeHtml(invoice.invoice_number)}</span>
            </td>
            <td class="text-right">1</td>
            <td class="text-right">${formattedAmount}</td>
            <td class="text-right"><strong>${formattedAmount}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="totals-area">
        <div class="totals-box">
          <div class="totals-row">
            <span>Subtotal</span>
            <span>${formattedAmount}</span>
          </div>
          <div class="totals-row">
            <span>Tax (0.00%)</span>
            <span>${invoice.currency} $0.00</span>
          </div>
          <div class="totals-grand">
            <span>Total Due</span>
            <span>${formattedAmount}</span>
          </div>
        </div>
      </div>

      ${
        invoice.notes
          ? `<div class="notes-box">
              <div class="notes-title">Notes & Payment Instructions</div>
              <div class="notes-content">${escapeHtml(invoice.notes)}</div>
            </div>`
          : ''
      }

      <div class="footer-note">
        Thank you for your business. For any questions regarding this invoice, please contact ${escapeHtml(user.email || 'support')}.<br>
        <span style="font-size: 11px; color: #cbd5e1;">Generated by Receipto</span>
      </div>
    </div>
  </div>

  <script>
    // Trigger native browser print dialog on load
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch (e) {
          console.log('Auto print prevented by browser environment.');
        }
      }, 350);
    });
  </script>
</body>
</html>`;
}

// GET /api/invoices/:id
router.get('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const invoice = await getInvoiceById(userId, req.params.id);
    const wantsHtml = req.accepts('html') && !req.xhr && !req.headers.accept?.includes('application/json');

    if (!invoice) {
      if (wantsHtml) {
        return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderInvoiceNotFoundHtml());
      }
      return res.status(404).json({ error: 'Invoice not found or does not belong to your account.' });
    }

    if (wantsHtml) {
      const client = await getClientById(userId, invoice.client_id);
      const user = req.user!;
      const html = renderInvoicePrintHtml(invoice, client, user);
      await createActivityLog(userId, 'INVOICE_PRINTED', `Viewed printable invoice #${invoice.invoice_number}`);
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    }

    res.status(200).json({ invoice });
  } catch (err: any) {
    const wantsHtml = req.accepts('html') && !req.xhr && !req.headers.accept?.includes('application/json');
    if (wantsHtml) {
      return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderInvoiceErrorHtml());
    }
    res.status(500).json({ error: 'Failed to retrieve invoice.' });
  }
});

// GET /api/invoices/:id/print
router.get('/invoices/:id/print', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const invoice = await getInvoiceById(userId, req.params.id);
    if (!invoice) {
      return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderInvoiceNotFoundHtml());
    }

    const client = await getClientById(userId, invoice.client_id);
    const user = req.user!;
    const html = renderInvoicePrintHtml(invoice, client, user);

    await createActivityLog(userId, 'INVOICE_PRINTED', `Printed invoice #${invoice.invoice_number}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err: any) {
    console.error('[Print Invoice Error]', err);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderInvoiceErrorHtml());
  }
});

// PUT /api/invoices/:id
router.put('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    const now = new Date().toISOString();
    const reminder = await createReminder(userId, {
      invoice_id: invoice.id,
      client_id: client.id,
      recipient_email: client.email,
      subject,
      message: text,
      status,
      reminder_type: 'manual',
      sent_at: emailResult.success ? now : null,
      attempted_at: now,
      provider_message_id: emailResult.messageId,
      attempt_count: 1,
      error_message: emailResult.error || (!emailResult.configured ? emailResult.statusText : undefined),
    });

    await createActivityLog(
      userId,
      'REMINDER_TRIGGERED',
      `Triggered reminder for invoice #${invoice.invoice_number} to ${client.email} (${status})`,
      { reminderId: reminder.id, status, configured: emailResult.configured }
    );

    if (emailResult.success) {
      return res.status(200).json({
        success: true,
        code: 'EMAIL_SENT',
        message: 'Reminder email sent.',
        reminder,
      });
    } else {
      return res.status(200).json({
        success: false,
        code: 'EMAIL_PROVIDER_ERROR',
        message: 'Email could not be sent. Please check your email configuration.',
        reminder,
      });
    }
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

      const now = new Date().toISOString();
      const reminder = await createReminder(userId, {
        invoice_id: invoice.id,
        client_id: client.id,
        recipient_email: client.email,
        subject,
        message: text,
        status,
        reminder_type: 'automatic',
        sent_at: emailResult.success ? now : null,
        attempted_at: now,
        provider_message_id: emailResult.messageId,
        attempt_count: 1,
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
    const isOwner = isOwnerAccount(req.user);
    res.status(200).json({
      ...details,
      is_owner_demo: isOwner,
      access_mode: isOwner ? 'owner_demo' : 'standard',
      owner_demo_available_plans: isOwner ? ['FREE', 'STARTER', 'GROWTH'] : undefined,
      payment_provider: process.env.PAYMENT_PROVIDER || 'paddle',
      paddle_configured: isPaddleConfigured(),
      stripe_configured: isStripeConfigured(),
      stripe_publishable_key: getStripePublishableKey(),
    });
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
    const sub = await getSubscription(userId);

    const requestedProvider = req.body?.provider || process.env.PAYMENT_PROVIDER || 'paddle';
    if (requestedProvider === 'stripe') {
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const stripeParams = getStripeCheckoutParams({
        plan,
        interval: billingInterval,
        customerEmail: userEmail,
        customerId: sub.provider_customer_id || undefined,
        userId,
        baseUrl,
      });

      await createActivityLog(
        userId,
        'CHECKOUT_INITIATED',
        `Initiated Stripe checkout for ${plan} (${billingInterval})`
      );

      return res.status(200).json({
        success: true,
        provider: 'stripe',
        stripe_configured: isStripeConfigured(),
        publishable_key: stripeParams.publishableKey,
        price_id: stripeParams.priceId,
        plan: stripeParams.plan,
        interval: stripeParams.interval,
        customer_email: stripeParams.customerEmail,
        checkout_params: stripeParams,
      });
    }

    const checkoutParams = getCheckoutParams(
      userId,
      userEmail,
      plan,
      billingInterval,
      sub.paddle_customer_id || sub.provider_customer_id
    );

    await createActivityLog(
      userId,
      'CHECKOUT_INITIATED',
      `Initiated Paddle Sandbox checkout for ${plan} (${billingInterval})`
    );

    res.status(200).json({
      success: true,
      paddle_configured: isPaddleConfigured(),
      environment: checkoutParams.environment,
      client_token: checkoutParams.clientToken,
      price_id: checkoutParams.priceId,
      plan: checkoutParams.plan,
      interval: checkoutParams.interval,
      customer_email: checkoutParams.customerEmail,
      customer_id: checkoutParams.customerId,
      custom_data: checkoutParams.customData,
      checkout_params: checkoutParams,
    });
  } catch (err: any) {
    console.error('[Paddle Checkout Error]', err);
    res.status(500).json({ error: err.message || 'Failed to initiate Paddle checkout.' });
  }
});

// POST /api/billing/portal
router.post('/billing/portal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await getSubscription(userId);

    if (!isPaddleConfigured()) {
      return res.status(503).json({
        error: 'Paddle Sandbox billing is not configured. PADDLE_API_KEY or PADDLE_CLIENT_TOKEN is required.',
        code: 'PADDLE_NOT_CONFIGURED',
        paddle_configured: false,
      });
    }

    const subId = sub.paddle_subscription_id || sub.provider_subscription_id;
    if (!subId) {
      return res.status(400).json({
        error: 'No active Paddle subscription found for this account. Please subscribe to a paid plan first.',
      });
    }

    let paddleSub = null;
    try {
      paddleSub = await getPaddleSubscription(subId);
    } catch (e: any) {
      console.warn('[Paddle Subscription Fetch Notice]:', e.message);
    }

    const updateUrl = paddleSub?.management_urls?.update_payment_method || null;
    const cancelUrl = paddleSub?.management_urls?.cancel || null;

    res.status(200).json({
      subscription_id: subId,
      status: sub.status,
      plan: sub.plan,
      update_payment_method_url: updateUrl,
      cancel_url: cancelUrl,
      message: updateUrl ? 'Management URL available' : 'Paddle Sandbox subscription is active.',
    });
  } catch (err: any) {
    console.error('[Paddle Portal Error]', err);
    res.status(500).json({ error: err.message || 'Failed to fetch billing management details.' });
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

    const subId = sub.paddle_subscription_id || sub.provider_subscription_id;
    if (subId) {
      try {
        await cancelPaddleSubscription(subId, 'next_billing_period');
      } catch (err: any) {
        console.warn('[Paddle Cancel API Warning]:', err.message);
      }
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

// POST /api/billing/confirm-transaction (Verifies/Confirms completed Paddle checkout)
const handleConfirmBilling = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { transaction_id, subscription_id, customer_id, plan, interval, session_id } = req.body;

    const subId = subscription_id || session_id || null;
    const custId = customer_id || null;

    let targetPlan: PlanTier = plan && (plan === 'GROWTH' || plan === 'STARTER') ? plan : 'STARTER';
    let targetInterval: BillingInterval = interval === 'annual' ? 'annual' : 'monthly';

    // If subscription_id provided, query Paddle API to get accurate details
    if (subId && isPaddleConfigured()) {
      try {
        const paddleSub = await getPaddleSubscription(subId);
        if (paddleSub) {
          const mapped = mapPaddlePriceToPlan(paddleSub.items?.[0]?.price?.id, paddleSub.custom_data);
          targetPlan = mapped.plan;
          targetInterval = mapped.interval;
        }
      } catch (err: any) {
        console.warn('[Confirm Billing Paddle API Notice]:', err.message);
      }
    }

    const now = new Date();
    const periodEnd = new Date(
      targetInterval === 'annual'
        ? now.getTime() + 365 * 24 * 60 * 60 * 1000
        : now.getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const updated = await upsertSubscription({
      user_id: userId,
      plan: targetPlan,
      status: 'active',
      billing_interval: targetInterval,
      provider: 'paddle',
      provider_customer_id: custId,
      provider_subscription_id: subId,
      paddle_customer_id: custId,
      paddle_subscription_id: subId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    });

    await createActivityLog(
      userId,
      'SUBSCRIPTION_ACTIVATED',
      `Confirmed active subscription to ${targetPlan} (${targetInterval}) via Paddle Sandbox`,
      { customerId: custId, subscriptionId: subId, transactionId: transaction_id }
    );

    const targetUser = await getUserById(userId);
    if (targetUser) {
      const planCfg = PLAN_CONFIGS[targetPlan];
      const amountStr = targetInterval === 'annual' ? `$${planCfg.priceAnnual}/yr` : `$${planCfg.priceMonthly}/mo`;
      sendSubscriptionConfirmationEmail({
        to: targetUser.email,
        name: targetUser.name,
        planName: planCfg.name,
        billingInterval: targetInterval === 'annual' ? 'Annual' : 'Monthly',
        amountFormatted: amountStr,
      }).catch(e => console.error('[Confirm Email Error]', e.message));
    }

    const details = await getSubscriptionDetails(userId);
    res.status(200).json({
      success: true,
      message: `Your ${targetPlan} plan is now active.`,
      ...details,
    });
  } catch (err: any) {
    console.error('[Confirm Billing Error]', err);
    res.status(500).json({ error: err.message || 'Failed to confirm Paddle transaction.' });
  }
};

router.post('/billing/confirm-transaction', requireAuth, handleConfirmBilling);
router.post('/billing/confirm-session', requireAuth, handleConfirmBilling);

// POST /api/billing/owner-demo/switch-plan (Exclusive Owner Demo Plan Switcher)
router.post('/billing/owner-demo/switch-plan', requireAuth, requireVerified, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isOwnerAccount(user)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only the verified owner account can use demo plan controls.',
      });
    }

    const { plan } = req.body as { plan: PlanTier };
    if (!plan || !['FREE', 'STARTER', 'GROWTH'].includes(plan)) {
      return res.status(400).json({ error: 'Valid demo plan (FREE, STARTER, or GROWTH) is required.' });
    }

    await updateOwnerDemoPlan(user.id, plan);

    await createActivityLog(
      user.id,
      'OWNER_DEMO_PLAN_SWITCHED',
      `Switched owner demo access to ${plan} plan`
    );

    const details = await getSubscriptionDetails(user.id);
    res.status(200).json({
      success: true,
      message: `Owner demo access switched to ${plan}.`,
      ...details,
    });
  } catch (err: any) {
    console.error('[Owner Demo Switch Plan Error]', err);
    res.status(500).json({ error: err.message || 'Failed to switch owner demo plan.' });
  }
});

// POST /api/billing/simulate (Enables instant testing/demo of plan changes without live cards)
router.post('/billing/simulate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = req.user!;
    const { plan, interval, status } = req.body as {
      plan: PlanTier;
      interval?: BillingInterval;
      status?: import('./plans.js').SubscriptionStatus;
    };

    if (!plan || !['FREE', 'STARTER', 'GROWTH'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose FREE, STARTER, or GROWTH.' });
    }

    if (isOwnerAccount(user)) {
      await updateOwnerDemoPlan(userId, plan);
    } else {
      const now = new Date();
      const periodEnd = plan === 'FREE' ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await upsertSubscription({
        user_id: userId,
        plan,
        status: status || 'active',
        billing_interval: interval || 'monthly',
        provider: 'paddle',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd,
        cancel_at_period_end: false,
      });
    }

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

// Shared Paddle Webhook Handler with Idempotency & Signature Verification
const handlePaddleWebhook = async (req: Request, res: Response) => {
  try {
    // 1. Dynamic IP allowlist check against live Paddle CIDRs
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || req.ip || '';
    const isAllowed = await isPaddleIpAllowed(clientIp);
    const env = getPaddleEnvironment();

    if (env === 'production' && !isAllowed) {
      console.warn(`[Paddle Webhook] Rejected unauthorized IP: ${clientIp}`);
      return res.status(403).send('Forbidden: IP not authorized for Paddle webhooks');
    }

    const signatureHeader = (req.headers['paddle-signature'] || req.headers['paddle_signature']) as string | undefined;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    try {
      verifyPaddleWebhookSignature(rawBody, signatureHeader);
    } catch (err: any) {
      console.error('[Paddle Webhook Signature Verification Failed]:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const event = parsePaddleWebhookEvent(rawBody);

    // Webhook idempotency check
    const isProcessed = await isWebhookEventProcessed(event.event_id);
    if (isProcessed) {
      console.log(`[Paddle Webhook] Event ${event.event_id} already processed. Skipping.`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    console.log(`[Paddle Webhook] Processing event: ${event.event_type} (${event.event_id})`);

    switch (event.event_type) {
      case 'subscription.created': {
        const subData = event.data;
        const subscriptionId = subData.id;
        const customerId = subData.customer_id;
        const customData = subData.custom_data;
        const priceId = subData.items?.[0]?.price?.id;

        const { plan, interval } = mapPaddlePriceToPlan(priceId, customData);
        let userId = customData?.user_id;

        if (!userId && customerId) {
          const user = await getUserByPaddleCustomerId(customerId);
          if (user) userId = user.id;
        }

        if (userId) {
          const periodStart = subData.current_billing_period?.starts_at || new Date().toISOString();
          const periodEnd = subData.current_billing_period?.ends_at ||
            new Date(Date.now() + (interval === 'annual' ? 365 : 30) * 86400000).toISOString();

          let status: import('./plans.js').SubscriptionStatus = 'active';
          if (subData.status === 'past_due') status = 'past_due';
          else if (subData.status === 'trialing') status = 'trialing';
          else if (subData.status === 'canceled' || subData.status === 'cancelled') status = 'cancelled';
          else if (subData.status === 'paused') status = 'past_due';

          await upsertSubscription({
            user_id: userId,
            plan,
            status,
            billing_interval: interval,
            provider: 'paddle',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            paddle_customer_id: customerId,
            paddle_subscription_id: subscriptionId,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: Boolean(subData.scheduled_change?.action === 'cancel'),
          });

          await createActivityLog(
            userId,
            'SUBSCRIPTION_ACTIVATED',
            `Subscribed to ${plan} (${interval}) via Paddle Sandbox`,
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
            }).catch(e => console.error('[Paddle Webhook Email Error]', e.message));
          }
        }
        break;
      }

      case 'subscription.updated': {
        const subData = event.data;
        const subscriptionId = subData.id;
        const customerId = subData.customer_id;
        const customData = subData.custom_data;
        const priceId = subData.items?.[0]?.price?.id;

        let targetSub = await getSubscriptionByProviderSubId(subscriptionId);
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }
        if (!targetSub && customData?.user_id) {
          targetSub = await getSubscription(customData.user_id);
        }

        if (targetSub) {
          const { plan, interval } = mapPaddlePriceToPlan(priceId, customData);

          let status: import('./plans.js').SubscriptionStatus = 'active';
          if (subData.status === 'past_due') status = 'past_due';
          else if (subData.status === 'canceled' || subData.status === 'cancelled') status = 'cancelled';
          else if (subData.status === 'trialing') status = 'trialing';
          else if (subData.status === 'paused') status = 'past_due';

          const periodStart = subData.current_billing_period?.starts_at || targetSub.current_period_start;
          const periodEnd = subData.current_billing_period?.ends_at || targetSub.current_period_end;
          const cancelAtPeriodEnd = subData.scheduled_change?.action === 'cancel';

          await upsertSubscription({
            user_id: targetSub.user_id,
            plan,
            status,
            billing_interval: interval,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
            provider: 'paddle',
            provider_subscription_id: subscriptionId,
            provider_customer_id: customerId,
            paddle_subscription_id: subscriptionId,
            paddle_customer_id: customerId,
          });

          await createActivityLog(
            targetSub.user_id,
            'SUBSCRIPTION_UPDATED',
            `Subscription updated: ${plan} (${status})`,
            { subscriptionId, status, cancelAtPeriodEnd }
          );
        }
        break;
      }

      case 'subscription.canceled':
      case 'subscription.cancelled': {
        const subData = event.data;
        const subscriptionId = subData.id;
        const customerId = subData.customer_id;

        let targetSub = await getSubscriptionByProviderSubId(subscriptionId);
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          // Safe downgrade: reset to FREE, keep all user invoices and clients intact
          await upsertSubscription({
            user_id: targetSub.user_id,
            plan: 'FREE',
            status: 'expired',
            cancel_at_period_end: false,
          });

          await createActivityLog(
            targetSub.user_id,
            'SUBSCRIPTION_EXPIRED',
            `Subscription ended. Reverted cleanly to Free tier without removing any user data.`
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendSubscriptionCancelledEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch(e => console.error('[Paddle Webhook Cancel Email Error]', e.message));
          }
        }
        break;
      }

      case 'subscription.past_due': {
        const subData = event.data;
        const subscriptionId = subData.id;
        const customerId = subData.customer_id;

        let targetSub = await getSubscriptionByProviderSubId(subscriptionId);
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          await upsertSubscription({
            user_id: targetSub.user_id,
            status: 'past_due',
          });

          await createActivityLog(
            targetSub.user_id,
            'PAYMENT_FAILED',
            'Paddle subscription payment is past due. Status changed to past_due.',
            { subscriptionId }
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendPaymentFailureEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch(e => console.error('[Paddle Payment Failure Email Error]', e.message));
          }
        }
        break;
      }

      case 'transaction.completed': {
        const txData = event.data;
        const customerId = txData.customer_id;
        const subscriptionId = txData.subscription_id;
        const customData = txData.custom_data;

        let userId = customData?.user_id;
        if (!userId && customerId) {
          const user = await getUserByPaddleCustomerId(customerId);
          if (user) userId = user.id;
        }

        if (userId && subscriptionId) {
          const targetSub = await getSubscription(userId);
          if (targetSub.status !== 'active') {
            await upsertSubscription({
              user_id: userId,
              status: 'active',
              paddle_subscription_id: subscriptionId,
              paddle_customer_id: customerId,
            });
          }
        }
        break;
      }

      case 'transaction.payment_failed': {
        const txData = event.data;
        const customerId = txData.customer_id;
        let targetSub = customerId ? await getSubscriptionByCustomerId(customerId) : null;

        if (targetSub) {
          await upsertSubscription({
            user_id: targetSub.user_id,
            status: 'past_due',
          });

          await createActivityLog(
            targetSub.user_id,
            'PAYMENT_FAILED',
            'Paddle transaction payment failed.',
            { transactionId: txData.id }
          );
        }
        break;
      }
    }

    // Record webhook event for idempotency
    await recordProcessedWebhookEvent(event.event_id, event.event_type);

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Paddle Webhook Processing Error]', err);
    res.status(500).json({ error: 'Internal webhook error' });
  }
};

// Mount both standard /api/webhooks/paddle and legacy /api/billing/webhook
router.post('/webhooks/paddle', handlePaddleWebhook);
router.post('/billing/webhook', handlePaddleWebhook);

// POST /api/webhooks/stripe (Stripe Webhook Handler)
router.post('/webhooks/stripe', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const sigHeader = (req.headers['stripe-signature'] as string) || '';

    if (isStripeWebhookConfigured()) {
      const isValid = verifyStripeWebhookSignature(rawBody, sigHeader);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid Stripe webhook signature' });
      }
    }

    const event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString('utf8'));
    const eventId = event?.id;

    if (eventId) {
      const isProcessed = await isWebhookEventProcessed(eventId);
      if (isProcessed) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      await recordProcessedWebhookEvent(eventId, event.type || 'stripe.event');
    }

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
        configured: isDatabaseConfigured(),
      },
      email_service: {
        provider: 'Resend',
        configured: Boolean(process.env.RESEND_API_KEY),
        from_email: process.env.RESEND_FROM_EMAIL || 'Receipto <billing@resend.dev>',
      },
      paddle_service: {
        configured: isPaddleConfigured(),
        environment: getPaddleEnvironment(),
        client_token: getPaddleClientToken() ? `${getPaddleClientToken().slice(0, 8)}...` : null,
        webhook_configured: isPaddleWebhookConfigured(),
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

