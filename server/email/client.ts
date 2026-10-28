import { logger } from '../lib/logger.js';
import type {
  SendReminderOptions,
  EmailResult,
  SendVerificationEmailOptions,
  VerificationEmailDeliveryResult,
  SubscriptionEmailOptions,
  WelcomeEmailOptions,
  PasswordResetEmailOptions,
} from './types.js';
import {
  generateReminderEmailContent,
  generateVerificationEmailContent,
  generateSubscriptionEmailContent,
  generatePaymentFailureEmailContent,
  generateSubscriptionCancelledEmailContent,
  generateWelcomeEmailContent,
  generatePasswordResetEmailContent,
} from './templates.js';

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

export function isResendConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return Boolean(apiKey && apiKey.startsWith('re_') && apiKey.length >= 20 && !apiKey.includes('placeholder'));
}

async function dispatchResend(payload: ResendPayload): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!isResendConfigured()) {
    return { ok: false, status: 0, error: 'RESEND_API_KEY is not configured or invalid format.' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      const errorMsg = data?.message || data?.error || `HTTP ${res.status} from Resend`;
      logger.error({ errorMsg }, 'Resend API error');
      return { ok: false, status: res.status, error: errorMsg };
    }
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    logger.error({ err: err.message }, 'Resend network dispatch error');
    return { ok: false, status: 0, error: err.message };
  }
}

export async function sendReminderEmail(options: SendReminderOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL)?.trim() || 'Receipto <billing@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (!apiKey || !apiKey.startsWith('re_') || apiKey.length < 20 || apiKey.includes('placeholder')) {
    return {
      success: false,
      configured: false,
      statusText: 'Email could not be sent. Please check your email configuration.',
      error: 'RESEND_API_KEY is not configured or invalid format.',
    };
  }

  const { subject, html, text } = generateReminderEmailContent(options);
  const result = await dispatchResend({
    from: fromEmail,
    to: [options.to],
    subject,
    html,
    text,
    reply_to: replyTo || undefined,
  });

  if (!result.ok) {
    return {
      success: false,
      configured: true,
      statusText: 'Email could not be sent. Please check your email configuration.',
      error: result.error,
    };
  }

  return {
    success: true,
    configured: true,
    messageId: result.data?.id,
    statusText: 'Reminder email sent.',
  };
}

export async function sendVerificationEmail(options: SendVerificationEmailOptions): Promise<VerificationEmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <onboarding@resend.dev>';

  if (!apiKey) {
    return {
      success: false,
      reason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      statusText: "Email verification isn't configured yet. Receipto can't send verification emails in this environment. Configure Resend to enable real email delivery.",
    };
  }

  const { subject, html, text } = generateVerificationEmailContent(options);
  const result = await dispatchResend({
    from: fromEmail,
    to: [options.to],
    subject,
    html,
    text,
  });

  if (!result.ok) {
    return {
      success: false,
      reason: 'EMAIL_PROVIDER_ERROR',
      statusText: `Email delivery failed: ${result.error}`,
      error: result.error,
    };
  }

  return {
    success: true,
    messageId: result.data?.id,
    statusText: 'Verification code sent. Check your inbox for your 6-digit code.',
  };
}

export async function sendVerificationOtpEmail(options: SendVerificationEmailOptions): Promise<EmailResult> {
  const res = await sendVerificationEmail(options);
  if (res.success) {
    return { success: true, configured: true, messageId: res.messageId, statusText: res.statusText };
  }
  return {
    success: false,
    configured: res.reason !== 'EMAIL_PROVIDER_NOT_CONFIGURED',
    statusText: res.statusText,
    error: res.reason === 'EMAIL_PROVIDER_ERROR' ? res.error : undefined,
  };
}

export async function sendSubscriptionConfirmationEmail(options: SubscriptionEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <billing@resend.dev>';

  if (!apiKey) {
    return {
      success: false,
      configured: false,
      statusText: 'Email service is not configured (RESEND_API_KEY is unset).',
    };
  }

  const { subject, html, text } = generateSubscriptionEmailContent(options);
  const result = await dispatchResend({ from: fromEmail, to: [options.to], subject, html, text });

  if (!result.ok) {
    return { success: false, configured: true, statusText: `Resend error: ${result.error}` };
  }

  return { success: true, configured: true, messageId: result.data?.id, statusText: 'Subscription confirmation delivered.' };
}

export async function sendPaymentFailureEmail(options: { to: string; name: string; planName: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <billing@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const { subject, html, text } = generatePaymentFailureEmailContent(options);
  const result = await dispatchResend({ from: fromEmail, to: [options.to], subject, html, text });

  if (!result.ok) {
    return { success: false, configured: true, statusText: result.error || 'Failed' };
  }

  return { success: true, configured: true, messageId: result.data?.id, statusText: 'Payment failure notice dispatched.' };
}

export async function sendSubscriptionCancelledEmail(options: { to: string; name: string; planName: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <billing@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const { subject, html, text } = generateSubscriptionCancelledEmailContent(options);
  const result = await dispatchResend({ from: fromEmail, to: [options.to], subject, html, text });

  if (!result.ok) {
    return { success: false, configured: true, statusText: result.error || 'Failed' };
  }

  return { success: true, configured: true, messageId: result.data?.id, statusText: 'Cancellation notice dispatched.' };
}

export async function sendWelcomeEmail(options: WelcomeEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <onboarding@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const { subject, html, text } = generateWelcomeEmailContent(options);
  const result = await dispatchResend({ from: fromEmail, to: [options.to], subject, html, text });

  if (!result.ok) {
    return { success: false, configured: true, statusText: result.error || 'Failed' };
  }

  return { success: true, configured: true, messageId: result.data?.id, statusText: 'Welcome email dispatched.' };
}

export async function sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <security@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const { subject, html, text } = generatePasswordResetEmailContent(options);
  const result = await dispatchResend({ from: fromEmail, to: [options.to], subject, html, text });

  if (!result.ok) {
    return { success: false, configured: true, statusText: result.error || 'Failed' };
  }

  return { success: true, configured: true, messageId: result.data?.id, statusText: 'Password reset code dispatched.' };
}

export async function sendOverdueReminderEmail(options: SendReminderOptions): Promise<EmailResult> {
  return sendReminderEmail({
    ...options,
    tone: 'urgent',
  });
}
