import express from 'express';
import type { Response } from 'express';
import {
  getReminders,
  getInvoiceById,
  getClientById,
  createReminder,
  createActivityLog,
  checkFeatureAccess,
  getInvoices,
} from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { sendReminderEmail, generateReminderEmailContent } from '../email.js';
import { logger } from '../lib/logger.js';

export const remindersRouter = express.Router();

// GET /api/reminders
remindersRouter.get('/reminders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoice_id } = req.query as { invoice_id?: string };
    const reminders = await getReminders(userId, invoice_id);
    res.status(200).json({ reminders });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve reminders');
    res.status(500).json({ error: 'Failed to retrieve reminders.' });
  }
});

// POST /api/reminders/preview
remindersRouter.post('/reminders/preview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Failed to generate reminder preview');
    res.status(500).json({ error: 'Failed to generate reminder preview.' });
  }
});

// POST /api/reminders/send
remindersRouter.post('/reminders/send', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
      sent_at: emailResult.success ? now : undefined,
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
    logger.error({ err: err.message }, 'Failed to process reminder request');
    res.status(500).json({ error: 'Failed to process reminder request.' });
  }
});

// POST /api/reminders/automate
remindersRouter.post('/reminders/automate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
        sent_at: emailResult.success ? now : undefined,
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
    logger.error({ err: err.message }, 'Failed to execute automated reminders');
    res.status(500).json({ error: 'Failed to execute automated reminders.' });
  }
});

// POST /api/reminders/schedules
remindersRouter.post('/reminders/schedules', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Failed to configure reminder schedules');
    res.status(500).json({ error: 'Failed to configure reminder schedules.' });
  }
});
