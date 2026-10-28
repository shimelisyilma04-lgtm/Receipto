import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeHtml,
  generateReminderEmailContent,
  generateVerificationEmailContent,
  generateSubscriptionEmailContent,
  generatePaymentFailureEmailContent,
  generateWelcomeEmailContent,
  generatePasswordResetEmailContent,
} from '../email/templates.js';
import {
  isResendConfigured,
  sendReminderEmail,
  sendVerificationEmail,
  sendVerificationOtpEmail,
  sendSubscriptionConfirmationEmail,
  sendPaymentFailureEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from '../email/client.js';

describe('Email Service Templates', () => {
  it('escapes dangerous HTML characters to prevent XSS in email clients', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml("John O'Connor & Sons")).toBe(
      'John O&#039;Connor &amp; Sons'
    );
    expect(escapeHtml('')).toBe('');
  });

  describe('generateReminderEmailContent', () => {
    it('generates friendly tone reminder correctly', () => {
      const result = generateReminderEmailContent({
        to: 'client@example.com',
        clientName: 'Alice <Doe>',
        invoiceNumber: 'INV-100',
        amount: 250,
        currency: 'USD',
        dueDate: '2026-11-01',
        businessName: 'Acme & Co',
        tone: 'friendly',
        customMessage: 'Thanks for your partnership!',
      });

      expect(result.subject).toContain('Invoice INV-100 Payment Reminder');
      expect(result.html).toContain('Alice &lt;Doe&gt;');
      expect(result.html).toContain('Acme &amp; Co');
      expect(result.html).toContain('Thanks for your partnership!');
      expect(result.text).toContain('INV-100');
    });

    it('generates standard tone reminder', () => {
      const result = generateReminderEmailContent({
        to: 'client@example.com',
        clientName: 'Bob',
        invoiceNumber: 'INV-200',
        amount: 500,
        currency: 'EUR',
        dueDate: '2026-11-05',
        tone: 'standard',
      });

      expect(result.subject).toContain('Payment Reminder: Invoice INV-200');
      expect(result.html).toContain('EUR');
      expect(result.html).toContain('500.00');
    });

    it('generates urgent overdue reminder with strong subject line', () => {
      const result = generateReminderEmailContent({
        to: 'client@example.com',
        clientName: 'Charlie',
        invoiceNumber: 'INV-300',
        amount: 1500,
        currency: 'USD',
        dueDate: '2026-10-01',
        tone: 'urgent',
      });

      expect(result.subject).toContain('URGENT: Overdue Payment Notice');
      expect(result.html).toContain('Overdue Payment Notice');
    });
  });

  describe('generateVerificationEmailContent', () => {
    it('generates 6-digit OTP verification template', () => {
      const result = generateVerificationEmailContent({
        to: 'user@example.com',
        otp: '123456',
        name: 'Jane Smith',
      });

      expect(result.subject).toContain('123456');
      expect(result.html).toContain('123456');
      expect(result.html).toContain('Jane Smith');
      expect(result.text).toContain('123456');
    });
  });

  describe('generateSubscriptionEmailContent', () => {
    it('generates paid plan activation receipt template', () => {
      const result = generateSubscriptionEmailContent({
        to: 'corp@example.com',
        name: 'Tech Corp',
        planName: 'GROWTH',
        billingInterval: 'annual',
        amountFormatted: '$390.00 / year',
      });

      expect(result.subject).toContain('GROWTH');
      expect(result.html).toContain('Tech Corp');
      expect(result.html).toContain('GROWTH Plan Activated');
      expect(result.text).toContain('$390.00 / year');
    });
  });

  describe('generatePaymentFailureEmailContent', () => {
    it('generates payment failure recovery notice', () => {
      const result = generatePaymentFailureEmailContent({
        name: 'Alex',
        planName: 'Starter',
      });

      expect(result.subject).toContain('Action Required: Payment failed');
      expect(result.html).toContain('Alex');
      expect(result.text).toContain('Starter');
    });
  });

  describe('generateWelcomeEmailContent', () => {
    it('generates onboarding welcome email', () => {
      const result = generateWelcomeEmailContent({
        name: 'David',
        to: 'david@example.com',
      });

      expect(result.subject).toContain('Welcome to Receipto');
      expect(result.html).toContain('David');
      expect(result.text).toContain('Receipto');
    });
  });

  describe('generatePasswordResetEmailContent', () => {
    it('generates password reset instruction email', () => {
      const result = generatePasswordResetEmailContent({
        to: 'reset@example.com',
        name: 'Sarah',
        otp: '987654',
      });

      expect(result.subject).toContain('987654');
      expect(result.html).toContain('987654');
      expect(result.text).toContain('987654');
    });
  });
});

describe('Email Resend Client & Dispatcher', () => {
  const originalEnv = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checks whether Resend is configured', () => {
    delete process.env.RESEND_API_KEY;
    expect(isResendConfigured()).toBe(false);

    process.env.RESEND_API_KEY = 're_123456789012345678901234';
    expect(isResendConfigured()).toBe(true);

    if (originalEnv) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it('returns configured=false gracefully when sending without valid RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendReminderEmail({
      to: 'recipient@example.com',
      clientName: 'Test Client',
      invoiceNumber: 'INV-001',
      amount: 100,
      currency: 'USD',
      dueDate: '2026-11-01',
    });

    expect(result.success).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.statusText).toContain('check your email configuration');
  });

  it('handles simulated email dispatch when mock fetch succeeds', async () => {
    process.env.RESEND_API_KEY = 're_123456789012345678901234567890';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_msg_98765' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendReminderEmail({
      to: 'client@example.com',
      clientName: 'Acme Client',
      invoiceNumber: 'INV-101',
      amount: 100,
      currency: 'USD',
      dueDate: '2026-11-10',
    });

    expect(result.success).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.messageId).toBe('email_msg_98765');
    expect(mockFetch).toHaveBeenCalledOnce();

    if (originalEnv) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it('handles API errors from Resend gracefully', async () => {
    process.env.RESEND_API_KEY = 're_123456789012345678901234567890';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Domain unverified in Resend' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendVerificationEmail({
      to: 'user@example.com',
      otp: '654321',
      name: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('EMAIL_PROVIDER_ERROR');
    expect(result.statusText).toContain('Domain unverified in Resend');

    if (originalEnv) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it('dispatches welcome, password reset, and subscription emails', async () => {
    process.env.RESEND_API_KEY = 're_123456789012345678901234567890';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_sub_123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res1 = await sendSubscriptionConfirmationEmail({
      to: 'customer@example.com',
      name: 'Customer',
      planName: 'STARTER',
      billingInterval: 'monthly',
      amountFormatted: '$19 / month',
    });
    expect(res1.success).toBe(true);

    const res2 = await sendPaymentFailureEmail({
      to: 'customer@example.com',
      name: 'Customer',
      planName: 'STARTER',
    });
    expect(res2.success).toBe(true);

    const res3 = await sendWelcomeEmail({
      name: 'New User',
      to: 'newuser@example.com',
    });
    expect(res3.success).toBe(true);

    const res4 = await sendPasswordResetEmail({
      name: 'Existing User',
      to: 'user@example.com',
      otp: '334455',
    });
    expect(res4.success).toBe(true);

    const res5 = await sendVerificationOtpEmail({
      name: 'OTP User',
      to: 'otp@example.com',
      otp: '112233',
    });
    expect(res5.success).toBe(true);

    if (originalEnv) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });
});
