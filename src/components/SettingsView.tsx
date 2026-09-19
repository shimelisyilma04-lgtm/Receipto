import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Database,
  Mail,
  CheckCircle,
  AlertCircle,
  KeyRound,
  Building2,
  Server,
  Info,
} from 'lucide-react';
import type { User, SystemConfig } from '../types.js';
import { api } from '../api.js';

interface SettingsViewProps {
  user: User;
  onUpdateUser: (user: User) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function SettingsView({ user, onUpdateUser, onShowToast }: SettingsViewProps) {
  // Profile state
  const [name, setName] = useState(user.name);
  const [businessName, setBusinessName] = useState(user.business_name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // System status
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const res = await api.getConfig();
      setSystemConfig(res);
    } catch (err) {
      console.error('Failed to load system config', err);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const res = await api.updateProfile({ name, business_name: businessName });
      onUpdateUser(res.user);
      onShowToast('Profile settings saved successfully.', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onShowToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      onShowToast('New password must be at least 8 characters long.', 'error');
      return;
    }

    try {
      setChangingPassword(true);
      await api.updatePassword({ current_password: currentPassword, new_password: newPassword });
      onShowToast('Password updated securely.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to change password.', 'error');
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings & Diagnostics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your organization profile, security credentials, and review deployment infrastructure status.
        </p>
      </div>

      {/* Profile Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-6">
          <Building2 className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Organization & Branding</h2>
            <p className="text-xs text-slate-500">This business name appears on all customer invoices and reminder headers.</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Account Email (Read-Only)
            </label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Owner / Contact Name *
            </label>
            <input
              id="input-settings-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Business / Trading Name
            </label>
            <input
              id="input-settings-business"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Apex Digital Consulting LLC"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            id="btn-save-profile"
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50 shadow-xs"
          >
            {savingProfile ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>

      {/* Security / Password Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-6">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Security & Credentials</h2>
            <p className="text-xs text-slate-500">Update your access password with bcrypt salt protection.</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Current Password
            </label>
            <input
              id="input-current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                New Password
              </label>
              <input
                id="input-new-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Confirm New Password
              </label>
              <input
                id="input-confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            id="btn-update-password"
            type="submit"
            disabled={changingPassword}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition disabled:opacity-50 shadow-xs"
          >
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Infrastructure & Services Diagnostic */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-6">
          <Server className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Infrastructure & Runtime Diagnostics</h2>
            <p className="text-xs text-slate-500">Live operational status of backing database and dispatch providers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Database Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Storage Engine</span>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                <CheckCircle className="w-3 h-3" /> ACTIVE
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {systemConfig?.database.engine === 'postgres' ? 'PostgreSQL (Cloud Database)' : 'Local File Persistence Engine'}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {systemConfig?.database.engine === 'postgres'
                ? 'Connected to configured PostgreSQL instance via DATABASE_URL.'
                : 'Safely persisting state to Receipto atomic storage (/data/receipto_db.json). Full relational queries, multi-user isolation, and zero native build dependencies.'}
            </p>
          </div>

          {/* Email Provider Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Email Delivery</span>
              </div>
              <span
                className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                  systemConfig?.email_service.configured
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {systemConfig?.email_service.configured ? 'LIVE' : 'UNCONFIGURED'}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">Resend API Provider</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {systemConfig?.email_service.configured
                ? `Ready to deliver messages via Resend (Sender: ${systemConfig.email_service.from_email}).`
                : 'Set RESEND_API_KEY in environment variables to enable live SMTP/API delivery. Currently using simulated preview and audit logging.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
