import type {
  SendReminderOptions,
  SendVerificationEmailOptions,
  SubscriptionEmailOptions,
  WelcomeEmailOptions,
  PasswordResetEmailOptions,
} from './types.js';

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

export function generateVerificationEmailContent(options: SendVerificationEmailOptions): { subject: string; html: string; text: string } {
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

  const text = `Receipto - Email Verification\n\nHello ${options.name || 'there'},\n\nThank you for registering with Receipto.\nYour verification code is: ${options.otp}\nThis code expires in 10 minutes and can only be used once.\n\n--\nReceipto Automated Security`;

  return { subject, html, text };
}

export function generateSubscriptionEmailContent(options: SubscriptionEmailOptions): { subject: string; html: string; text: string } {
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

  return { subject, html, text };
}

export function generatePaymentFailureEmailContent(options: { name: string; planName: string }): { subject: string; html: string; text: string } {
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
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Payment Notice\n\nHello ${options.name || 'there'},\nWe were unable to process payment for your Receipto ${options.planName} plan. Please update your billing method.\n\n--\nReceipto Team`;

  return { subject, html, text };
}

export function generateSubscriptionCancelledEmailContent(options: { name: string; planName: string }): { subject: string; html: string; text: string } {
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
            <p>All of your invoices, clients, and payment history remain securely preserved.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Receipto - Subscription Ended\n\nHello ${options.name || 'there'},\nYour Receipto ${options.planName} subscription has ended and your account is now on the Free tier. Your data is preserved.\n\n--\nReceipto Team`;

  return { subject, html, text };
}

export function generateWelcomeEmailContent(options: WelcomeEmailOptions): { subject: string; html: string; text: string } {
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
            <p>Your Receipto account is now verified and ready for ${safeBusiness}.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Receipto. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `Welcome to Receipto!\n\nHello ${options.name || 'there'},\nYour Receipto account is verified and ready. Start adding clients and tracking invoices today.\n\n--\nReceipto Team`;

  return { subject, html, text };
}

export function generatePasswordResetEmailContent(options: PasswordResetEmailOptions): { subject: string; html: string; text: string } {
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

  return { subject, html, text };
}
