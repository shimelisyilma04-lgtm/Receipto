import React, { useState, useEffect } from 'react';
import { ArrowLeft, Shield, FileText, RefreshCw, Mail, CheckCircle, ExternalLink } from 'lucide-react';
import { ReceiptoLogo } from './ReceiptoLogo.js';

export type LegalTab = 'terms' | 'privacy' | 'refund';

interface LegalPagesProps {
  initialTab?: LegalTab;
  onBackToHome: () => void;
}

export function LegalPages({ initialTab = 'terms', onBackToHome }: LegalPagesProps) {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const setTabAndUrl = (tab: LegalTab) => {
    setActiveTab(tab);
    const path = tab === 'terms' ? '/terms' : tab === 'privacy' ? '/privacy' : '/refund-policy';
    window.history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToHome}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Return to Receipto Homepage"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
            <div className="h-5 w-px bg-slate-800 hidden sm:block" />
            <ReceiptoLogo size="sm" showWordmark wordmarkClassName="text-base font-bold text-white" />
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setTabAndUrl('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'terms'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setTabAndUrl('privacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'privacy'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setTabAndUrl('refund')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'refund'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Refund &amp; Cancellation
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Banner */}
        <div className="mb-10 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Shield className="w-4 h-4" />
            <span>Legal &amp; Compliance Center</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {activeTab === 'terms' && 'Terms of Service'}
            {activeTab === 'privacy' && 'Privacy Policy'}
            {activeTab === 'refund' && 'Refund & Cancellation Policy'}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Last modified: September 2026 &bull; Effective for all Receipto users and customers globally
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700 text-xs text-slate-300">
            <span>Billing Provider:</span>
            <span className="font-semibold text-white">Paddle.com Market Ltd (Merchant of Record)</span>
          </div>
        </div>

        {/* 1. TERMS OF SERVICE */}
        {activeTab === 'terms' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. Agreement to Terms</h2>
              <p>
                By accessing, browsing, registering for, or using Receipto (&ldquo;Receipto&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;),
                located at this domain, you enter into a legally binding agreement and agree to comply with and be bound by
                these Terms of Service (&ldquo;Terms&rdquo;) and our Privacy Policy. If you do not agree with these Terms, you must immediately
                discontinue using the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. Product Description &amp; Permitted Use</h2>
              <p>
                Receipto is a software-as-a-service (SaaS) platform designed for freelancers, consultants, and businesses to track accounts
                receivable, record invoice statuses, monitor payment aging, and dispatch polite, automated email payment reminders to client contacts.
              </p>
              <p>
                You agree to use Receipto only for lawful business purposes. You explicitly agree not to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>Send fraudulent, misleading, or deceptive payment demands or invoices.</li>
                <li>Impersonate financial institutions, tax authorities, or third-party organizations.</li>
                <li>Transmit spam, unsolicited mass emails, or communications violating CAN-SPAM, GDPR, or applicable electronic communications laws.</li>
                <li>Circumvent or attempt to reverse-engineer security controls, subscription gates, or quota rate limits.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. Merchant of Record &amp; Payment Processing</h2>
              <p>
                Our order process and paid subscription billing are conducted by our online Merchant of Record, <strong>Paddle.com Market Ltd</strong> (&ldquo;Paddle&rdquo;).
                Paddle acts as the Merchant of Record for all orders placed through Receipto. Paddle handles all customer service inquiries, tax calculation, collection,
                and invoice generation related to order processing.
              </p>
              <p>
                When you purchase a paid plan (Starter or Growth), you agree to Paddle&rsquo;s terms and billing agreements in addition to these Terms.
                Your payment card details are transmitted directly to Paddle and are never stored on Receipto servers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. Subscriptions, Automatic Renewals &amp; Upgrades</h2>
              <p>
                Paid subscriptions are billed on a recurring basis (either monthly or annually, as selected at checkout). Your subscription will
                automatically renew at the conclusion of each billing cycle unless you cancel it before the renewal date through your in-app Billing dashboard.
              </p>
              <p>
                When you upgrade from Starter to Growth, or switch between billing intervals, prorated adjustments are calculated and processed
                transparently via Paddle.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">5. Intellectual Property &amp; User Data Ownership</h2>
              <p>
                You retain full ownership, title, and intellectual property rights in all data, invoices, client contacts, and notes you import or create
                in Receipto. We claim no intellectual property rights over your proprietary business records. You grant Receipto a limited license to host,
                process, and display your data strictly to provide the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">6. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Receipto and its operators shall not be liable for any indirect, incidental, consequential,
                punitive, or special damages, including lost profits, business interruption, or loss of client revenue arising from payment disputes
                between you and your clients.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">7. Contact &amp; Support</h2>
              <p>
                If you have questions regarding these Terms of Service, please contact our support team at:
              </p>
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-3">
                <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Receipto Customer Support</div>
                  <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 hover:underline">
                    receiptobusiness@gmail.com
                  </a>
                </div>
              </div>
            </section>
          </article>
        )}

        {/* 2. PRIVACY POLICY */}
        {activeTab === 'privacy' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. Overview &amp; Commitment</h2>
              <p>
                At Receipto, your privacy and the confidentiality of your financial records are fundamental. This Privacy Policy details how we collect,
                use, process, and protect your personal information and invoicing data when you visit our website or use our application.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. Information We Collect</h2>
              <ul className="list-disc pl-5 space-y-2 text-slate-400">
                <li>
                  <strong className="text-slate-200">Account Information:</strong> Full name, email address, password hash (salted using argon2id/bcrypt),
                  and optional business name provided during registration.
                </li>
                <li>
                  <strong className="text-slate-200">Invoicing &amp; Client Data:</strong> Client contact details (name, email, phone, business name),
                  invoice amounts, due dates, issue dates, and custom notes created by you.
                </li>
                <li>
                  <strong className="text-slate-200">Billing Information:</strong> We do not collect or store full credit card numbers. Paddle.com
                  processes payments securely as our Merchant of Record and provides us with customer identifiers, subscription status, and billing cycle metadata.
                </li>
                <li>
                  <strong className="text-slate-200">Log &amp; Usage Data:</strong> Timestamps of logins, reminder dispatches, status changes, and device
                  security headers strictly used for audit trails and abuse prevention.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. How We Use Your Data</h2>
              <p>We process your data strictly for legitimate operational purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>Authenticating your session and verifying account ownership via one-time verification codes.</li>
                <li>Delivering payment reminders to designated client recipients on your behalf.</li>
                <li>Enforcing subscription tier limits and providing audit log history.</li>
                <li>Preventing fraud, phishing, and unauthorized access.</li>
              </ul>
              <p className="text-emerald-400 font-medium">
                We do not sell, rent, or monetize your personal or financial data to advertisers or third-party data brokers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. Data Security &amp; Encryption</h2>
              <p>
                Sensitive records are stored in Google Cloud Firestore with strict zero-trust security rules, cryptographic password hashing,
                and hardened API authentication tokens.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">5. Your Privacy Rights (GDPR &amp; CCPA)</h2>
              <p>
                Depending on your location, you have rights to access, correct, export, or delete your personal data. You can export your full
                invoice records anytime via the CSV Export tool or submit an account deletion request by contacting our support team.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">6. Contact Data Protection Officer</h2>
              <p>
                For privacy-related requests or questions about our data practices:
              </p>
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-3">
                <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Receipto Privacy &amp; Data Protection</div>
                  <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 hover:underline">
                    receiptobusiness@gmail.com
                  </a>
                </div>
              </div>
            </section>
          </article>
        )}

        {/* 3. REFUND & CANCELLATION POLICY */}
        {activeTab === 'refund' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. 14-Day Money-Back Guarantee &amp; Refund Policy</h2>
              <p>
                We want you to be completely satisfied with Receipto. Because our paid plans are processed through <strong>Paddle.com Market Ltd</strong>,
                all purchases are backed by Paddle&rsquo;s Buyer Terms and our <strong>14-day full refund guarantee</strong>.
              </p>
              <p>
                If you purchase a paid subscription (Starter or Growth) and find that Receipto does not meet your business needs, you may request a
                full, no-questions-asked refund within <strong>14 days of your initial purchase date</strong>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. How to Request a Refund</h2>
              <p>To request a refund, you can choose either of the following straightforward options:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center gap-2 text-white font-semibold mb-1">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>Option 1: Contact Receipto Support</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Email us at{' '}
                    <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 underline">
                      receiptobusiness@gmail.com
                    </a>{' '}
                    with your registered email address or Paddle Order ID. We will promptly process your refund through Paddle within 1 business day.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center gap-2 text-white font-semibold mb-1">
                    <ExternalLink className="w-4 h-4 text-emerald-400" />
                    <span>Option 2: Paddle Buyer Support</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Visit{' '}
                    <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">
                      paddle.net
                    </a>{' '}
                    and enter your email address to look up your order and request a refund or receipt assistance directly from the Merchant of Record.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Refunds typically credit back to your original payment method (Credit Card, PayPal, Apple Pay, Google Pay) within 3 to 5 business days
                depending on your bank.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. Subscription Cancellation Policy</h2>
              <p>
                You may cancel your paid subscription at any time with a single click. There are no cancellation fees, lockout penalties, or minimum commitments.
              </p>
              <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                <div className="font-semibold text-white">How to Cancel in Receipto:</div>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-300">
                  <li>Log in to your Receipto account and open the <strong>Billing &amp; Subscription</strong> tab.</li>
                  <li>Click <strong>Cancel Subscription</strong> or open the <strong>Paddle Customer Portal</strong> link.</li>
                  <li>Confirm your cancellation request.</li>
                </ol>
              </div>
              <p>
                <strong>What happens upon cancellation:</strong> Your account retains full access to your paid tier features until the conclusion of your
                currently paid billing period (&ldquo;current_period_end&rdquo;). At the end of that period, your account gracefully transitions to our Free tier.
                None of your existing invoices, clients, or reminder records are ever deleted.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. Chargebacks and Inquiries</h2>
              <p>
                If you ever see an unrecognized charge or have a billing discrepancy, please contact us at{' '}
                <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 hover:underline">
                  receiptobusiness@gmail.com
                </a>{' '}
                first before initiating a bank dispute. We are committed to resolving billing inquiries immediately.
              </p>
            </section>
          </article>
        )}

        {/* Footer info box */}
        <div className="mt-14 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Compliant with Paddle Merchant Verification Standards</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setTabAndUrl('terms')} className="hover:text-slate-300">Terms</button>
            <button onClick={() => setTabAndUrl('privacy')} className="hover:text-slate-300">Privacy</button>
            <button onClick={() => setTabAndUrl('refund')} className="hover:text-slate-300">Refund Policy</button>
            <button onClick={onBackToHome} className="text-indigo-400 hover:underline">Back to Homepage</button>
          </div>
        </div>
      </main>
    </div>
  );
}
