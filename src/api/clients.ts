import { auth } from '../firebase.js';
import {
  getFirestoreClients,
  getFirestoreClient,
  createFirestoreClient,
  updateFirestoreClient,
  deleteFirestoreClient,
  getFirestoreSubscription,
} from '../services/firestoreService.js';
import { ApiError } from './client.js';

export const clientsApi = {
  getClients: async () => {
    const user = auth.currentUser;
    if (!user) return { clients: [] };
    const clients = await getFirestoreClients(user.uid);
    return { clients };
  },

  getClient: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const client = await getFirestoreClient(user.uid, id);
    if (!client) throw new ApiError('Client not found', 404);
    return { client };
  },

  createClient: async (clientData: { name: string; email: string; phone?: string; company?: string; address?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    const sub = await getFirestoreSubscription(user.uid);
    if (sub.usage.client_limit_reached) {
      throw new ApiError(
        `Client limit reached for your ${sub.usage.plan} tier (${sub.usage.max_clients} clients). Please upgrade to add more clients.`,
        403
      );
    }

    const client = await createFirestoreClient(user.uid, clientData);
    return { client };
  },

  updateClient: async (id: string, clientData: Partial<{ name: string; email: string; phone?: string; company?: string; address?: string }>) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const client = await updateFirestoreClient(user.uid, id, clientData);
    return { client };
  },

  deleteClient: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await deleteFirestoreClient(user.uid, id);
    return { message: 'Client deleted successfully.' };
  },
};
