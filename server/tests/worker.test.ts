import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkerStatus, runWorkerCycle, startWorker, stopWorker } from '../worker.js';
import * as db from '../db.js';

describe('Background Reminder Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stopWorker();
  });

  afterEach(() => {
    stopWorker();
  });

  it('reports initial worker status correctly', () => {
    const status = getWorkerStatus();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('total_runs');
    expect(status).toHaveProperty('total_reminders_sent');
    expect(status).toHaveProperty('interval_seconds');
  });

  it('runs a complete cycle successfully when no overdue reminders are pending', async () => {
    vi.spyOn(db, 'getUsersWithAutomatedReminders').mockResolvedValueOnce([]);

    const result = await runWorkerCycle();
    expect(result.success).toBe(true);
    expect(result.remindersSent).toBe(0);
    expect(result.message).toContain('successfully');

    const status = getWorkerStatus();
    expect(status.total_runs).toBeGreaterThan(0);
    expect(status.last_run_at).not.toBeNull();
  });

  it('detects eligible overdue invoices and skips suspended accounts', async () => {
    process.env.RESEND_API_KEY = 're_123456789012345678901234567890';
    vi.spyOn(db, 'getUsersWithAutomatedReminders').mockResolvedValueOnce([
      {
        id: 'user_suspended',
        email: 'suspended@example.com',
        name: 'Suspended User',
        status: 'SUSPENDED',
        role: 'USER',
        email_verified: true,
        password_hash: 'hashed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'user_active',
        email: 'active@example.com',
        name: 'Active User',
        status: 'ACTIVE',
        role: 'USER',
        email_verified: true,
        password_hash: 'hashed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getInvoices').mockResolvedValueOnce([
      {
        id: 'inv_overdue',
        user_id: 'user_active',
        client_id: 'client_active',
        invoice_number: 'INV-OV-1',
        amount: 300,
        currency: 'USD',
        issue_date: '2026-09-01',
        due_date: '2026-09-15',
        payment_status: 'OVERDUE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getRecentRemindersForInvoice').mockResolvedValueOnce([]);
    vi.spyOn(db, 'getClientById').mockResolvedValueOnce({
      id: 'client_active',
      user_id: 'user_active',
      name: 'Client Alpha',
      email: 'client@alpha.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const createReminderSpy = vi.spyOn(db, 'createReminder').mockResolvedValueOnce({
      id: 'rem_1',
      user_id: 'user_active',
      invoice_id: 'inv_overdue',
      client_id: 'client_active',
      recipient_email: 'client@alpha.com',
      status: 'SENT',
      subject: 'Automated Reminder',
      message: 'Notice',
      created_at: new Date().toISOString(),
    });

    vi.spyOn(db, 'createActivityLog').mockResolvedValueOnce({} as any);

    // Mock fetch for sendReminderEmail
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_ok_1' }),
    }));

    const result = await runWorkerCycle();
    expect(result.success).toBe(true);
    expect(result.remindersSent).toBe(1);
    expect(createReminderSpy).toHaveBeenCalledOnce();
  });

  it('skips invoices that already received a reminder in the last 3 days', async () => {
    vi.spyOn(db, 'getUsersWithAutomatedReminders').mockResolvedValueOnce([
      {
        id: 'user_active',
        email: 'active@example.com',
        name: 'Active User',
        status: 'ACTIVE',
        role: 'USER',
        email_verified: true,
        password_hash: 'hashed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getInvoices').mockResolvedValueOnce([
      {
        id: 'inv_recently_reminded',
        user_id: 'user_active',
        client_id: 'client_active',
        invoice_number: 'INV-REC-1',
        amount: 450,
        currency: 'USD',
        issue_date: '2026-09-01',
        due_date: '2026-09-15',
        payment_status: 'OVERDUE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    // Has recent reminder
    vi.spyOn(db, 'getRecentRemindersForInvoice').mockResolvedValueOnce([
      {
        id: 'rem_recent',
        user_id: 'user_active',
        invoice_id: 'inv_recently_reminded',
        client_id: 'client_active',
        recipient_email: 'client@alpha.com',
        status: 'SENT',
        subject: 'Notice',
        message: 'Notice',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const createReminderSpy = vi.spyOn(db, 'createReminder');

    const result = await runWorkerCycle();
    expect(result.success).toBe(true);
    expect(result.remindersSent).toBe(0);
    expect(createReminderSpy).not.toHaveBeenCalled();
  });

  it('handles database exceptions inside cycle gracefully without crashing', async () => {
    vi.spyOn(db, 'getUsersWithAutomatedReminders').mockRejectedValueOnce(
      new Error('Firestore transient timeout')
    );

    const result = await runWorkerCycle();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Firestore transient timeout');

    const status = getWorkerStatus();
    expect(status.last_error).toContain('Firestore transient timeout');
  });

  it('starts and stops worker intervals safely', () => {
    startWorker(300000);
    expect(getWorkerStatus().interval_seconds).toBe(300);
    stopWorker();
  });
});
