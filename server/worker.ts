import * as db from './db.js';
import { sendReminderEmail } from './email.js';
import { PLAN_CONFIGS } from './plans.js';

interface WorkerState {
  running: boolean;
  intervalId: NodeJS.Timeout | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  totalRuns: number;
  totalRemindersSent: number;
  intervalSeconds: number;
}

const state: WorkerState = {
  running: false,
  intervalId: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  totalRuns: 0,
  totalRemindersSent: 0,
  intervalSeconds: 3600, // hourly
};

export function getWorkerStatus() {
  return {
    running: state.running,
    last_run_at: state.lastRunAt,
    last_success_at: state.lastSuccessAt,
    last_failure_at: state.lastFailureAt,
    last_error: state.lastError,
    total_runs: state.totalRuns,
    total_reminders_sent: state.totalRemindersSent,
    interval_seconds: state.intervalSeconds,
  };
}

/**
 * Execute a single cycle of the automated reminder worker
 */
export async function runWorkerCycle(): Promise<{
  success: boolean;
  remindersSent: number;
  message: string;
  error?: string;
}> {
  if (state.running) {
    return {
      success: false,
      remindersSent: 0,
      message: 'Worker cycle is already currently running.',
    };
  }

  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.totalRuns++;

  let sentCount = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // Get users with active automated reminder permissions
    const eligibleUsers = await db.getUsersWithAutomatedReminders();

    for (const user of eligibleUsers) {
      if (user.status === 'SUSPENDED') continue;

      // Get user's invoices
      const invoices = await db.getInvoices(user.id);
      const overdueInvoices = invoices.filter(
        (inv) => inv.payment_status === 'OVERDUE' || (inv.payment_status === 'UNPAID' && inv.due_date < todayStr)
      );

      for (const inv of overdueInvoices) {
        // Check if reminder was already sent in the last 3 days for this invoice
        const recentReminders = await db.getRecentRemindersForInvoice(inv.id, 3);
        if (recentReminders.length > 0) {
          continue; // Already reminded recently
        }

        const client = await db.getClientById(user.id, inv.client_id);
        if (!client || !client.email) continue;

        // Dispatch reminder
        const tone: 'friendly' | 'standard' | 'urgent' = 'urgent';
        const emailRes = await sendReminderEmail({
          to: client.email,
          clientName: client.name,
          invoiceNumber: inv.invoice_number,
          amount: inv.amount,
          currency: inv.currency,
          dueDate: inv.due_date,
          businessName: user.business_name || user.name || 'Receipto',
          tone,
        });

        if (emailRes.success) {
          await db.createReminder(user.id, {
            invoice_id: inv.id,
            client_id: inv.client_id,
            recipient_email: client.email,
            subject: `Automated Reminder: Invoice #${inv.invoice_number}`,
            message: `Automated reminder dispatched for overdue invoice #${inv.invoice_number}`,
            status: 'SENT',
          });

          await db.createActivityLog(
            user.id,
            'automated_reminder_sent',
            `Automated overdue reminder sent to ${client.name} for invoice #${inv.invoice_number}`,
            {
              invoice_id: inv.id,
              client_id: inv.client_id,
              invoice_number: inv.invoice_number,
              worker: true,
            }
          );

          sentCount++;
          state.totalRemindersSent++;
        }
      }
    }

    state.lastSuccessAt = new Date().toISOString();
    state.lastError = null;

    return {
      success: true,
      remindersSent: sentCount,
      message: `Worker executed successfully. Dispatched ${sentCount} automated reminder(s).`,
    };
  } catch (err: any) {
    console.error('[Background Worker Error]', err.message);
    state.lastFailureAt = new Date().toISOString();
    state.lastError = err.message;

    return {
      success: false,
      remindersSent: sentCount,
      message: `Worker execution encountered an error: ${err.message}`,
      error: err.message,
    };
  } finally {
    state.running = false;
  }
}

/**
 * Start the background worker process with periodic interval
 */
export function startWorker(intervalMs: number = 3600 * 1000) {
  if (state.intervalId) {
    clearInterval(state.intervalId);
  }

  state.intervalSeconds = Math.round(intervalMs / 1000);

  // Run initial cycle after 15 seconds of startup (non-blocking)
  setTimeout(() => {
    runWorkerCycle().catch((err) => console.error('[Worker Initial Run]', err.message));
  }, 15000);

  state.intervalId = setInterval(() => {
    runWorkerCycle().catch((err) => console.error('[Worker Interval Run]', err.message));
  }, intervalMs);

  console.log(`[Receipto] Background reminder worker scheduled (interval: ${state.intervalSeconds}s).`);
}

export function stopWorker() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

export const startReminderWorker = startWorker;
export const stopReminderWorker = stopWorker;
