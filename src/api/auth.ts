import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateFirebaseProfile,
  onAuthStateChanged,
  type FirebaseUser,
} from '../firebase.js';
import {
  setFirestoreUserProfile,
  updateFirestoreUserProfile,
} from '../services/firestoreService.js';
import { ApiError, request, resolveUserProfile, setStoredToken } from './client.js';

export const authApi = {
  getMe: async () => {
    let currentUser: FirebaseUser | null = auth.currentUser;
    if (!currentUser) {
      currentUser = await new Promise<FirebaseUser | null>((resolve) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          resolve(null);
        }, 2000);
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve(user);
        });
      });
    }

    if (!currentUser) {
      throw new ApiError('Unauthorized. Please log in.', 401);
    }

    const user = await resolveUserProfile(currentUser);
    const token = await currentUser.getIdToken();
    setStoredToken(token);

    return {
      user,
      requires_verification: !currentUser.emailVerified,
      email_delivery: 'sent' as const,
      message: currentUser.emailVerified ? undefined : 'Please check your inbox to verify your email address.',
      dev_preview_otp: undefined as string | undefined,
    };
  },

  login: async (credentials: { email: string; password: string }) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, credentials.email.trim(), credentials.password);
      const user = await resolveUserProfile(cred.user);
      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: !cred.user.emailVerified,
        email_delivery: 'sent' as const,
        email_sent: true,
        message: cred.user.emailVerified ? undefined : 'Please check your inbox to verify your email address.',
        dev_preview_otp: undefined as string | undefined,
      };
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        throw new ApiError('Invalid email or password.', 401);
      }
      if (err.code === 'auth/too-many-requests') {
        throw new ApiError('Too many unsuccessful login attempts. Please try again later.', 429);
      }
      throw new ApiError(err.message || 'Authentication failed.', 400);
    }
  },

  register: async (data: {
    email: string;
    password: string;
    confirm_password?: string;
    name: string;
    business_name?: string;
    terms_accepted: boolean;
  }) => {
    try {
      const cleanEmail = data.email.trim().toLowerCase();
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, data.password);

      if (data.name) {
        await updateFirebaseProfile(cred.user, { displayName: data.name });
      }

      try {
        await sendEmailVerification(cred.user);
      } catch (e) {
        console.warn('sendEmailVerification non-blocking notice:', e);
      }

      const user = await setFirestoreUserProfile(cred.user.uid, {
        id: cred.user.uid,
        email: cleanEmail,
        name: data.name.trim(),
        business_name: data.business_name?.trim() || '',
        email_verified: false,
        role: 'USER',
        status: 'ACTIVE',
        terms_accepted_at: new Date().toISOString(),
        terms_version: '1.0',
      });

      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: true,
        email_delivery: 'sent' as const,
        email_sent: true,
        message: 'A verification link has been sent to your email. Please check your inbox and spam folder.',
        dev_preview_otp: undefined as string | undefined,
      };
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        throw new ApiError('An account with this email address already exists.', 409);
      }
      if (err.code === 'auth/weak-password') {
        throw new ApiError('Password should be at least 8 characters.', 400);
      }
      throw new ApiError(err.message || 'Registration failed.', 400);
    }
  },

  loginWithGoogle: async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = await resolveUserProfile(cred.user);
      const token = await cred.user.getIdToken();
      setStoredToken(token);

      return {
        user,
        token,
        requires_verification: !cred.user.emailVerified,
      };
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        throw new ApiError(
          'Google Sign-In is not yet enabled in Firebase Console. Please enable Google under Authentication > Sign-in method.',
          400
        );
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new ApiError(
          'This domain is not yet added to Authorized Domains in Firebase Console (Authentication > Settings > Authorized domains).',
          400
        );
      }
      if (err.code === 'auth/popup-closed-by-user') {
        throw new ApiError('Sign-in popup was closed before completing authentication.', 400);
      }
      throw new ApiError(err.message || 'Google authentication failed.', 400);
    }
  },

  sendPasswordReset: async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true, message: 'Password reset link sent to your email address.' };
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        return { success: true, message: 'If an account exists, a password reset link has been dispatched.' };
      }
      throw new ApiError(err.message || 'Failed to dispatch password reset email.', 400);
    }
  },

  verifyEmail: async (data: { code: string; email?: string; user_id?: string }) => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        const user = await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
        return {
          success: true,
          message: 'Email verified successfully.',
          user,
        };
      }
    }

    try {
      const res = await request<{ success: boolean; message: string; user: any; token?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (auth.currentUser) {
        await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
      }
      return res;
    } catch {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          const user = await updateFirestoreUserProfile(auth.currentUser.uid, { email_verified: true });
          return { success: true, message: 'Email verified successfully.', user };
        }
      }
      throw new ApiError('Verification pending. Please click the link sent to your email, or check spam folder.', 400);
    }
  },

  resendVerificationCode: async (data: { email?: string; user_id?: string }) => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        return {
          success: true,
          message: 'Verification email sent. Please check your inbox and spam folder.',
          email_delivery: 'sent' as const,
          email_sent: true,
          cooldown_seconds: 60,
        };
      } catch (err: any) {
        if (err.code === 'auth/too-many-requests') {
          return {
            success: false,
            message: 'Too many requests. Please wait a minute before requesting another email.',
            email_delivery: 'error' as const,
            cooldown_seconds: 60,
          };
        }
      }
    }

    return request<{
      success: boolean;
      message: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
      cooldown_seconds?: number;
    }>('/api/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  changeRegistrationEmail: async (data: { new_email: string; current_email?: string; user_id?: string }) => {
    return request<{
      success: boolean;
      message: string;
      email: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
    }>('/api/auth/change-registration-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAccount: async () => {
    const user = auth.currentUser;
    if (user) {
      await user.delete();
    }
    setStoredToken(null);
    return { success: true, message: 'Account deleted successfully.' };
  },

  logout: async () => {
    try {
      await signOut(auth);
      await request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      }).catch(() => {});
    } finally {
      setStoredToken(null);
    }
  },

  updatePassword: async (data: { current_password: string; new_password: string }) => {
    return request<{ message: string }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProfile: async (profile: { name?: string; business_name?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const updatedUser = await updateFirestoreUserProfile(user.uid, profile);
    return { message: 'Profile updated successfully.', user: updatedUser };
  },
};
