import crypto from 'crypto';
import type { EmailVerification, User } from './types.js';
import * as db from './db.js';
import { sendVerificationEmail } from './email.js';

// Configuration constants
export const OTP_EXPIRATION_MINUTES = 10;
export const MAX_VERIFICATION_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generate a cryptographically secure 6-digit numerical OTP.
 * Uses crypto.randomInt which generates cryptographically strong pseudorandom numbers.
 */
export function generateSecureOTP(): string {
  // Generates an integer between 100000 and 999999 inclusive
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Generate a random salt for hashing
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash an OTP with a unique salt using SHA-256.
 * Storage of OTPs is always hashed; plain OTP is never persisted.
 */
export function hashOTP(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${otp.trim()}`).digest('hex');
}

/**
 * Timing-safe comparison of user-entered OTP against the stored hash and salt.
 */
export function verifyOTPHash(candidateOtp: string, storedHash: string, salt: string): boolean {
  if (!candidateOtp || candidateOtp.length !== 6) return false;
  const computedHash = hashOTP(candidateOtp, salt);
  const hashBuf = Buffer.from(storedHash, 'hex');
  const compBuf = Buffer.from(computedHash, 'hex');
  if (hashBuf.length !== compBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, compBuf);
}

export interface IssueVerificationResult {
  success: boolean;
  emailDelivery: 'sent' | 'not_configured' | 'error';
  statusText: string;
  emailError?: string;
  expiresAt: string;
  devPreviewOtp?: string;
}

/**
 * Issue and send a new verification code for a user.
 * Invalidates any previous active codes.
 */
export async function issueAndSendVerification(user: User): Promise<IssueVerificationResult> {
  // Generate code and hash
  const otp = generateSecureOTP();
  const salt = generateSalt();
  const otpHash = hashOTP(otp, salt);
  const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000).toISOString();

  // Persist record to DB (also invalidates prior codes for this user)
  await db.createEmailVerification({
    user_id: user.id,
    email: user.email,
    otp_hash: otpHash,
    salt,
    expires_at: expiresAt,
    purpose: 'email_verification',
  });

  // Log non-sensitive event
  console.log(`[Email Verification] Issued verification challenge for user ${user.id} (${user.email}). Expires in ${OTP_EXPIRATION_MINUTES}m.`);

  // Send real transactional email via Resend
  const emailRes = await sendVerificationEmail({
    to: user.email,
    name: user.name,
    otp, // sent strictly via email, never logged or returned in production
  });

  let emailDelivery: 'sent' | 'not_configured' | 'error' = 'sent';
  let statusText = 'Verification code sent. Check your inbox for your 6-digit code.';
  let emailError: string | undefined;

  if (emailRes.success) {
    emailDelivery = 'sent';
    statusText = 'Verification code sent. Check your inbox for your 6-digit code.';
  } else if (emailRes.reason === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
    emailDelivery = 'not_configured';
    statusText = "Email verification isn't configured yet. Receipto can't send verification emails in this environment. Configure Resend to enable real email delivery.";
    console.warn(`[Email Verification] Email provider is not configured for ${user.email}.`);
  } else {
    emailDelivery = 'error';
    statusText = "We couldn't send your verification email. Please try again in a moment.";
    emailError = emailRes.error || emailRes.statusText;
    console.warn(`[Email Verification] Email dispatch error for ${user.email}: ${emailError}`);
  }

  // Preview / Development Mode fallback:
  // ONLY in non-production environments when email was not dispatched through a real email provider.
  // NEVER exposed in production environments.
  const isDevOrPreview = process.env.NODE_ENV !== 'production';
  const devPreviewOtp = isDevOrPreview && emailDelivery !== 'sent' ? otp : undefined;

  return {
    success: true,
    emailDelivery,
    statusText,
    emailError,
    expiresAt,
    devPreviewOtp,
  };
}

export type VerifyResult = {
  success: boolean;
  user?: User;
  reason?: 'not_found' | 'already_verified' | 'expired' | 'max_attempts_exceeded' | 'invalid_code' | 'already_used';
  message?: string;
  attemptsRemaining?: number;
};

/**
 * Verify a submitted 6-digit OTP for a user
 */
export async function verifyUserOTP(userId: string, candidateOtp: string): Promise<VerifyResult> {
  const user = await db.getUserById(userId);
  if (!user) {
    return { success: false, reason: 'not_found', message: 'User not found.' };
  }

  if (user.email_verified) {
    return { success: false, reason: 'already_verified', message: 'Account is already verified.' };
  }

  const verification = await db.getLatestEmailVerification(userId, 'email_verification');
  if (!verification) {
    return { success: false, reason: 'not_found', message: 'No active verification code found. Please request a new code.' };
  }

  // Check if already used
  if (verification.used_at) {
    return { success: false, reason: 'already_used', message: 'This verification code has already been used or superseded. Please request a new one.' };
  }

  // Check attempt limit
  if (verification.attempt_count >= MAX_VERIFICATION_ATTEMPTS) {
    // Invalidate code upon exceeding attempts
    await db.invalidateVerification(verification.id, 'MAX_ATTEMPTS_EXCEEDED');
    return {
      success: false,
      reason: 'max_attempts_exceeded',
      message: 'Too many incorrect attempts. This code has been invalidated. Please request a new verification code.',
      attemptsRemaining: 0,
    };
  }

  // Check expiration
  const now = new Date();
  const expiresAt = new Date(verification.expires_at);
  if (now > expiresAt) {
    await db.invalidateVerification(verification.id, 'EXPIRED');
    return { success: false, reason: 'expired', message: 'Verification code has expired. Please request a new one.' };
  }

  // Record attempt count
  const { attempt_count } = await db.recordVerificationAttempt(verification.id);

  // Validate OTP
  const isValid = verifyOTPHash(candidateOtp, verification.otp_hash, verification.salt);
  if (!isValid) {
    const remaining = Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempt_count);
    if (remaining === 0) {
      await db.invalidateVerification(verification.id, 'MAX_ATTEMPTS_EXCEEDED');
      return {
        success: false,
        reason: 'max_attempts_exceeded',
        message: 'Invalid code. You have reached the maximum number of attempts. Please request a new code.',
        attemptsRemaining: 0,
      };
    }
    return {
      success: false,
      reason: 'invalid_code',
      message: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      attemptsRemaining: remaining,
    };
  }

  // OTP is correct! Mark used and verify user
  await db.markVerificationUsed(verification.id);
  await db.setUserEmailVerified(user.id, true);

  // Log activity
  await db.createActivityLog(user.id, 'EMAIL_VERIFIED', `User email ${user.email} verified successfully.`);

  const updatedUser = await db.getUserById(user.id);
  return { success: true, user: updatedUser || user };
}

export interface ResendVerificationResult {
  success: boolean;
  message: string;
  emailDelivery?: 'sent' | 'not_configured' | 'error';
  emailError?: string;
  devPreviewOtp?: string;
  cooldownRemaining?: number;
}

/**
 * Handle a resend request with cooldown enforcement
 */
export async function resendVerificationCode(userId: string): Promise<ResendVerificationResult> {
  const user = await db.getUserById(userId);
  if (!user) {
    return { success: false, message: 'User not found.' };
  }

  if (user.email_verified) {
    return { success: false, message: 'Account is already verified.' };
  }

  const latest = await db.getLatestEmailVerification(userId, 'email_verification');
  if (latest) {
    const lastTime = new Date(latest.last_resend_at || latest.created_at).getTime();
    const elapsedSeconds = Math.floor((Date.now() - lastTime) / 1000);
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      return {
        success: false,
        message: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another verification code.`,
        cooldownRemaining: wait,
      };
    }
  }

  // Issue new code
  const result = await issueAndSendVerification(user);
  return {
    success: true,
    message: result.statusText,
    emailDelivery: result.emailDelivery,
    emailError: result.emailError,
    devPreviewOtp: result.devPreviewOtp,
  };
}
