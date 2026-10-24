import express from 'express';
import type { Response } from 'express';
import {
  getInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  cancelInvoice,
  deleteInvoice,
  getClientById,
  createActivityLog,
  checkFeatureAccess,
  checkCanCreateInvoice,
} from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { PlanLimitExceededError } from '../plans.js';
import { isValidDate } from './helpers.js';
import { logger } from '../lib/logger.js';
import {
  renderInvoiceNotFoundHtml,
  renderInvoiceErrorHtml,
  renderInvoicePrintHtml,
} from './invoicePrintTemplate.js';

export const invoicesRouter = express.Router();

// GET /api/invoices
invoicesRouter.get('/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, clientId, search, sortBy, sortOrder } = req.query as Record<string, string>;
    const invoices = await getInvoices(userId, { status, clientId, search, sortBy, sortOrder: sortOrder as any });
    res.status(200).json({ invoices });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve invoices');
    res.status(500).json({ error: 'Failed to retrieve invoices.' });
  }
});

// GET /api/invoices/export/csv and GET /api/invoices/export.csv
invoicesRouter.get(['/invoices/export/csv', '/invoices/export.csv'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
      const str = String(val);
      const isPureNumber = /^-?\d+(\.\d+)?$/.test(str.trim());
      if (!isPureNumber && /^[=+\-@\t\r]/.test(str)) {
        return `"'${str.replace(/"/g, '""')}"`;
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
    logger.error({ err: err.message }, 'CSV export error');
    res.status(500).json({ success: false, error: 'Failed to generate invoice export CSV.' });
  }
});

// POST /api/invoices
invoicesRouter.post('/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { client_id, invoice_number, amount, currency, issue_date, due_date, notes } = req.body;

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

    const client = await getClientById(userId, client_id);
    if (!client) {
      return res.status(404).json({ error: 'Selected client does not exist in your account.' });
    }

    if (!invoice_number || typeof invoice_number !== 'string' || invoice_number.trim().length === 0) {
      return res.status(400).json({ error: 'Invoice number is required (e.g. INV-001).' });
    }

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
    logger.error({ err: err.message }, 'Create invoice error');
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

// GET /api/invoices/:id
invoicesRouter.get('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Failed to retrieve invoice');
    res.status(500).json({ error: 'Failed to retrieve invoice.' });
  }
});

// GET /api/invoices/:id/print
invoicesRouter.get('/invoices/:id/print', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Print invoice error');
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderInvoiceErrorHtml());
  }
});

// PUT /api/invoices/:id
invoicesRouter.put('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Failed to update invoice');
    res.status(500).json({ error: 'Failed to update invoice.' });
  }
});

// POST /api/invoices/:id/pay
invoicesRouter.post('/invoices/:id/pay', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Pay invoice error');
    res.status(500).json({ error: err.message || 'Failed to mark invoice as paid.' });
  }
});

// POST /api/invoices/:id/cancel
invoicesRouter.post('/invoices/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error({ err: err.message }, 'Cancel invoice error');
    res.status(500).json({ error: err.message || 'Failed to cancel invoice.' });
  }
});

// DELETE /api/invoices/:id
invoicesRouter.delete('/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    res.status(200).json({ message: 'Invoice deleted successfully' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Delete invoice error');
    res.status(500).json({ error: 'Failed to delete invoice.' });
  }
});
