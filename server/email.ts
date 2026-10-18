// Email service for Invoice reminders using Resend API

export interface SendReminderOptions {
  to: string;
  clientName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  businessName: string;
  tone?: 'friendly' | 'standard' | 'urgent';
  customMessage?: string;
}

export interface EmailResult {
  success: boolean;
  configured: boolean;
  messageId?: string;
  statusText: string;
  error?: string;
}

// Escape HTML entities to prevent HTML injection in emails
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateReminderEmailContent(options: SendReminderOptions): { subject: string; html: string; text: string } {
  const safeClient = escapeHtml(options.clientName);
  const safeBusiness = escapeHtml(options.businessName || 'Receipto');
  const safeInvoice = escapeHtml(options.invoiceNumber);
  const safeCurrency = escapeHtml(options.currency || 'USD');
  const safeAmount = Number(options.amount).toFixed(2);
  const safeDueDate = escapeHtml(options.dueDate);
  const customMessage = options.customMessage ? escapeHtml(options.customMessage) : '';

  let subject = `Invoice ${safeInvoice} Payment Reminder from ${safeBusiness}`;
  let toneHeader = 'Friendly Payment Reminder';
  let toneIntro = `We hope you are having a wonderful week. This is a gentle reminder that invoice <strong>#${safeInvoice}</strong> is due on <strong>${safeDueDate}</strong>.`;

  if (options.tone === 'urgent') {
    subject = `URGENT: Overdue Payment Notice - Invoice ${safeInvoice} from ${safeBusiness}`;
    toneHeader = 'Overdue Payment Notice';
    toneIntro = `Our records indicate that invoice <strong>#${safeInvoice}</strong> was due on <strong>${safeDueDate}</strong> and remains outstanding. Please process payment promptly.`;
  } else if (options.tone === 'standard') {
    subject = `Payment Reminder: Invoice ${safeInvoice} (${safeCurrency} ${safeAmount})`;
    toneHeader = 'Invoice Payment Reminder';
    toneIntro = `Please be advised that invoice <strong>#${safeInvoice}</strong> is due for payment on <strong>${safeDueDate}</strong>.`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 24px 32px; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
          .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 14px; }
          .content { padding: 32px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; background: #fef3c7; color: #92400e; margin-bottom: 16px; }
          .details-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px dashed #e2e8f0; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; }
          .detail-value { font-weight: 600; color: #0f172a; }
          .total-row { display: flex; justify-content: space-between; padding: 12px 0 6px 0; font-size: 18px; font-weight: 700; color: #0f172a; border-top: 2px solid #e2e8f0; margin-top: 8px; }
          .note { font-size: 14px; color: #475569; background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 16px 0; border-radius: 4px; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${safeBusiness}</h1>
            <p>${toneHeader}</p>
          </div>
          <div class="content">
            <span class="badge">Invoice Reminder</span>
            <p>Dear ${safeClient},</p>
            <p>${toneIntro}</p>

            ${customMessage ? `<div class="note"><strong>Message from sender:</strong><br>${customMessage}</div>` : ''}

            <div class="details-card">
              <div class="detail-row">
                <span class="detail-label">Invoice Number</span>
                <span class="detail-value">#${safeInvoice}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Due Date</span>
                <span class="detail-value">${safeDueDate}</span>
              </div>
              <div class="total-row">
                <span>Amount Due</span>
                <span>${safeCurrency} ${safeAmount}</span>
              </div>
            </div>

            <p style="font-size: 14px; color: #64748b;">
              If you have already submitted payment, please disregard this notice. Thank you for your continued business!
            </p>
          </div>
          <div class="footer">
            Sent via Receipto on behalf of ${safeBusiness}.
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
${safeBusiness} - ${toneHeader}
Invoice: #${safeInvoice}
Dear ${safeClient},

${toneIntro.replace(/<[^>]*>?/gm, '')}

${customMessage ? `Message from sender:\n${customMessage}\n\n` : ''}
Invoice Number: #${safeInvoice}
Due Date: ${safeDueDate}
Amount Due: ${safeCurrency} ${safeAmount}

If payment has already been sent, please disregard this notice.

Best regards,
${safeBusiness}
  `.trim();

  return { subject, html, text };
}

export async function sendReminderEmail(options: SendReminderOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL)?.trim() || 'Receipto <billing@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  // Validate API key: must exist, start with re_, and not be a placeholder
  if (!apiKey || !apiKey.startsWith('re_') || apiKey.length < 20 || apiKey.includes('placeholder')) {
    return {
      success: false,
      configured: false,
      statusText: 'Email could not be sent. Please check your email configuration.',
      error: 'RESEND_API_KEY is not configured or invalid format.',
    };
  }

  const { subject, html, text } = generateReminderEmailContent(options);

  try {
    const payload: any = {
      from: fromEmail,
      to: [options.to],
      subject,
      html,
      text,
    };
    if (replyTo) {
      payload.reply_to = replyTo;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `HTTP ${response.status} from Resend`;
      console.error('[Resend Error]', errorMsg);
      return {
        success: false,
        configured: true,
        statusText: 'Email could not be sent. Please check your email configuration.',
        error: errorMsg,
      };
    }

    return {
      success: true,
      configured: true,
      messageId: data.id,
      statusText: 'Reminder email sent.',
    };
  } catch (err: any) {
    console.error('[Email Dispatch Error]', err.message);
    return {
      success: false,
      configured: true,
      statusText: 'Email could not be sent. Please check your email configuration.',
      error: err.message,
    };
  }
}

export interface SendVerificationEmailOptions {
  to: string;
  name: string;
  otp: string;
}

export type VerificationEmailDeliveryResult =
  | { success: true; messageId?: string; statusText: string }
  | { success: false; reason: 'EMAIL_PROVIDER_NOT_CONFIGURED'; statusText: string }
  | { success: false; reason: 'EMAIL_PROVIDER_ERROR'; statusText: string; error?: string };

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

  const safeName = escapeHtml(options.name || 'there');
  const safeOtp = escapeHtml(options.otp);
  const subject = `Your Receipto verification code is ${safeOtp}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email address - Receipto</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; color: #ffffff; padding: 28px 32px; text-align: left; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; color: #ffffff; }
          .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
          .content { padding: 36px 32px; }
          .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
          .intro { font-size: 15px; color: #475569; margin: 0 0 24px 0; }
          .otp-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 24px; text-align: center; margin: 28px 0; }
          .otp-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.35em; color: #0f172a; margin-left: 0.35em; }
          .otp-meta { margin-top: 10px; font-size: 13px; font-weight: 500; color: #64748b; }
          .warning { font-size: 13px; color: #64748b; background-color: #f1f5f9; border-radius: 8px; padding: 14px 16px; margin-top: 24px; line-height: 1.5; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Receipto</h1>
            <p>Account Security &amp; Email Verification</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${safeName},</div>
            <p class="intro">Thank you for registering with Receipto. Please enter the verification code below to verify your email address and activate your account.</p>
            <div class="otp-box">
              <div class="otp-code">${safeOtp}</div>
              <div class="otp-meta">This code will expire in <strong>10 minutes</strong>.</div>
            </div>
            <div class="warning">
              <strong>Security Notice:</strong> This code can only be used once. If you did not create a Receipto account, you can safely ignore this email &mdash; no account will be activated without this verification code.
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Receipto. All rights reserved.<br>
            Automated security dispatch. Please do not reply directly to this email.
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Email Verification

Hello ${options.name || 'there'},

Thank you for registering with Receipto.

Your verification code is: ${options.otp}

This code expires in 10 minutes and can only be used once.

If you did not create a Receipto account, you can safely ignore this message.

--
Receipto Automated Security`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [options.to],
        subject,
        html,
        text,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `HTTP ${response.status} from Resend`;
      console.error('[Resend Error sending OTP]', errorMsg);
      return {
        success: false,
        reason: 'EMAIL_PROVIDER_ERROR',
        statusText: `Email delivery failed: ${errorMsg}`,
        error: errorMsg,
      };
    }

    return {
      success: true,
      messageId: data.id,
      statusText: `Verification code sent. Check your inbox for your 6-digit code.`,
    };
  } catch (err: any) {
    console.error('[Email Dispatch Error sending OTP]', err.message);
    return {
      success: false,
      reason: 'EMAIL_PROVIDER_ERROR',
      statusText: `Network error reaching email service: ${err.message}`,
      error: err.message,
    };
  }
}

// Backward-compatible alias
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

// ----------------------------------------------------
// Subscription Confirmation Email
// ----------------------------------------------------
export interface SubscriptionEmailOptions {
  to: string;
  name: string;
  planName: string;
  billingInterval: string;
  amountFormatted: string;
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

  const safeName = escapeHtml(options.name || 'there');
  const safePlan = escapeHtml(options.planName);
  const safeInterval = escapeHtml(options.billingInterval);
  const safeAmount = escapeHtml(options.amountFormatted);
  const subject = `Welcome to Receipto ${safePlan}! Your subscription is active.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 28px 32px; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; }
          .content { padding: 32px; }
          .plan-badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-size: 13px; font-weight: 700; background: #ecfdf5; color: #065f46; margin-bottom: 16px; }
          .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
          .row:last-child { border-bottom: none; font-weight: 700; font-size: 16px; color: #0f172a; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Receipto</h1>
            <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Subscription Confirmation</p>
          </div>
          <div class="content">
            <span class="plan-badge">${safePlan} Plan Activated</span>
            <p>Hello ${safeName},</p>
            <p>Thank you for upgrading to <strong>Receipto ${safePlan}</strong>! Your account limits and advanced features have been automatically unlocked.</p>
            <div class="summary-card">
              <div class="row"><span>Plan Tier</span><span>${safePlan}</span></div>
              <div class="row"><span>Billing Cadence</span><span>${safeInterval}</span></div>
              <div class="row"><span>Total</span><span>${safeAmount}</span></div>
            </div>
            <p style="font-size: 14px; color: #64748b;">You can manage your subscription, download tax invoices, or update your payment methods at any time from your Receipto Billing settings.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Receipto. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Subscription Confirmation\n\nHello ${options.name || 'there'},\n\nThank you for upgrading to Receipto ${options.planName} (${options.billingInterval}) for ${options.amountFormatted}.\nYour account features are now unlocked.\n\n--\nReceipto Team`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [options.to], subject, html, text }),
    });
    const data = await response.json() as any;
    if (!response.ok) {
      return { success: false, configured: true, statusText: `Resend error: ${data?.message || 'Failed'}` };
    }
    return { success: true, configured: true, messageId: data.id, statusText: 'Subscription confirmation delivered.' };
  } catch (err: any) {
    return { success: false, configured: true, statusText: err.message };
  }
}

// ----------------------------------------------------
// Payment Failure Warning Email
// ----------------------------------------------------
export async function sendPaymentFailureEmail(options: { to: string; name: string; planName: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <billing@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const safeName = escapeHtml(options.name || 'there');
  const safePlan = escapeHtml(options.planName);
  const subject = `Action Required: Payment failed for your Receipto ${safePlan} subscription`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #fecdd3; border-radius: 12px; overflow: hidden; }
          .header { background: #991b1b; color: #ffffff; padding: 28px 32px; }
          .content { padding: 32px; }
          .alert { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 16px; margin: 20px 0; color: #9f1239; font-size: 14px; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Receipto Payment Notice</h1>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <div class="alert">
              <strong>Payment Failed:</strong> We were unable to process the renewal payment for your <strong>${safePlan}</strong> plan.
            </div>
            <p>Please update your payment details in the Receipto Billing portal to ensure uninterrupted automated reminders and higher capacity limits.</p>
            <p style="font-size: 14px; color: #64748b;">Your data remains safe and preserved. We will automatically retry the payment method on file per standard retry schedules.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Payment Notice\n\nHello ${options.name || 'there'},\nWe were unable to process payment for your Receipto ${options.planName} plan. Please update your billing method.\n\n--\nReceipto Team`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [options.to], subject, html, text }),
    });
    const data = await response.json() as any;
    if (!response.ok) return { success: false, configured: true, statusText: data?.message || 'Failed' };
    return { success: true, configured: true, messageId: data.id, statusText: 'Payment failure notice dispatched.' };
  } catch (err: any) {
    return { success: false, configured: true, statusText: err.message };
  }
}

// ----------------------------------------------------
// Subscription Cancelled Notice Email
// ----------------------------------------------------
export async function sendSubscriptionCancelledEmail(options: { to: string; name: string; planName: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <billing@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const safeName = escapeHtml(options.name || 'there');
  const safePlan = escapeHtml(options.planName);
  const subject = `Your Receipto ${safePlan} subscription has ended`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .header { background: #1e293b; color: #ffffff; padding: 28px 32px; }
          .content { padding: 32px; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Receipto</h1>
            <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Subscription Update</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>Your subscription to <strong>Receipto ${safePlan}</strong> has ended and your account has returned to the <strong>Free</strong> tier.</p>
            <p>All of your invoices, clients, and payment history remain securely preserved. If you ever need automated reminders or higher limits again, you can re-upgrade anytime.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Subscription Ended\n\nHello ${options.name || 'there'},\nYour Receipto ${options.planName} subscription has ended and your account is now on the Free tier. Your data is preserved.\n\n--\nReceipto Team`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [options.to], subject, html, text }),
    });
    const data = await response.json() as any;
    if (!response.ok) return { success: false, configured: true, statusText: data?.message || 'Failed' };
    return { success: true, configured: true, messageId: data.id, statusText: 'Cancellation notice dispatched.' };
  } catch (err: any) {
    return { success: false, configured: true, statusText: err.message };
  }
}

// ----------------------------------------------------
// Welcome Email (Dispatched upon email verification)
// ----------------------------------------------------
export interface WelcomeEmailOptions {
  to: string;
  name: string;
  businessName?: string;
}

export async function sendWelcomeEmail(options: WelcomeEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <onboarding@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const safeName = escapeHtml(options.name || 'there');
  const safeBusiness = options.businessName ? escapeHtml(options.businessName) : 'your business';
  const subject = `Welcome to Receipto — Invoice Tracking & Polite Payment Follow-ups`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 28px 32px; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; }
          .content { padding: 32px; }
          .feature-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Receipto</h1>
            <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Accounts-Receivable Automation</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>Your Receipto account is now verified and ready for ${safeBusiness}. Receipto helps you eliminate unpaid invoices with clear tracking and polite, automated reminder notices.</p>
            <div class="feature-box">
              <strong style="color: #0f172a;">Quick Start Checklist:</strong>
              <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #475569;">
                <li>Add your first client under <strong>Clients</strong></li>
                <li>Generate and issue an invoice with customized payment terms</li>
                <li>Send automated or polite manual reminder notices before and after due dates</li>
              </ul>
            </div>
            <p style="font-size: 14px; color: #64748b;">If you need assistance setting up custom reminder cadences or Paddle billing, our team is here to help.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Welcome to Receipto!\n\nHello ${options.name || 'there'},\nYour Receipto account is verified and ready. Start adding clients and tracking invoices today.\n\n--\nReceipto Team`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [options.to], subject, html, text }),
    });
    const data = await response.json() as any;
    if (!response.ok) return { success: false, configured: true, statusText: data?.message || 'Failed' };
    return { success: true, configured: true, messageId: data.id, statusText: 'Welcome email dispatched.' };
  } catch (err: any) {
    return { success: false, configured: true, statusText: err.message };
  }
}

