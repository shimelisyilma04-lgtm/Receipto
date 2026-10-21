# Receipto — Modern Invoicing & Payment Follow-up SaaS

Receipto helps businesses track invoices, identify overdue payments, and follow up with customers with zero friction.

Built with a **100% Firebase-Powered Architecture** (Cloud Firestore & Firebase Authentication), **Stripe as the Sole Payment Provider** for recurring subscriptions, and **Resend** for transactional email notifications.

---

## Architecture Overview: Firebase & Cloud Firestore Powered

> **Environment & Deployment Notice:** Receipto is strictly **Firebase-Powered**. All legacy Supabase and PostgreSQL database configurations have been completely eliminated and replaced by Google Cloud Firestore and Firebase Authentication for robust multi-tenant data isolation, security rules, and serverless reliability.

1. **Authoritative Backend Data Store**: **Cloud Firestore**
   - Cloud Firestore is the single source of truth for all user records, clients, invoices, reminders, activity audit logs, and subscriptions.
   - User data is strictly isolated within `users/{uid}` document hierarchies and isolated subcollections (`clients`, `invoices`, `reminders`, `activity_logs`, `subscription`).
   - Hardened Firestore Security Rules (`firestore.rules`) prevent cross-tenant data access, unauthorized role escalations, and unverified subscription modifications.
   - All legacy Supabase and PostgreSQL database dependencies have been completely replaced by Firebase.

2. **Authentication & Session Security**: **Firebase Authentication**
   - Secure email & password registration and login with cryptographic password hashing.
   - Google Sign-In via Firebase Auth provider.
   - Cryptographically hashed sessions and instant auth state synchronization.
   - Transactional email verification and password reset flows with expiry and attempt limits.
   - Protected client and server routes with strict tenant authorization.

3. **Payments & Subscription Engine**: **Stripe (Sole Payment Provider)**
   - Stripe is the sole payment integration throughout Receipto.
   - Configurable via `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` with HMAC-SHA256 signature verification and replay attack protection (5-minute tolerance).
   - Stripe Checkout sessions for Starter and Growth plans (Monthly and Annual billing).
   - Stripe Customer Portal for self-service payment method updates, billing history, and subscription cancellations.
   - Idempotent webhook event processing for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
   - All legacy Paddle SDKs, scripts, and endpoints have been completely eliminated.

4. **Transactional Email & Reminders**: **Resend**
   - Responsive email templates for invoice reminders (Friendly, Standard, Urgent).
   - Welcome emails, email verification, and password reset dispatches.
   - Graceful status handling and fallback when API keys are not yet configured.

---

## Directory Structure

```
├── firebase-applet-config.json # Firebase client configuration
├── firebase-blueprint.json     # Intermediate Schema Blueprint
├── firebase.json               # Firebase hosting and rules config
├── firestore.rules             # Production security rules
├── server.ts                   # Express server with Vite integration & background workers
├── server/                     # Backend API & service modules
│   ├── auth.ts                 # Authentication & session middlewares
│   ├── db.ts                   # Database models & Firestore handlers
│   ├── email.ts                # Resend email provider adapter
│   ├── plans.ts                # Subscription plan definitions & limits
│   ├── readiness.ts            # Production readiness evaluator
│   ├── routes.ts               # REST API endpoints & Stripe webhooks
│   ├── stripe.ts               # Stripe billing provider adapter (Checkout & Portal)
│   ├── types.ts                # Server TypeScript definitions
│   ├── verification.ts         # Secure email verification engine
│   └── worker.ts               # Automated invoice reminder background worker
├── src/                        # Frontend React SPA
│   ├── App.tsx                 # Main application controller & routing
│   ├── api.ts                  # Client API & Firebase Auth client
│   ├── firebase.ts             # Firebase SDK client initialization
│   ├── components/             # UI views, modals, and legal pages
│   │   ├── BillingView.tsx     # Stripe subscription & billing management
│   │   ├── LandingPage.tsx     # Responsive homepage with legal header navigation
│   │   ├── LegalPages.tsx      # Privacy Policy, Terms, and Refund Policy
│   │   └── Navbar.tsx          # Authenticated top header with legal menu
│   └── services/
│       └── firestoreService.ts # Direct Firestore operations & error handlers
└── scripts/                    # Automated test suites & verification tools
    ├── run_all_tests.mjs       # Master test runner (105+ automated tests)
    ├── verify.mjs              # End-to-end integration test suite
    ├── test_bugfixes.mjs       # Bugfix and regression suite
    ├── test_stripe_integration.mjs # Stripe provider test suite
    ├── verify_owner_demo.mjs   # Owner demo & plan limits test suite
    └── test_email_verification_flow.ts # Secure verification tests
```

---

## Environment Variables (.env)

Receipto cleanly separates public client configuration from server-side secrets.

Copy `.env.example` to `.env`:

