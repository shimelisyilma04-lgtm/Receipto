// Centralized Firestore Service Facade for Receipto
// Provides complete backward compatibility while breaking logic into modular domains

export {
  computeInvoiceStatus,
  sanitizeForFirestore,
} from './firestore/utils.js';

export {
  getFirestoreUserProfile,
  setFirestoreUserProfile,
  updateFirestoreUserProfile,
} from './firestore/users.js';

export {
  getFirestoreClients,
  getFirestoreClient,
  createFirestoreClient,
  updateFirestoreClient,
  deleteFirestoreClient,
} from './firestore/clients.js';

export {
  getFirestoreInvoices,
  getFirestoreInvoice,
  createFirestoreInvoice,
  updateFirestoreInvoice,
  markFirestoreInvoicePaid,
  cancelFirestoreInvoice,
  deleteFirestoreInvoice,
} from './firestore/invoices.js';

export {
  logFirestoreActivity,
  getFirestoreActivityLogs,
  getFirestoreReminders,
  createFirestoreReminder,
} from './firestore/reminders.js';

export {
  getFirestoreSubscription,
  setFirestoreSubscription,
  getFirestoreDashboardStats,
} from './firestore/subscriptions.js';
