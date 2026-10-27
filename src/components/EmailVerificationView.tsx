import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  ShieldCheck,
  RefreshCw,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  LogOut,
  Clock,
} from 'lucide-react';
import { api, ApiError } from '../api.js';
import type { User } from '../types.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';

interface EmailVerificationViewProps {
  user: User;
  initialDeliveryStatus?: 'sent' | 'not_configured' | 'error';
  initialDevOtp?: string;
  initialMessage?: string;
  onVerified: (user: User) => void;
  onLogout: () => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const OTP_LENGTH = 6;
const EXPIRATION_SECONDS = 10 * 60; // 10 minutes
const COOLDOWN_SECONDS = 60; // 60 seconds

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

export function EmailVerificationView({
  user,
  initialDeliveryStatus = 'sent',
  initialDevOtp,
  initialMessage: _initialMessage,
  onVerified,
  onLogout,
  onShowToast,
}: EmailVerificationViewProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [activeEmail, setActiveEmail] = useState(user.email);
  const [deliveryStatus, setDeliveryStatus] = useState<'sent' | 'not_configured' | 'error'>(initialDeliveryStatus);
  const [devOtp, setDevOtp] = useState<string | undefined>(initialDevOtp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Timers
  const [secondsRemaining, setSecondsRemaining] = useState<number>(EXPIRATION_SECONDS);
  const [resendCooldown, setResendCooldown] = useState<number>(COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  // Change Email Modal / State
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [changingEmailLoading, setChangingEmailLoading] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState('');

  // Refs for OTP input elements
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first input on initial render
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Expiration countdown (10 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Resend cooldown countdown (60 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isExpired = secondsRemaining === 0;

  // Format mm:ss
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Handle single digit input
  function handleDigitChange(index: number, value: string) {
    // Only accept numeric digits
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      setDigits(nextDigits);
      return;
    }

    const char = cleaned.slice(-1); // Take latest typed digit
    const nextDigits = [...digits];
    nextDigits[index] = char;
    setDigits(nextDigits);
    setError('');

    // Auto-advance to next input if available
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      // If last box is filled and all are complete, automatically trigger submit
      const fullCode = nextDigits.join('');
      if (fullCode.length === OTP_LENGTH && !nextDigits.includes('')) {
        submitVerification(fullCode);
      }
    }
  }

  // Handle Backspace and Arrow keys
  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous box and clear it
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        setDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
        e.preventDefault();
      } else {
        const nextDigits = [...digits];
        nextDigits[index] = '';
        setDigits(nextDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  // Handle Pasting a 6-digit code
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().replace(/\D/g, '');
    if (pasted.length === 0) return;

    const codeChars = pasted.slice(0, OTP_LENGTH).split('');
    const nextDigits = [...digits];

    for (let i = 0; i < OTP_LENGTH; i++) {
      nextDigits[i] = codeChars[i] || '';
    }
    setDigits(nextDigits);
    setError('');

    // Focus last filled or next empty box
    const nextIndex = Math.min(codeChars.length, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();

    if (codeChars.length === OTP_LENGTH) {
      submitVerification(pasted.slice(0, OTP_LENGTH));
    }
  }

  async function submitVerification(codeToSubmit?: string) {
    const code = codeToSubmit || digits.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    if (isExpired) {
      setError('This verification code has expired. Please click "Resend code" below.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await api.verifyEmail({
        code,
        email: activeEmail,
        user_id: user.id,
      });

      onShowToast('Email verified successfully! Welcome to Receipto.', 'success');
      onVerified(res.user);
    } catch (err: any) {
      const msg = err.message || 'Verification failed. Please check the code.';
      setError(msg);
      if (err instanceof ApiError && err.status === 410) {
        setSecondsRemaining(0);
      }
      // If code was wrong, clear the digits to let user try again smoothly
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || resending) return;

    try {
      setResending(true);
      setError('');
      const res = await api.resendVerificationCode({
        email: activeEmail,
        user_id: user.id,
      });

      if (res.email_delivery) {
        setDeliveryStatus(res.email_delivery);
      } else {
        setDeliveryStatus(res.email_sent ? 'sent' : 'not_configured');
      }

      if (res.dev_preview_otp) {
        setDevOtp(res.dev_preview_otp);
      }

      setSecondsRemaining(EXPIRATION_SECONDS);
      setResendCooldown(res.cooldown_seconds || COOLDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();

      if (res.email_delivery === 'sent' || res.email_sent) {
        onShowToast('Verification email sent', 'success');
      } else if (res.email_delivery === 'error') {
        onShowToast('Unable to send verification email. Please try again.', 'error');
      } else {
        onShowToast('Email provider not configured. Verification code generated.', 'info');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to send verification email. Please try again.');
    } finally {
      setResending(false);
    }
  }

  async function handleChangeEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmailInput.trim() || !newEmailInput.includes('@')) {
      setChangeEmailError('Please enter a valid email address.');
      return;
    }

    try {
      setChangingEmailLoading(true);
      setChangeEmailError('');
      const cleanNew = newEmailInput.trim().toLowerCase();

      const res = await api.changeRegistrationEmail({
        new_email: cleanNew,
        current_email: activeEmail,
        user_id: user.id,
      });

      setActiveEmail(cleanNew);
      setIsChangingEmail(false);
      setNewEmailInput('');
      setSecondsRemaining(EXPIRATION_SECONDS);
      setResendCooldown(COOLDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();

      if (res.email_delivery) {
        setDeliveryStatus(res.email_delivery);
      }
      if (res.dev_preview_otp) {
        setDevOtp(res.dev_preview_otp);
      }

      onShowToast(`Email updated to ${cleanNew}. We dispatched a new code.`, 'success');
    } catch (err: any) {
      setChangeEmailError(err.message || 'Failed to change email address.');
    } finally {
      setChangingEmailLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <div className="flex justify-center mb-4">
          <ReceiptoLogo size="lg" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Verify your email</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter the 6-digit code we sent to <strong className="text-slate-200">{maskEmail(activeEmail)}</strong>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 text-white">
          
          {/* Truthful Delivery Status Banners */}
          {deliveryStatus === 'not_configured' && (
            <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex flex-col gap-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Email verification isn't configured yet.</span>
              </div>
              <p className="text-amber-300/80 text-[13px] leading-relaxed">
                Receipto can't send verification emails in this environment. Configure Resend to enable real email delivery.
              </p>
            </div>
          )}

          {deliveryStatus === 'sent' && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 text-xs flex flex-col gap-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Verification email sent</span>
              </div>
              <p className="text-emerald-300/80 text-[13px]">
                Check your inbox for your 6-digit code.
              </p>
            </div>
          )}

          {deliveryStatus === 'error' && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-200 text-xs flex flex-col gap-2">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Unable to send verification email. Please try again.</span>
              </div>
              <p className="text-rose-300/80 text-[13px]">
                We could not deliver the message to your inbox. Check your address or retry.
              </p>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || resending}
                className="self-start px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded font-medium text-xs transition"
              >
                Try again
              </button>
            </div>
          )}

          {/* Development / Preview Testing Box */}
          {devOtp && (
            <div className="mb-6 p-4 rounded-xl bg-indigo-950/70 border border-indigo-500/80 text-xs flex flex-col gap-2 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-300 tracking-wider flex items-center gap-1.5 uppercase text-[11px]">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  DEVELOPMENT ONLY
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const chars = devOtp.split('');
                    setDigits(chars);
                    setError('');
                    submitVerification(devOtp);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition shadow-sm"
                >
                  Auto-fill &amp; Verify
                </button>
              </div>
              <p className="text-slate-300 text-xs">
                Email delivery is not configured in Preview. For testing purposes only, your generated verification code is:
              </p>
              <div className="font-mono text-xl font-bold tracking-widest text-white text-center py-1.5 bg-slate-950/90 rounded border border-indigo-700/50">
                {devOtp}
              </div>
            </div>
          )}

          {/* Target Email Banner & Change Option */}
          <div className="mb-6 p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">Recipient email</p>
                <p className="text-xs font-semibold text-white truncate" title={activeEmail}>
                  {activeEmail}
                </p>
              </div>
            </div>
            <button
              id="btn-change-email"
              type="button"
              onClick={() => {
                setIsChangingEmail(true);
                setNewEmailInput(activeEmail);
                setChangeEmailError('');
              }}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-950/50 transition shrink-0 ml-2"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Change email</span>
            </button>
          </div>

          {/* Change Email Inline Form */}
          {isChangingEmail && (
            <form
              onSubmit={handleChangeEmailSubmit}
              className="mb-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/60 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-200">Update registration email:</span>
                <button
                  type="button"
                  onClick={() => setIsChangingEmail(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>
              <input
                id="input-new-email"
                type="email"
                required
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="corrected@company.com"
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {changeEmailError && (
                <p className="text-xs text-rose-400">{changeEmailError}</p>
              )}
              <button
                id="btn-submit-change-email"
                type="submit"
                disabled={changingEmailLoading}
                className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition"
              >
                {changingEmailLoading ? 'Updating & Sending Code...' : 'Update Email & Resend Code'}
              </button>
            </form>
          )}

          {/* Countdown & Status */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-medium text-slate-400">Enter 6-digit code:</span>
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className={`w-3.5 h-3.5 ${isExpired ? 'text-rose-400' : 'text-slate-400'}`} />
              <span className={isExpired ? 'text-rose-400 font-semibold' : 'text-slate-300 font-mono'}>
                {isExpired ? 'Expired' : `Expires in ${formatTime(secondsRemaining)}`}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 6 Individual Numeric OTP Inputs with numeric keyboard */}
          <div className="flex justify-between gap-2 mb-6">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                id={`otp-digit-${idx}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={loading}
                className={`w-11 h-14 sm:w-13 sm:h-14 text-center text-2xl font-bold font-mono bg-slate-950 border rounded-xl text-white transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  digit
                    ? 'border-indigo-500 bg-indigo-950/40'
                    : 'border-slate-800 hover:border-slate-700'
                } ${isExpired ? 'opacity-50 border-rose-800/80' : ''}`}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          {/* Submit Button */}
          <button
            id="btn-verify-otp"
            type="button"
            onClick={() => submitVerification()}
            disabled={loading || digits.join('').length !== OTP_LENGTH || isExpired}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-600/30"
          >
            <span>{loading ? 'Verifying Code...' : 'Verify & Continue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Resend Code Section with Exact Requested Countdown */}
          <div className="mt-6 flex flex-col items-center justify-center space-y-2 text-xs">
            <div className="text-slate-400">
              Didn't receive the email? Check your spam folder or
            </div>
            <button
              id="btn-resend-otp"
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || resending}
              className={`inline-flex items-center gap-1.5 font-semibold transition ${
                resendCooldown > 0 || resending
                  ? 'text-slate-500 cursor-not-allowed'
                  : 'text-indigo-400 hover:text-indigo-300 underline'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              <span>
                {resending
                  ? 'Sending new code...'
                  : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
              </span>
            </button>
          </div>

          {/* Switch Account / Logout */}
          <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>256-bit encrypted challenge</span>
            </div>
            <button
              id="btn-verification-logout"
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-400 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
