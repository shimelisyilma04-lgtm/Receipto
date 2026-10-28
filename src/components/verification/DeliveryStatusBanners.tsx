import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface DeliveryStatusBannersProps {
  deliveryStatus: 'sent' | 'not_configured' | 'error';
  devOtp?: string;
  resendCooldown: number;
  resending: boolean;
  onResendCode: () => void;
  onAutoFillDevOtp: (otp: string) => void;
}

export function DeliveryStatusBanners({
  deliveryStatus,
  devOtp,
  resendCooldown,
  resending,
  onResendCode,
  onAutoFillDevOtp,
}: DeliveryStatusBannersProps) {
  return (
    <>
      {/* Truthful Delivery Status Banners */}
      {deliveryStatus === 'not_configured' && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex flex-col gap-1.5">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Email verification isn&apos;t configured yet.</span>
          </div>
          <p className="text-amber-300/80 text-[13px] leading-relaxed">
            Receipto can&apos;t send verification emails in this environment. Configure Resend to enable real email delivery.
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
            onClick={onResendCode}
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
              onClick={() => onAutoFillDevOtp(devOtp)}
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
    </>
  );
}
