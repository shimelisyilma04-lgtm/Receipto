import express from 'express';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserPassword,
  updateUserEmail,
  deleteUserAccount,
  createSession,
  deleteSession,
  deleteUserSessions,
  createActivityLog,
  updateUserLastLogin,
  createEmailVerification,
  getLatestEmailVerification,
  markVerificationUsed,
  recordVerificationAttempt,
} from '../db.js';
import {
  hashPassword,
  verifyPassword,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  optionalAuth,
  authRateLimiter,
  type AuthenticatedRequest,
} from '../auth.js';
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
} from '../verification.js';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from '../email.js';
import { isValidEmail } from './helpers.js';
import { logger } from '../lib/logger.js';

export const authRouter = express.Router();

// POST /api/auth/register
authRouter.post('/auth/register', authRateLimiter, async (req: Request, res: Response) => {
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

    const verifResult = await issueAndSendVerification(user);

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
  } catch (err: any) {
    logger.error({ err: err.message }, 'Registration error');
    res.status(500).json({ error: 'Registration failed due to a server error. Please try again.' });
  }
});

// POST /api/auth/login
authRouter.post('/auth/login', authRateLimiter, async (req: Request, res: Response) => {
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

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    if (!user.email_verified) {
      const verifResult = await resendVerificationCode(user.id);

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
    logger.error({ err: err.message }, 'Login error');
    res.status(500).json({ error: 'Login failed due to a server error. Please try again.' });
  }
});

// POST /api/auth/verify-email
authRouter.post('/auth/verify-email', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    const verifiedUser = result.user;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(verifiedUser.id, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    sendWelcomeEmail({
      to: verifiedUser.email,
      name: verifiedUser.name,
      businessName: verifiedUser.business_name,
    }).catch((err) => logger.warn({ err: err.message }, 'Welcome email notice'));

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
    logger.error({ err: err.message }, 'Verify email error');
    res.status(500).json({ error: 'Email verification failed due to a server error.' });
  }
});

// POST /api/auth/resend-code
authRouter.post('/auth/resend-code', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Resend code error');
    res.status(500).json({ error: 'Failed to resend verification code.' });
  }
});

// POST /api/auth/change-registration-email
authRouter.post('/auth/change-registration-email', authRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Change registration email error');
    res.status(500).json({ error: 'Failed to update email address.' });
  }
});

// POST /api/auth/logout
authRouter.post('/auth/logout', async (req: AuthenticatedRequest, res: Response) => {
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
authRouter.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

// DELETE /api/auth/account
authRouter.delete('/auth/account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await deleteUserAccount(userId);
    clearAuthCookie(res);
    res.status(200).json({ success: true, message: 'Account and all associated records deleted successfully.' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Delete account error');
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// POST /api/test/purge-user
authRouter.post('/test/purge-user', async (req: Request, res: Response) => {
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
authRouter.post('/auth/password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    await deleteUserSessions(userId);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(userId, token, expiresAt);
    setAuthCookie(req, res, token, expiresAt);

    await createActivityLog(userId, 'PASSWORD_CHANGED', 'Password changed and existing sessions invalidated');

    res.status(200).json({ message: 'Password updated successfully', token });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Password update error');
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// POST /api/auth/forgot-password
authRouter.post('/auth/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
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
      }).catch((err) => logger.warn({ err: err.message }, 'Password reset email notice'));
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email address, password reset instructions have been sent.',
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Forgot password error');
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// POST /api/auth/reset-password
authRouter.post('/auth/reset-password', authRateLimiter, async (req: Request, res: Response) => {
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
    logger.error({ err: err.message }, 'Reset password error');
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});
