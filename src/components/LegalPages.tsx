import React, { useState, useEffect } from 'react';
import { ArrowLeft, Shield, FileText, RefreshCw, Mail, CheckCircle, CreditCard, Lock, Server, Send } from 'lucide-react';
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
    const path = tab === 'terms' ? '/terms-and-conditions' : tab === 'privacy' ? '/privacy-policy' : '/refund-policy';
    window.history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={onBackToHome}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Return to Receipto Homepage"
              aria-label="Back to Receipto"
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
              id="legal-tab-terms"
              onClick={() => setTabAndUrl('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                activeTab === 'terms'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Terms &amp; Conditions
            </button>
            <button
              id="legal-tab-privacy"
              onClick={() => setTabAndUrl('privacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                activeTab === 'privacy'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Privacy Policy
            </button>
            <button
              id="legal-tab-refund"
              onClick={() => setTabAndUrl('refund')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                activeTab === 'refund'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Refund Policy
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
            <span>Receipto Legal &amp; Compliance Center</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {activeTab === 'terms' && 'Terms and Conditions'}
            {activeTab === 'privacy' && 'Privacy Policy'}
            {activeTab === 'refund' && 'Refund & Cancellation Policy'}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Last modified: October 2026 &bull; Effective for all Receipto subscribers and users
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
              <span>Payments: Stripe (PCI-DSS Level 1)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Storage: Google Cloud Firestore</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span>Email: Resend Transactional</span>
            </span>
          </div>
        </div>

        {/* 1. TERMS AND CONDITIONS */}
        {activeTab === 'terms' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
              <strong className="text-slate-200">Owner Review Note:</strong> Bracketed tokens such as{' '}
              <code className="text-indigo-300">[Legal Business Name]</code> and{' '}
              <code className="text-indigo-300">[Governing Jurisdiction]</code> represent configurable placeholders for
              the acquiring organization or business operator.
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. Agreement to Terms</h2>
              <p>
                These Terms and Conditions (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you
                (&ldquo;User&rdquo;, &ldquo;you&rdquo;, or &ldquo;your&rdquo;) and Receipto (&ldquo;Receipto&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), operated by{' '}
                <strong className="text-white">[Legal Business Name / Operating Entity]</strong>. By accessing,
                registering for, or using the Receipto website and software-as-a-service application, you acknowledge
                that you have read, understood, and agreed to be bound by these Terms and our Privacy Policy.
              </p>
              <p>
                If you are entering into these Terms on behalf of a company, partnership, or other legal entity, you
                represent and warrant that you possess the requisite authority to bind such entity. If you do not
                agree to all terms, you must immediately cease accessing and using Receipto.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. Permitted Use &amp; Service Scope</h2>
              <p>
                Receipto provides an accounts-receivable tracking and client follow-up platform that allows businesses
                and independent consultants to organize client records, track invoice aging and due dates, monitor
                uncollected revenue, and dispatch calibrated payment reminder communications.
              </p>
              <p>You agree to use Receipto solely for legitimate business operations and you agree NOT to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>Send fraudulent, deceptive, harassing, or extortionate payment demands or reminder notices.</li>
                <li>Impersonate financial institutions, court officers, tax collection bodies, or third parties.</li>
                <li>Transmit unsolicited bulk emails (SPAM) or violate CAN-SPAM, GDPR, or applicable electronic telecommunications statutes.</li>
                <li>Attempt to probe, breach, bypass, or reverse engineer subscription gates, rate limiters, or database security rules.</li>
                <li>Resell, sublicense, or rent access to the platform without prior express written authorization.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. User Accounts &amp; Email Verification</h2>
              <p>
                To utilize the service, you must create an account with a valid name, business name, and operational email
                address. To protect account integrity and prevent malicious dispatching of reminders, new accounts
                require email verification before elevated features can be activated. You are solely responsible for
                safeguarding your authentication credentials and for all activities conducted under your tenant account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. Subscriptions, Payments &amp; Billing (Stripe)</h2>
              <p>
                Receipto offers Free tier access as well as paid recurring subscription tiers (including Starter and Growth plans),
                billed on either a monthly or annual cadence.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400">
                <li>
                  <strong className="text-slate-200">Payment Processor:</strong> All subscription billing and credit card
                  processing are conducted directly through <strong>Stripe, Inc.</strong> (&ldquo;Stripe&rdquo;). Receipto
                  never receives, processes, or stores your full credit card number or cardholder security codes (CVV).
                </li>
                <li>
                  <strong className="text-slate-200">Automatic Renewal:</strong> Paid subscriptions automatically renew
                  at the end of each recurring billing cycle unless cancelled prior to the renewal date via the in-app
                  Billing dashboard or Stripe Customer Portal.
                </li>
                <li>
                  <strong className="text-slate-200">Plan Upgrades &amp; Downgrades:</strong> Upgrades take effect
                  immediately with prorated billing calculated by Stripe. Downgrades take effect at the conclusion of the
                  current prepaid billing period.
                </li>
                <li>
                  <strong className="text-slate-200">Failed Payments:</strong> If a scheduled renewal payment fails,
                  Stripe will retry according to smart dunning schedules. If payment cannot be completed, paid features
                  will be suspended and the account will return to Free plan limits without deleting your historical data.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">5. Intellectual Property &amp; Data Ownership</h2>
              <p>
                You retain complete, exclusive ownership and intellectual property rights in all proprietary business
                information, client details, invoice line items, and notes entered into Receipto. We claim no ownership
                over your client or accounting records. You grant Receipto a limited, worldwide license to host,
                transmit, and display your data solely to the extent necessary to provide the service to you.
              </p>
              <p>
                All rights, title, and interest in the Receipto platform, user interfaces, branding, algorithms, and code
                remain the exclusive property of Receipto and its licensors.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">6. Service Availability &amp; Disclaimer of Warranties</h2>
              <p>
                Receipto is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of
                any kind, express or implied. While we strive for 99.9% platform availability and employ resilient Google
                Cloud infrastructure, we do not guarantee uninterrupted, error-free, or bug-free operation. Receipto is an
                operational administrative tool and does not provide legal, debt collection, tax, or certified accounting advice.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">7. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by applicable law, in no event shall Receipto, its officers, directors,
                employees, or service providers be liable for any indirect, incidental, special, consequential, or punitive
                damages, including lost profits, loss of data, loss of business goodwill, or client payment disputes, even if
                advised of the possibility of such damages. In all circumstances, Receipto&rsquo;s total aggregate liability
                shall not exceed the total fees paid by you to Receipto during the twelve (12) months preceding the claim.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">8. Termination &amp; Account Deletion</h2>
              <p>
                You may terminate your account at any time through the in-app settings or by contacting customer support.
                Upon termination, your right to use the platform terminates immediately. We reserve the right to suspend or
                terminate accounts that violate these Terms or engage in unlawful or fraudulent billing behavior.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">9. Governing Law &amp; Dispute Resolution</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of{' '}
                <strong className="text-white">[Governing State / Country, e.g., Delaware, United States]</strong>,
                without regard to its conflict of law principles. Any legal action or proceeding arising under these Terms
                shall be brought exclusively in the courts located in{' '}
                <strong className="text-white">[Designated County / Jurisdiction]</strong>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">10. Contact Information</h2>
              <p>For questions or formal inquiries concerning these Terms and Conditions, please contact:</p>
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-3">
                <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Receipto Legal Team</div>
                  <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 hover:underline">
                    receiptobusiness@gmail.com
                  </a>
                  <p className="text-xs text-slate-400 mt-0.5">[Legal Business Address Placeholder]</p>
                </div>
              </div>
            </section>
          </article>
        )}

        {/* 2. PRIVACY POLICY */}
        {activeTab === 'privacy' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
              <strong className="text-slate-200">Owner Review Note:</strong> This Privacy Policy accurately describes the
              technical implementation of Receipto, detailing Firebase Authentication, Google Cloud Firestore data storage,
              Stripe payment processing, and Resend transactional email delivery.
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. Introduction</h2>
              <p>
                Receipto (&ldquo;Receipto&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) respects your privacy and is dedicated to
                safeguarding the personal information and financial records you manage through our accounts-receivable
                software application. This Privacy Policy outlines what information we collect, how it is stored and
                protected, and how your privacy rights are honored.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. Information We Collect</h2>
              <p>We collect and process the following categories of information to provide the service:</p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400">
                <li>
                  <strong className="text-slate-200">Account Credentials:</strong> Full name, company/business name, email
                  address, and cryptographically salted password hash (processed via secure hashing algorithms; we never store
                  plaintext passwords).
                </li>
                <li>
                  <strong className="text-slate-200">Client Records &amp; Invoices:</strong> Client contact name, client email
                  address, client billing address, currency code, invoice numbers, issue and due dates, line item descriptions,
                  amounts, payment statuses, and notes stored by you.
                </li>
                <li>
                  <strong className="text-slate-200">Payment &amp; Billing Data:</strong> Payment card numbers, billing
                  addresses, and bank payment instruments are handled directly by our payment processor, <strong>Stripe</strong>.
                  Receipto receives and retains only Stripe customer IDs, Stripe subscription IDs, plan tier status, and billing
                  period timestamps. Receipto servers never process or store raw payment card data.
                </li>
                <li>
                  <strong className="text-slate-200">Activity &amp; Audit Logs:</strong> Timestamps of user actions, invoice
                  creations, status transitions, reminder dispatches, and delivery statuses to ensure non-repudiation and an accurate
                  audit trail for your accounting records.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. Third-Party Service Providers</h2>
              <p>We work with trusted third-party infrastructure providers to operate the application:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-3">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>Google Cloud / Firebase</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Provides multi-tenant authentication, token verification, and persistent database storage (Cloud Firestore)
                    enforced with strict security rules.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    <span>Stripe, Inc.</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Processes all subscription payments, invoices, card security, and billing lifecycle management via PCI-DSS
                    compliant infrastructure.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <Send className="w-4 h-4 text-amber-400" />
                    <span>Resend Technologies</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Dispatches transactional emails, account verification messages, and user-initiated client payment reminders
                    securely via API.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. How We Use and Protect Your Information</h2>
              <p>We use your information exclusively to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>Authenticate your identity, enforce session security, and prevent unauthorized account access.</li>
                <li>Store, organize, and calculate accounts-receivable aging metrics and dashboards.</li>
                <li>Transmit authorized reminder emails to your designated client recipients.</li>
                <li>Process subscription tier upgrades, cancellations, and invoicing via Stripe webhooks.</li>
                <li>Enforce plan quotas (client limits, invoice limits) and maintain an immutable activity log.</li>
              </ul>
              <p className="text-emerald-400 font-medium pt-2">
                We never sell, rent, monetize, or broker your personal or client data to advertisers or third-party marketing brokers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">5. Data Retention &amp; Deletion Practices</h2>
              <p>
                We retain your account data for as long as your Receipto account remains active. You can export your full client
                and invoice history to CSV format at any time directly through the application. If you choose to close your account,
                you may request complete deletion of your tenant records by emailing our privacy team. Upon verified request,
                associated client records, invoices, and activity logs will be permanently deleted from our primary Firestore
                database within 30 days.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">6. Your Privacy Rights (GDPR &amp; CCPA/CPRA)</h2>
              <p>
                Depending on your jurisdiction, you may hold rights under the General Data Protection Regulation (GDPR), California
                Consumer Privacy Act (CCPA), or other data privacy laws, including:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>The right to access and obtain a copy of the personal data we hold about you.</li>
                <li>The right to rectify inaccurate or incomplete records.</li>
                <li>The right to request erasure of your data (&ldquo;right to be forgotten&rdquo;).</li>
                <li>The right to export your data in a portable, machine-readable format (CSV/JSON).</li>
                <li>The right to withdraw consent or object to processing where applicable.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">7. Contact the Data Protection Officer</h2>
              <p>To exercise your privacy rights or discuss our data governance practices, please reach out to:</p>
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-3">
                <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Receipto Privacy &amp; Data Protection</div>
                  <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 hover:underline">
                    receiptobusiness@gmail.com
                  </a>
                  <p className="text-xs text-slate-400 mt-0.5">Response timeframe: within 2 business days</p>
                </div>
              </div>
            </section>
          </article>
        )}

        {/* 3. REFUND & CANCELLATION POLICY */}
        {activeTab === 'refund' && (
          <article className="space-y-8 text-sm text-slate-300 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
              <strong className="text-slate-200">Owner Review Note:</strong> This policy governs subscription cancellations
              and refund evaluations processed through Stripe. It reflects our actual subscription lifecycle where cancelling
              keeps paid access until the end of the paid period.
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">1. Subscription Plans &amp; Billing Cycles</h2>
              <p>
                Receipto offers optional paid subscription plans (Starter and Growth) billed on a recurring monthly or annual
                basis via Stripe Checkout. Payment is charged on the calendar day corresponding to the commencement of your
                paid subscription.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">2. Evaluation of Refund Requests</h2>
              <p>
                We strive for total customer satisfaction. Because Receipto provides instant access to premium features upon
                checkout (including elevated client limits, high invoice volumes, and CSV exports), refunds are evaluated under
                the following fair principles:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400">
                <li>
                  <strong className="text-slate-200">Initial 14-Day Evaluation Window:</strong> If you are a new subscriber
                  to a paid plan (Starter or Growth) and determine that Receipto does not suit your operational workflow, you
                  may request a full refund within <strong>14 calendar days</strong> of your initial purchase date.
                </li>
                <li>
                  <strong className="text-slate-200">Recurring Renewal Charges:</strong> Monthly recurring renewals are generally
                  non-refundable once processed, as users may cancel renewal anytime before the billing date. However, if you
                  were charged due to an administrative or billing error, please contact us immediately for review.
                </li>
                <li>
                  <strong className="text-slate-200">Annual Subscriptions:</strong> For annual subscriptions, refund requests
                  submitted within 14 days of the initial charge will receive a full refund. Requests submitted after 14 days
                  may be eligible for a prorated credit at our discretion.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">3. How to Submit a Refund Request</h2>
              <p>Submitting a refund request is simple and does not require complex dispute procedures:</p>
              <div className="p-5 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Mail className="w-5 h-5 text-indigo-400" />
                  <span>Email Receipto Customer Support</span>
                </div>
                <p className="text-xs text-slate-300">
                  Send an email to{' '}
                  <a href="mailto:receiptobusiness@gmail.com" className="text-indigo-400 underline font-semibold">
                    receiptobusiness@gmail.com
                  </a>{' '}
                  with the subject line <code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-300">Refund Request</code>.
                  Please include:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-400">
                  <li>Your registered Receipto account email address.</li>
                  <li>The date of the charge and plan tier (Starter or Growth).</li>
                  <li>A brief description of why Receipto did not meet your expectations.</li>
                </ul>
                <p className="text-xs text-slate-400 pt-1">
                  Our team reviews and processes eligible refund requests through Stripe within <strong>1 to 2 business days</strong>.
                  Once issued, Stripe refunds typically appear on your original payment card statement in 5 to 10 business days.
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">4. Self-Service Subscription Cancellation</h2>
              <p>
                You may cancel your recurring subscription at any time without fees, penalties, or phone calls:
              </p>
              <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                <div className="font-semibold text-white">How to Cancel in Receipto:</div>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-300">
                  <li>Sign in to your Receipto account.</li>
                  <li>Navigate to the <strong>Billing / Plans</strong> section in the main menu.</li>
                  <li>
                    Click <strong>Cancel Subscription</strong> or click <strong>Manage Billing via Stripe Portal</strong> to
                    manage payment methods and cancel renewals directly.
                  </li>
                  <li>Confirm your cancellation.</li>
                </ol>
              </div>
              <p className="pt-2">
                <strong>What happens when you cancel:</strong> Your subscription will NOT renew for the next billing cycle.
                You will retain uninterrupted access to your paid tier features until the conclusion of your current paid
                period (<code className="text-indigo-300">current_period_end</code>). After that date, your account transitions
                smoothly to the Free tier. <strong>Your existing clients, invoices, and audit history are never deleted.</strong>
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white">5. Consumer Statutory Rights</h2>
              <p>
                Nothing in this Refund &amp; Cancellation Policy limits, excludes, or modifies any statutory consumer guarantees
                or cancellation rights you may hold under mandatory local consumer protection legislation (including statutory cooling-off
                periods under EU/UK consumer law where applicable).
              </p>
            </section>
          </article>
        )}

        {/* Footer info box */}
        <div className="mt-14 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Receipto Compliance &bull; Secure Stripe Payment Processing</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setTabAndUrl('terms')} className="hover:text-slate-300 transition">Terms &amp; Conditions</button>
            <button onClick={() => setTabAndUrl('privacy')} className="hover:text-slate-300 transition">Privacy Policy</button>
            <button onClick={() => setTabAndUrl('refund')} className="hover:text-slate-300 transition">Refund Policy</button>
            <button onClick={onBackToHome} className="text-indigo-400 hover:underline">Back to Homepage</button>
          </div>
        </div>
      </main>
    </div>
  );
}