```bash
# 1. Server & Application Settings
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://your-domain.com
SESSION_SECRET=your-random-32-character-session-secret

# 2. Firebase & Cloud Firestore Powered
# Client configuration is loaded automatically from firebase-applet-config.json.
ADMIN_EMAIL=admin@your-domain.com

# 3. Stripe Payment Integration (Sole Payment Provider)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_YEARLY_PRICE_ID=price_...
STRIPE_GROWTH_MONTHLY_PRICE_ID=price_...
STRIPE_GROWTH_YEARLY_PRICE_ID=price_...

# 4. Email Delivery (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Receipto <billing@your-domain.com>
EMAIL_REPLY_TO=support@your-domain.com
```

---

## Buyer's Step-by-Step Stripe Configuration Guide

To deploy Receipto with your own payment processing, follow these steps:

### 1. Verify Eligibility & Create Your Stripe Account
- Visit [https://stripe.com](https://stripe.com) and create or sign in to your Stripe account.
- *Note:* Stripe operates in 46+ countries. Ensure your legal business entity and operating country satisfy Stripe's current eligibility requirements and supported merchant jurisdictions.

### 2. Obtain Your API Keys (Start in Test Mode)
- Toggle the Stripe Dashboard to **Test Mode** (top-right switch).
- Navigate to **Developers > API keys**.
- Copy the **Publishable key** (starts with `pk_test_`) into `STRIPE_PUBLISHABLE_KEY`.
- Reveal and copy the **Secret key** (starts with `sk_test_`) into `STRIPE_SECRET_KEY`.
- *Security Requirement:* Never commit secret keys or expose them in client bundles. Receipto executes all Stripe operations through server-side proxy routes.

### 3. Create Products and Prices in Stripe
In your Stripe Dashboard under **Product catalog**:
1. Click **Add product**.
2. **Starter Plan**:
   - Name: `Receipto Starter`
   - Description: `Up to 50 clients, 100 invoices/month, CSV export, and reminders`
   - Pricing: Add a recurring monthly price (e.g., $19/month). Copy the Price ID (`price_...`) to `STRIPE_STARTER_MONTHLY_PRICE_ID`.
   - Add another price to the same product for yearly billing (e.g., $190/year). Copy its Price ID to `STRIPE_STARTER_YEARLY_PRICE_ID`.
3. **Growth Plan**:
   - Name: `Receipto Growth`
   - Description: `Unlimited clients, unlimited invoices, automated reminders, and priority support`
   - Pricing: Add a recurring monthly price (e.g., $49/month). Copy the Price ID to `STRIPE_GROWTH_MONTHLY_PRICE_ID`.
   - Add another price for yearly billing (e.g., $490/year). Copy its Price ID to `STRIPE_GROWTH_YEARLY_PRICE_ID`.

### 4. Configure Webhooks and Signing Secret
1. In the Stripe Dashboard, navigate to **Developers > Webhooks**.
2. Click **Add an endpoint**.
3. Set the Endpoint URL:
   - For production: `https://your-domain.com/api/webhooks/stripe`
   - For local testing: Use the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`).
4. Select the events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Once created, reveal the **Signing secret** (`whsec_...`) and paste it into `STRIPE_WEBHOOK_SECRET`.

### 5. Configure the Stripe Customer Portal
1. In the Stripe Dashboard, go to **Settings > Billing > Customer portal**.
2. Enable the customer portal.
3. Allow customers to cancel subscriptions, view invoice history, and update payment methods.
4. Set the Default return URL to `https://your-domain.com/` (or your application domain).
5. Click **Save changes**.

### 6. Test the Payment Flow Safely
- Start the application locally: `npm run dev`
- Log in and navigate to **Billing / Plans**.
- Select the Starter or Growth plan to launch Stripe Checkout.
- Use Stripe test card numbers (e.g., `4242 4242 4242 4242`, any future expiration date, and any 3-digit CVC).
- Verify that your subscription status updates immediately upon completion and that features unlock according to your plan tier.

---

## Quickstart & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript compilation check
npm run lint

# 3. Start local development server (serves frontend & backend on port 3000)
npm run dev

# 4. Run automated test suite (105+ automated tests across 5 suites)
npm test

# 5. Check production environment readiness
npm run readiness

# 6. Build for production deployment
npm run build

# 7. Start production server
npm start
```

---

## Deployment: Firebase Powered

### Option A: Full-Stack Container (Recommended: Cloud Run, Render, Railway, VPS)
Build the frontend and server bundle into a standalone executable:
```bash
npm run build
npm start
```
- Health check endpoint: `GET /health` (returns HTTP 200 with engine `firestore`)
- Readiness report: `GET /system/readiness`
- Fully Firebase-powered: Uses Cloud Firestore and Firebase Authentication with zero external SQL or Supabase servers required.

### Option B: Firebase Hosting & Security Rules
Deploy the pre-built `dist/` directory directly to Firebase Hosting:
```bash
firebase deploy --only hosting
```
Deploy the security rules:
```bash
firebase deploy --only firestore:rules
```

---

## Code Review & GitHub Synchronization

To review changes locally before pushing to GitHub:

```bash
# 1. Inspect modified and newly added files
git status

# 2. Review the commit history
git log -n 5 --oneline

# 3. Review detailed diffs of any working changes
git diff

# 4. Connect your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<your-username>/receipto.git

# 5. Push changes to GitHub main branch when ready
git push -u origin main
```

---

## License
Commercial SaaS codebase ready for buyer deployment, AI training, and code research.
