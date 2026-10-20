import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  User as UserIcon,
  Building2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ArrowLeft,
  KeyRound,
} from 'lucide-react';
import { api } from '../api.js';
import type { User } from '../types.js';
import { TermsModal } from './TermsModal.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';
import { ThemeToggle } from './ThemeToggle.js';

interface AuthScreenProps {
  initialMode?: 'login' | 'register';
  onClose?: () => void;
  onSuccess: (user: User) => void;
  onRequiresVerification: (
    user: User,
    deliveryStatus?: 'sent' | 'not_configured' | 'error',
    devOtp?: string,
    message?: string
  ) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function AuthScreen({
  initialMode = 'login',
  onClose,
  onSuccess,
  onRequiresVerification,
  onShowToast,
}: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    setIsRegister(initialMode === 'register');
  }, [initialMode]);

  async function handleGoogleSignIn() {
    setError('');
    try {
      setGoogleLoading(true);
      const res = await api.loginWithGoogle();
      if (res.requires_verification && !res.user.email_verified) {
        onRequiresVerification(res.user, 'sent', undefined, 'Please verify your email address.');
      } else {
        onShowToast('Signed in with Google successfully.', 'success');
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address to receive a password reset link.');
      return;
    }
    try {
      setLoading(true);
      await api.sendPasswordReset(cleanEmail);
      setResetSent(true);
      onShowToast('Password reset link sent to your email.', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);

      if (isRegister) {
        if (!name.trim()) {
          setError('Full name is required.');
          setLoading(false);
          return;
        }

        if (password.length < 8) {
          setError('Password must be at least 8 characters long.');
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError('Passwords do not match. Please verify your password confirmation.');
          setLoading(false);
          return;
        }

        if (!termsAccepted) {
          setError('You must agree to the Terms and Conditions and Privacy Policy to create an account.');
          setLoading(false);
          return;
        }

        const res = await api.register({
          email: cleanEmail,
          password,
          confirm_password: confirmPassword,
          name: name.trim(),
          business_name: businessName.trim() || undefined,
          terms_accepted: true,
        });

        if (res.requires_verification || !res.user.email_verified) {
          onRequiresVerification(res.user, res.email_delivery, res.dev_preview_otp, res.message);
        } else {
          onShowToast('Account created successfully.', 'success');
          onSuccess(res.user);
        }
      } else {
        const res = await api.login({
          email: cleanEmail,
          password,
        });

        if (res.requires_verification || !res.user.email_verified) {
          onRequiresVerification(res.user, res.email_delivery, res.dev_preview_otp, res.message);
        } else {
          onShowToast('Logged in successfully.', 'success');
          onSuccess(res.user);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors duration-200">
      {/* Top Header Controls: Back to Home + Sun/Moon Theme Switcher */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          {onClose && (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <ThemeToggle variant="compact" />
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mt-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <ReceiptoLogo size="lg" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Receipto</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Know who owes you money, what is overdue, and who needs a reminder.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-8 px-6 shadow-xl dark:shadow-2xl rounded-2xl sm:px-10 text-slate-900 dark:text-white transition-colors">
          {/* Appearance Switcher (Sun & Moon) inside Sign In / Sign Up Section */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800/80">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Appearance
            </span>
            <ThemeToggle variant="segmented" />
          </div>

          {/* Mode Switcher */}
          {!isResetMode && (
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-950 p-1 mb-6 border border-slate-200 dark:border-slate-800">
              <button
                id="tab-auth-login"
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                  !isRegister
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                id="tab-auth-register"
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                  isRegister
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Reset Password Form */}
          {isResetMode ? (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Reset Password</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Enter your email address to receive a secure Firebase password reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs text-center space-y-3">
                  <p>A password reset link has been dispatched to <strong>{email}</strong>.</p>
                  <p className="text-slate-600 dark:text-slate-400">Please check your inbox and spam folder, then return to sign in.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setResetSent(false);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold transition"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50"
                  >
                    {loading ? 'Sending link...' : 'Send Password Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsResetMode(false)}
                    className="w-full py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
                  >
                    Cancel and return to Sign In
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full mb-4 flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 text-sm font-semibold transition shadow-xs border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{googleLoading ? 'Signing in...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center my-4">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="px-3 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Or with email</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          id="register-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Alex Morgan"
                          className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Business / Organization Name (Optional)
                      </label>
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          id="register-business"
                          type="text"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="Morgan Consulting LLC"
                          className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Password *</label>
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(true);
                          setError('');
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm Password *</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        id="register-confirm-password"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat your password"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {isRegister && (
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-300 select-none">
                      <input
                        id="checkbox-terms"
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-900 w-4 h-4"
                      />
                      <span className="leading-snug">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => setIsTermsModalOpen(true)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          Terms and Conditions
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => setIsTermsModalOpen(true)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          Privacy Policy
                        </button>
                        .
                      </span>
                    </label>
                  </div>
                )}

                <button
                  id="btn-auth-submit"
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-600/25"
                >
                  <span>{loading ? 'Please wait...' : isRegister ? 'Register Account' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Firebase Authentication &amp; Zero-Trust Firestore Security</span>
            </div>
          </div>
        </div>
      </div>

      <TermsModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
    </div>
  );
}
