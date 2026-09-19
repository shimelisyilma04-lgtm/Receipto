import React, { useState } from 'react';
import {
  Receipt,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  FileText,
  Users,
  BellRing,
  Download,
  Check,
  Sparkles,
  ChevronDown,
  HelpCircle,
  Zap,
  Lock,
} from 'lucide-react';
import { PLAN_CONFIGS, PlanTier, BillingInterval } from '../plans.js';
import type { User } from '../types.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';
import { ThemeToggle } from './ThemeToggle.js';
import { LifeBuoy } from 'lucide-react';

interface LandingPageProps {
  currentUser: User | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onGoToDashboard: () => void;
  onOpenTerms: () => void;
  onOpenSupport?: () => void;
}

export function LandingPage({
  currentUser,
  onOpenAuth,
  onGoToDashboard,
  onOpenTerms,
  onOpenSupport,
}: LandingPageProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [demoTone, setDemoTone] = useState<'friendly' | 'standard' | 'urgent'>('friendly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [selectedAging, setSelectedAging] = useState<'all' | 'current' | 'overdue30' | 'overdue60'>('all');

  const demoInvoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-084',
      client: 'Acme Media Labs',
      amount: '$3,400.00',
      dueDate: 'Today',
      status: 'Due Soon',
      tone: 'friendly' as const,
      aging: 'current',
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV-2026-071',
      client: 'Vanguard Design Group',
      amount: '$1,850.00',
      dueDate: '12 days overdue',
      status: 'Overdue',
      tone: 'standard' as const,
      aging: 'overdue30',
    },
    {
      id: 'inv-3',
      invoiceNumber: 'INV-2026-059',
      client: 'Starlight Retail Inc.',
      amount: '$2,350.00',
      dueDate: '38 days overdue',
      status: 'Critical Overdue',
      tone: 'urgent' as const,
      aging: 'overdue60',
    },
  ];

  const filteredInvoices = demoInvoices.filter((inv) => {
    if (selectedAging === 'all') return true;
    return inv.aging === selectedAging;
  });

  const faqs = [
    {
      q: 'What is Receipto and how does it help my business?',
      a: 'Receipto is an accounts-receivable and automated follow-up platform. It gives you immediate visibility into who owes you money, exactly how many days an invoice is overdue, and dispatches multi-tone payment reminders so you collect your revenue on time without awkward manual emails.',
    },
    {
      q: 'Is Receipto really free to get started?',
      a: 'Yes! Our Free plan includes up to 5 clients and 10 invoices per month with full overdue tracking and manual email reminders. No credit card is required to sign up.',
    },
    {
      q: 'How do the 3-tone payment reminders work?',
      a: 'Receipto provides three calibrated reminder templates: Friendly (a gentle, polite heads-up for due-soon invoices), Standard (a firm, professional notice for past-due balances), and Urgent (an escalated reminder for critically overdue accounts). You can review or customize the message before sending.',
    },
    {
      q: 'How does email verification protect my account?',
      a: 'Every new registration is secured with a cryptographically generated 6-digit one-time code (OTP). This prevents fraudulent account registrations, protects your financial ledgers, and guarantees that only verified business owners can dispatch reminders.',
    },
    {
      q: 'Can I export my data for accounting or tax purposes?',
      a: 'Yes. With our Starter and Growth plans, you can export your complete invoice records, aging analysis, and client payment histories directly to CSV for QuickBooks, Xero, Excel, or your accountant.',
    },
    {
      q: 'Can I upgrade, downgrade, or cancel anytime?',
      a: 'Absolutely. Paid subscriptions are billed transparently via Stripe. You can upgrade or cancel your plan at any time with one click in your billing settings.',
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 mr-4 sm:mr-6">
            <ReceiptoLogo size="md" showWordmark wordmarkClassName="text-xl font-black tracking-tight text-slate-900 dark:text-white" />
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-indigo-600 dark:hover:text-white transition">Features</a>
            <a href="#demo" className="hover:text-indigo-600 dark:hover:text-white transition">Interactive Demo</a>
            <a href="#pricing" className="hover:text-indigo-600 dark:hover:text-white transition">Pricing</a>
            <a href="#faq" className="hover:text-indigo-600 dark:hover:text-white transition">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {onOpenSupport && (
              <button
                type="button"
                id="btn-landing-support"
                onClick={onOpenSupport}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>Support</span>
              </button>
            )}
            <ThemeToggle variant="compact" />
            {currentUser ? (
              <button
                id="btn-nav-dashboard"
                onClick={onGoToDashboard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/25"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  id="btn-nav-login"
                  onClick={() => onOpenAuth('login')}
                  className="px-3.5 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
                >
                  Sign in
                </button>
                <button
                  id="btn-nav-signup"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/25"
                >
                  <span>Start for free</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-500/10 dark:bg-indigo-600/15 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-emerald-500/10 dark:bg-emerald-600/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            <span>Accounts-Receivable &amp; Payment Follow-Up SaaS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.15] mb-6">
            Stop chasing unpaid invoices. <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 dark:from-indigo-400 dark:via-indigo-200 dark:to-emerald-400">
              Get paid on time, every time.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Know who owes you money, what is overdue, and who needs a reminder &mdash; all in one clean, automated accounts-receivable command center.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            {currentUser ? (
              <button
                id="btn-hero-dashboard"
                onClick={onGoToDashboard}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <span>Launch Your Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <>
                <button
                  id="btn-hero-start-free"
                  onClick={() => onOpenAuth('register')}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2"
                >
                  <span>Start for free</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href="#demo"
                  className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-semibold text-base transition border border-slate-200 dark:border-slate-800 text-center shadow-xs"
                >
                  See live demo
                </a>
              </>
            )}
          </div>

          {/* Value props badges */}
          <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>10 free invoices each month</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>Setup in under 2 minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Interactive Product Showcase / Demo Section */}
      <section id="demo" className="py-16 bg-slate-100/70 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-3">
              The Accounts-Receivable Command Center
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
              Explore how Receipto tracks aging balances and prepares the perfect email reminder with one click.
            </p>
          </div>

          {/* Interactive AR Mockup */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl overflow-hidden transition-colors">
            {/* Top Mockup Header Bar */}
            <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider">Live Accounts Receivable</span>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">$18,450.00 Outstanding</div>
                </div>
              </div>

              {/* Metric highlights */}
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Overdue Total</div>
                  <div className="font-bold text-rose-600 dark:text-rose-400 text-sm">$4,200.00</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">On-Time Recovery</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">94.2%</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Average DSO</div>
                  <div className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">24 Days</div>
                </div>
              </div>
            </div>

            {/* Aging Filter Tabs */}
            <div className="p-4 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Aging Filter:</span>
                <button
                  onClick={() => setSelectedAging('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedAging === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Invoices
                </button>
                <button
                  onClick={() => setSelectedAging('current')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedAging === 'current'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Current (0-30d)
                </button>
                <button
                  onClick={() => setSelectedAging('overdue30')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedAging === 'overdue30'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Overdue (31-60d)
                </button>
                <button
                  onClick={() => setSelectedAging('overdue60')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedAging === 'overdue60'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Critical (60d+)
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredInvoices.length} active receivables
              </div>
            </div>

            {/* Split View: Left list of invoices, Right live email preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Invoices List */}
              <div className="lg:col-span-6 p-4 sm:p-6 space-y-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Receivables Queue
                </div>

                {filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{inv.invoiceNumber}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            inv.status === 'Critical Overdue'
                              ? 'bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                              : inv.status === 'Overdue'
                              ? 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                              : 'bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{inv.client}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{inv.dueDate}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{inv.amount}</div>
                      <button
                        onClick={() => setDemoTone(inv.tone)}
                        className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Preview Reminder</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Email Tone Dispatch Preview */}
              <div className="lg:col-span-6 p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-950/40">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Reminder Dispatch Engine
                  </div>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                    <button
                      onClick={() => setDemoTone('friendly')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        demoTone === 'friendly' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Friendly
                    </button>
                    <button
                      onClick={() => setDemoTone('standard')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        demoTone === 'standard' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      onClick={() => setDemoTone('urgent')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        demoTone === 'urgent' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Urgent
                    </button>
                  </div>
                </div>

                {/* Simulated Email Envelope */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-3 shadow-xs">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="text-slate-500 dark:text-slate-400">
                      Subject:{' '}
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {demoTone === 'friendly' && 'Invoice #INV-2026-084 Payment Reminder from Your Business'}
                        {demoTone === 'standard' && 'Payment Reminder: Invoice #INV-2026-071 ($1,850.00)'}
                        {demoTone === 'urgent' && 'URGENT: Overdue Payment Notice - Invoice #INV-2026-059'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <div className="font-semibold text-slate-900 dark:text-white">Dear Finance Team,</div>
                    {demoTone === 'friendly' && (
                      <p>
                        We hope you are having a productive week. This is a friendly reminder that invoice <strong className="text-slate-900 dark:text-white">#INV-2026-084</strong> ($3,400.00) is scheduled for payment today.
                      </p>
                    )}
                    {demoTone === 'standard' && (
                      <p>
                        Please be advised that invoice <strong className="text-slate-900 dark:text-white">#INV-2026-071</strong> ($1,850.00) was due on March 7, 2026 and remains outstanding. Please let us know when payment will be processed.
                      </p>
                    )}
                    {demoTone === 'urgent' && (
                      <p className="text-rose-700 dark:text-rose-200">
                        Our records indicate that invoice <strong className="text-slate-900 dark:text-white">#INV-2026-059</strong> ($2,350.00) is now 38 days overdue. Please process payment immediately to maintain uninterrupted service.
                      </p>
                    )}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500">
                      Sent automatically via Receipto &bull; One-click payment link included
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Features Grid */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
            Everything you need to collect revenue faster
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg">
            Receipto replaces scattered spreadsheets, manual reminder drafting, and forgotten receivables with an automated system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-700/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Automated Overdue Tracking</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Invoices are automatically tagged and categorized into 0-30, 31-60, and 60+ days aging buckets the moment due dates pass.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-700/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">3-Tone Email Engine</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Choose between friendly, standard, or firm urgent notices. Deliver branded reminder emails directly through configured transactional delivery.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-700/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Real-Time AR Analytics</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              At-a-glance visibility of total uncollected funds, days sales outstanding (DSO), and payment velocity across all clients.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-700/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Full Activity &amp; Audit Trail</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every dispatched email, payment logged, and invoice cancellation is permanently recorded with exact timestamps for tax and legal compliance.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-700/60 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Accounting CSV Export</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Download your entire receivables ledger in standard CSV format, fully formatted for QuickBooks, Xero, or your external accountant.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-700/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Bank-Grade Security &amp; OTP</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Complete tenant data isolation, encrypted password hashes, and cryptographically verified 6-digit email authentication.
            </p>
          </div>
        </div>
      </section>

      {/* 5. How It Works Section */}
      <section className="py-20 bg-slate-100/70 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-3">
              How Receipto Works in 3 Simple Steps
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
              Start collecting payments reliably in minutes without complex software installations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-bold text-xl flex items-center justify-center mb-4 border border-indigo-200 dark:border-indigo-700/40">
                1
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Add Clients &amp; Invoices</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Enter your client information and invoice amounts with their respective payment due dates.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-bold text-xl flex items-center justify-center mb-4 border border-indigo-200 dark:border-indigo-700/40">
                2
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Automatic Aging Detection</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Receipto tracks the calendar daily, flagging upcoming due dates and identifying overdue balances automatically.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-bold text-xl flex items-center justify-center mb-4 border border-indigo-200 dark:border-indigo-700/40">
                3
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">One-Click Follow-Ups</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Dispatch personalized reminders with the exact right tone and mark invoices paid when funds clear.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing Section (Directly linked to backend PLAN_CONFIGS) */}
      <section id="pricing" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg mb-8">
            Start free and upgrade when your client roster expands. No hidden fees or surprise invoices.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="inline-flex items-center gap-3 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                billingInterval === 'monthly'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingInterval('annual')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                billingInterval === 'annual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {(['FREE', 'STARTER', 'GROWTH'] as PlanTier[]).map((tier) => {
            const plan = PLAN_CONFIGS[tier];
            const isPopular = tier === 'STARTER';
            const price = billingInterval === 'annual' ? plan.priceAnnual : plan.priceMonthly;
            const periodLabel = billingInterval === 'annual' ? '/year' : '/month';

            return (
              <div
                key={tier}
                className={`flex flex-col justify-between p-8 rounded-2xl transition relative ${
                  isPopular
                    ? 'bg-white dark:bg-slate-900 border-2 border-indigo-500 shadow-xl dark:shadow-2xl dark:shadow-indigo-950/50'
                    : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                      {plan.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 min-h-[36px]">
                    {plan.tagline}
                  </p>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-black text-slate-900 dark:text-white">${price}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{periodLabel}</span>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800/80 mb-8">
                    {plan.featureList.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  {currentUser ? (
                    <button
                      onClick={onGoToDashboard}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition shadow-xs ${
                        isPopular
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                      }`}
                    >
                      Go to Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenAuth('register')}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition shadow-xs ${
                        isPopular
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                      }`}
                    >
                      {tier === 'FREE' ? 'Get Started Free' : `Choose ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. FAQ Accordion Section */}
      <section id="faq" className="py-20 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-3">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Have questions about Receipto? Everything you need to know about our platform and security.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-xs overflow-hidden transition"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-4 ${
                        isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-200 dark:border-slate-800/50">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Bottom CTA Banner */}
      <section className="py-16 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900/80 dark:to-slate-950 border-t border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to take control of your cashflow?
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base max-w-xl mx-auto mb-8">
            Join modern businesses recovering overdue balances faster with Receipto.
          </p>
          <div className="flex justify-center">
            {currentUser ? (
              <button
                onClick={onGoToDashboard}
                className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition shadow-xl shadow-indigo-600/30 inline-flex items-center gap-2"
              >
                <span>Launch Your Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onOpenAuth('register')}
                className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition shadow-xl shadow-indigo-600/30 inline-flex items-center gap-2"
              >
                <span>Create Free Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 9. Professional Footer */}
      <footer className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 py-12 text-slate-600 dark:text-slate-400 text-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <ReceiptoLogo size="xs" showWordmark wordmarkClassName="text-sm font-bold text-slate-900 dark:text-white" />
            <span className="text-slate-400 dark:text-slate-600">&bull;</span>
            <span>Accounts-Receivable Follow-Up SaaS</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            {onOpenSupport && (
              <button
                type="button"
                id="btn-footer-support"
                onClick={onOpenSupport}
                className="hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1.5"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>Support: shimelisyilma04@gmail.com</span>
              </button>
            )}
            <button
              onClick={onOpenTerms}
              className="hover:text-slate-900 dark:hover:text-white transition underline-offset-4 hover:underline"
            >
              Terms of Service &amp; Privacy Policy
            </button>
            <span>&copy; {new Date().getFullYear()} Receipto. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