// ----------------------------------------------------
// Password Reset OTP Email
// ----------------------------------------------------
export interface PasswordResetEmailOptions {
  to: string;
  name: string;
  otp: string;
}

export async function sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Receipto <security@resend.dev>';

  if (!apiKey) {
    return { success: false, configured: false, statusText: 'Email service is not configured.' };
  }

  const safeName = escapeHtml(options.name || 'there');
  const safeOtp = escapeHtml(options.otp);
  const subject = `Receipto Password Reset Code: ${safeOtp}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 28px 32px; }
          .content { padding: 32px; }
          .otp-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-family: ui-monospace, monospace; font-size: 34px; font-weight: 800; letter-spacing: 0.3em; color: #0f172a; }
          .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Receipto Security</h1>
            <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Password Reset Request</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>We received a request to reset the password for your Receipto account. Enter the 6-digit verification code below:</p>
            <div class="otp-box">
              <div class="otp-code">${safeOtp}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Code expires in <strong>10 minutes</strong>.</div>
            </div>
            <p style="font-size: 13px; color: #64748b;">If you did not request a password reset, no further action is needed &mdash; your account remains secure.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Password Reset\n\nHello ${options.name || 'there'},\nYour password reset code is: ${options.otp}\nThis code expires in 10 minutes.\nIf you did not make this request, you can safely ignore this email.\n\n--\nReceipto Security`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [options.to], subject, html, text }),
    });
    const data = await response.json() as any;
    if (!response.ok) return { success: false, configured: true, statusText: data?.message || 'Failed' };
    return { success: true, configured: true, messageId: data.id, statusText: 'Password reset code dispatched.' };
  } catch (err: any) {
    return { success: false, configured: true, statusText: err.message };
  }
}

// ----------------------------------------------------
// Overdue Invoice Reminder Helper
// ----------------------------------------------------
export async function sendOverdueReminderEmail(options: SendReminderOptions): Promise<EmailResult> {
  return sendReminderEmail({
    ...options,
    tone: 'urgent',
  });
}



