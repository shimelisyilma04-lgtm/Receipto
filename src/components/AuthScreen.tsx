import React, { useState, useEffect } from 'react';
import { Receipt, Lock, Mail, User as UserIcon, Building2, AlertCircle, ArrowRight, ShieldCheck, CheckSquare, Square, ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import type { User } from '../types.js';
import { TermsModal } from './TermsModal.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';

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
  const [error, setError] = useState('');

  useEffect(() => {
    setIsRegister(initialMode === 'register');
  }, [initialMode]);

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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-6 left-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <ReceiptoLogo size="lg" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Receipto</h1>
        <p className="mt-2 text-sm text-slate-400">
          Know who owes you money, what is overdue, and who needs a reminder.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 text-white">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-950 p-1 mb-6 border border-slate-800">
            <button
              id="tab-auth-login"
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                !isRegister ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
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
                isRegister ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="register-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Morgan"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {isRegister && (
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    id="checkbox-terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 w-4 h-4"
                  />
                  <span className="leading-snug">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setIsTermsModalOpen(true)}
                      className="text-indigo-400 hover:text-indigo-300 underline font-medium"
                    >
                      Terms and Conditions
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={() => setIsTermsModalOpen(true)}
                      className="text-indigo-400 hover:text-indigo-300 underline font-medium"
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
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-900/30"
            >
              <span>{loading ? 'Please wait...' : isRegister ? 'Register & Send Code' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Multi-tenant session isolation & cryptographic verification</span>
            </div>
          </div>
        </div>
      </div>

      <TermsModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
    </div>
  );
}
