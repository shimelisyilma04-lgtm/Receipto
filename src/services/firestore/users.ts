import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  handleFirestoreError,
  OperationType,
} from '../../firebase.js';
import type { User } from '../../types.js';
import { sanitizeForFirestore } from './utils.js';

export async function getFirestoreUserProfile(uid: string): Promise<User | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as User;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function setFirestoreUserProfile(uid: string, profile: Partial<User>): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    let existingDoc: any = null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        existingDoc = snap.data();
      }
    } catch {
      // Document might not exist yet or connection is resolving
    }
    const now = new Date().toISOString();

    const userData: any = {
      id: uid,
      email: profile.email || '',
      name: profile.name || 'User',
      business_name: profile.business_name || '',
      email_verified: Boolean(profile.email_verified),
      role: profile.role || 'USER',
      status: profile.status || 'ACTIVE',
      terms_accepted_at: profile.terms_accepted_at || now,
      terms_version: profile.terms_version || '1.0',
      last_login_at: now,
      created_at: existingDoc?.created_at || now,
      updated_at: now,
    };

    if (profile.stripe_customer_id !== undefined && profile.stripe_customer_id !== null) {
      userData.stripe_customer_id = profile.stripe_customer_id;
    } else if (existingDoc?.stripe_customer_id) {
      userData.stripe_customer_id = existingDoc.stripe_customer_id;
    }

    const sanitizedData = sanitizeForFirestore(userData);
    await setDoc(ref, sanitizedData, { merge: true });
    return userData as User;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateFirestoreUserProfile(
  uid: string,
  updates: Partial<Pick<User, 'name' | 'business_name' | 'email_verified' | 'last_login_at' | 'terms_accepted_at' | 'terms_version'>>
): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const now = new Date().toISOString();
    const dataToUpdate: Record<string, any> = {
      updated_at: now,
    };
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        dataToUpdate[k] = v;
      }
    }
    await updateDoc(ref, sanitizeForFirestore(dataToUpdate));
    const updatedSnap = await getDoc(ref);
    return updatedSnap.data() as User;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}
