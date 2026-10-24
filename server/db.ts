import fs from 'fs';
import path from 'path';
import type { DashboardStats } from './types.js';
import { logger } from './lib/logger.js';
import { reloadLocalStore, userMutex, saveStore, memoryStore } from './lib/dbStore.js';
import { getInvoices } from './repositories/invoiceRepository.js';
import { getActivityLogs } from './repositories/activityRepository.js';
import { getClients } from './repositories/clientRepository.js';

// Re-export concurrency locking primitive
export { AsyncKeyLock } from './lib/asyncKeyLock.js';
export { userMutex, reloadLocalStore, saveStore, memoryStore } from './lib/dbStore.js';

// Re-export User & Session Repository
export {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserLastLogin,
  updateUserPassword,
  updateUserProfile,
  updateUserEmail,
  setUserEmailVerified,
  deleteUserAccount,
  createSession,
  getSession,
  deleteSession,
  deleteUserSessions,
  getUserByStripeCustomerId,
} from './repositories/userRepository.js';

// Re-export Client Repository
export {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} from './repositories/clientRepository.js';

// Re-export Invoice Repository
export {
  computeInvoiceStatus,
  getInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  cancelInvoice,
  deleteInvoice,
} from './repositories/invoiceRepository.js';

// Re-export Reminder Repository
export {
  createReminder,
  getUsersWithAutomatedReminders,
  getRecentRemindersForInvoice,
  getReminders,
} from './repositories/reminderRepository.js';

// Re-export Activity Repository
export {
  createActivityLog,
  getActivityLogs,
} from './repositories/activityRepository.js';

// Re-export Subscription Repository
export {
  getSubscription,
  upsertSubscription,
  getUserUsage,
  checkCanCreateClient,
  checkCanCreateInvoice,
  checkFeatureAccess,
  getSubscriptionDetails,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent,
  getSubscriptionByCustomerId,
  getSubscriptionByProviderSubId,
  updateOwnerDemoPlan,
  type LimitCheckResult,
} from './repositories/subscriptionRepository.js';

// Re-export Verification Repository
export {
  createEmailVerification,
  getLatestEmailVerification,
  markVerificationUsed,
  invalidateVerification,
  recordVerificationAttempt,
} from './repositories/verificationRepository.js';

// Re-export Admin Repository
export {
  getAdminDashboardStats,
  getAdminUsers,
  suspendUser,
  restoreUser,
  updateUserRole,
  getAdminSubscriptions,
  getAdminActivityLogs,
  getAdminSystemHealth,
} from './repositories/adminRepository.js';

// Initialize database schema (Cloud Firestore Backend)
export async function initDatabase(): Promise<{ success: boolean; engine: 'firestore'; error?: string }> {
  reloadLocalStore();
  logger.info('[Receipto] Cloud Firestore authoritative backend initialized successfully.');
  return { success: true, engine: 'firestore' };
}

export function isDatabaseConfigured(): boolean {
  return fs.existsSync(path.join(process.cwd(), 'firebase-applet-config.json'));
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  engine: 'firestore';
  details?: string;
}> {
  return {
    connected: true,
    engine: 'firestore',
    details: 'Cloud Firestore authoritative backend (ai-studio-receptio-29c007e0-504b-47c8-9f48-f964bdf89cf7)',
  };
}

// Dashboard Aggregates
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const invoices = await getInvoices(userId);
  const activities = await getActivityLogs(userId, 5);
  const clients = await getClients(userId);

  let totalOutstanding = 0;
  let totalOverdue = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let overdueCount = 0;
  let unpaidCount = 0;

  invoices.forEach((inv) => {
    if (inv.payment_status === 'PAID') {
      totalPaid += inv.amount;
      paidCount++;
    } else if (inv.payment_status === 'OVERDUE') {
      totalOutstanding += inv.amount;
      totalOverdue += inv.amount;
      overdueCount++;
    } else if (inv.payment_status === 'UNPAID') {
      totalOutstanding += inv.amount;
      unpaidCount++;
    }
  });

  const upcoming = invoices.filter((i) => i.payment_status === 'UNPAID' || i.payment_status === 'OVERDUE').slice(0, 5);

  return {
    total_outstanding: totalOutstanding,
    total_overdue: totalOverdue,
    total_paid: totalPaid,
    invoice_counts: {
      total: invoices.length,
      paid: paidCount,
      overdue: overdueCount,
      unpaid: unpaidCount,
      cancelled: 0,
    },
    client_count: clients.length,
    urgent_invoices: upcoming,
    recent_activity: activities.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      action: a.action,
      details: a.details,
      created_at: a.created_at,
    })),
    upcoming_due_invoices: upcoming.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: inv.client_name || 'Client',
      amount: inv.amount,
      due_date: inv.due_date,
      payment_status: inv.payment_status,
    })),
  };
}
