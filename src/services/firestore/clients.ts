import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  handleFirestoreError,
  OperationType,
} from '../../firebase.js';
import type { Client } from '../../types.js';
import { sanitizeForFirestore } from './utils.js';
import { logFirestoreActivity } from './reminders.js';

export async function getFirestoreClients(uid: string): Promise<Client[]> {
  const path = `users/${uid}/clients`;
  try {
    const clientsRef = collection(db, 'users', uid, 'clients');
    const snap = await getDocs(clientsRef);
    const clients: Client[] = [];
    snap.forEach((d) => {
      clients.push(d.data() as Client);
    });
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getFirestoreClient(uid: string, clientId: string): Promise<Client | null> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'clients', clientId));
    if (!snap.exists()) return null;
    return snap.data() as Client;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createFirestoreClient(
  uid: string,
  data: { name: string; email: string; phone?: string; company?: string; address?: string }
): Promise<Client> {
  const clientId = crypto.randomUUID();
  const path = `users/${uid}/clients/${clientId}`;
  const now = new Date().toISOString();

  const newClient: Client = {
    id: clientId,
    user_id: uid,
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone?.trim() || '',
    company: data.company?.trim() || '',
    address: data.address?.trim() || '',
    created_at: now,
    updated_at: now,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'clients', clientId), sanitizeForFirestore(newClient));
    await logFirestoreActivity(uid, 'CREATE_CLIENT', `Created client ${newClient.name}`);
    return newClient;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreClient(
  uid: string,
  clientId: string,
  data: Partial<{ name: string; email: string; phone?: string; company?: string; address?: string }>
): Promise<Client> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const ref = doc(db, 'users', uid, 'clients', clientId);
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = { updated_at: now };

    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.email !== undefined) updatePayload.email = data.email.trim().toLowerCase();
    if (data.phone !== undefined) updatePayload.phone = data.phone.trim();
    if (data.company !== undefined) updatePayload.company = data.company.trim();
    if (data.address !== undefined) updatePayload.address = data.address.trim();

    await updateDoc(ref, sanitizeForFirestore(updatePayload));
    const snap = await getDoc(ref);
    const updated = snap.data() as Client;
    await logFirestoreActivity(uid, 'UPDATE_CLIENT', `Updated details for client ${updated.name}`);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreClient(uid: string, clientId: string): Promise<void> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const ref = doc(db, 'users', uid, 'clients', clientId);
    const snap = await getDoc(ref);
    const clientName = snap.exists() ? snap.data().name : clientId;

    await deleteDoc(ref);
    await logFirestoreActivity(uid, 'DELETE_CLIENT', `Removed client ${clientName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
