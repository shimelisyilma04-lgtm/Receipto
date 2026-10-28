// Core HTTP Client and Token Handling for Receipto Frontend
import { auth, type FirebaseUser } from '../firebase.js';
import {
  getFirestoreUserProfile,
  setFirestoreUserProfile,
  updateFirestoreUserProfile,
} from '../services/firestoreService.js';
import type { User } from '../types.js';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'receipto_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token?: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues in sandboxed iframes
  }
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = options.retries ?? (method === 'GET' ? 1 : 0);
  const timeoutMs = options.timeout ?? 45000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    // Attach Firebase ID token if available
    let token = getStoredToken();
    try {
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
        setStoredToken(token);
      }
    } catch {
      // Continue with stored token
    }

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (!response.ok) {
        if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
          setStoredToken(null);
        }
        const errorMsg =
          data?.error || data?.message || (typeof data === 'string' && data ? data : `Request failed with status ${response.status}`);
        throw new ApiError(errorMsg, response.status);
      }

      if (data && typeof data.token === 'string') {
        setStoredToken(data.token);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      const isRetryable = attempt < maxRetries && (isAbort || err instanceof TypeError);

      if (isRetryable) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (isAbort) {
        throw new ApiError('Request timed out. Please try again.', 408);
      }
      throw err;
    }
  }

  throw new ApiError('Request failed after retries.', 500);
}

export async function resolveUserProfile(firebaseUser: FirebaseUser): Promise<User> {
  let profile: User | null = null;
  try {
    profile = await getFirestoreUserProfile(firebaseUser.uid);
  } catch (err) {
    console.warn('Could not retrieve user profile from Firestore, creating initial profile:', err);
  }

  if (profile) {
    if (firebaseUser.emailVerified && !profile.email_verified) {
      profile.email_verified = true;
      try {
        await updateFirestoreUserProfile(firebaseUser.uid, { email_verified: true });
      } catch (err) {
        console.warn('Could not sync email verification state:', err);
      }
    }
    return profile;
  }

  const newProfile = await setFirestoreUserProfile(firebaseUser.uid, {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    email_verified: firebaseUser.emailVerified,
    role: 'USER',
    status: 'ACTIVE',
    terms_accepted_at: new Date().toISOString(),
    terms_version: '1.0',
  });
  return newProfile;
}
