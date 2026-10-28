// Centralized API facade for Receipto (modularized domain structure)
export {
  ApiError,
  getStoredToken,
  setStoredToken,
  request,
  type RequestOptions,
  resolveUserProfile,
} from './api/client.js';

import { authApi } from './api/auth.js';
import { clientsApi } from './api/clients.js';
import { invoicesApi } from './api/invoices.js';
import { remindersApi } from './api/reminders.js';
import { billingApi } from './api/billing.js';
import { adminApi } from './api/admin.js';

export { authApi } from './api/auth.js';
export { clientsApi } from './api/clients.js';
export { invoicesApi } from './api/invoices.js';
export { remindersApi } from './api/reminders.js';
export { billingApi } from './api/billing.js';
export { adminApi } from './api/admin.js';

export const api = {
  ...authApi,
  ...clientsApi,
  ...invoicesApi,
  ...remindersApi,
  ...billingApi,
  ...adminApi,
};

export default api;
