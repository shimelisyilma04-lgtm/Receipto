import React from 'react';

interface ChangeEmailFormProps {
  newEmailInput: string;
  changeEmailError: string;
  changingEmailLoading: boolean;
  onChangeInput: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function ChangeEmailForm({
  newEmailInput,
  changeEmailError,
  changingEmailLoading,
  onChangeInput,
  onSubmit,
  onCancel,
}: ChangeEmailFormProps) {
  return (
    <form onSubmit={onSubmit} className="mb-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/60 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-200">Update registration email:</span>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
      <input
        id="input-new-email"
        type="email"
        required
        value={newEmailInput}
        onChange={(e) => onChangeInput(e.target.value)}
        placeholder="corrected@company.com"
        className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {changeEmailError && <p className="text-xs text-rose-400">{changeEmailError}</p>}
      <button
        id="btn-submit-change-email"
        type="submit"
        disabled={changingEmailLoading}
        className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition"
      >
        {changingEmailLoading ? 'Updating & Sending Code...' : 'Update Email & Resend Code'}
      </button>
    </form>
  );
}
