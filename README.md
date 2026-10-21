# Receipto — Modern Invoicing & Payment Follow-up SaaS

Receipto helps businesses track invoices, identify overdue payments, and follow up with customers with zero friction.

Built with a **100% Firebase-Powered Architecture** (Cloud Firestore & Firebase Authentication), modular **Stripe & Paddle Billing** payment options, and **Resend** transactional email notifications.

---

## Architecture Overview: Firebase & Cloud Firestore Powered

> **Database Migration Notice:** Receipto is strictly **Firebase-Powered**. All legacy PostgreSQL schemas, Supabase configurations, and SQL connection pools have been completely decommissioned and replaced by Google Cloud Firestore and Firebase Authentication for serverless multi-tenant isolation and security.

1. **Authoritative Backend Data Store**: **Cloud Firestore**
   - Cloud Firestore is the single source of truth for all user records, clients, invoices, reminders, activity audit logs, and subscriptions.
   - User data is strictly isolated within `users/{uid}` paths and subcollections (`clients`, `invoices`, `reminders`, `activity_logs`, `subscription`).
   - Hardened Firestore Security Rules (`firestore.rules`) prevent cross-tenant data access, unauthorized role escalations, and unverified subscription modifications.
   - All legacy Supabase and PostgreSQL database dependencies have been completely removed.

2. **Authentication & Session Security**: **Firebase Authentication**
   - Email & password registration and login with bcrypt cryptographic hashing.
   - Google Sign-In via Firebase Auth provider.
   - Cryptographically hashed sessions and instant auth state synchronization.
   - Transactional email verification and password reset flows with expiry and attempt limits.
   - Protected routes and email verification enforcement.

3. **Payments & Subscription Engine**: **Modular Stripe & Paddle Billing**
   - Configurable payment provider selected via `PAYMENT_PROVIDER=stripe` or `PAYMENT_PROVIDER=paddle`.
   - **Stripe**: Configurable via `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` with HMAC-SHA256 signature verification.
   - **Paddle Billing v2**: Client token checkout initialization with server-side API key isolation and webhook signature verification.
   - Clean, modular payment adapters supporting Free, Starter, and Growth tiers.

4. **Transactional Email & Reminders**: **Resend**
   - Responsive email templates for invoice reminders (Friendly, Standard, Urgent).
   - Welcome emails, email verification, and password reset dispatches.
   - Graceful status handling when API keys are not yet configured.

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
│   ├── paddle.ts               # Paddle Billing v2 provider adapter
│   ├── plans.ts                # Subscription plan definitions & limits
│   ├── readiness.ts            # Production readiness evaluator
│   ├── routes.ts               # REST API endpoints & webhooks
│   ├── stripe.ts               # Stripe billing provider adapter
│   ├── types.ts                # Server TypeScript definitions
│   ├── verification.ts         # Cryptographic OTP email verification
│   └── worker.ts               # Automated invoice reminder background worker
├── src/                        # Frontend React SPA
│   ├── App.tsx                 # Main application controller
│   ├── api.ts                  # Client API & Firebase Auth client
│   ├── firebase.ts             # Firebase SDK client initialization
│   ├── components/             # UI views and modals
│   └── services/
│       └── firestoreService.ts # Direct Firestore operations & error handlers
└── scripts/                    # Automated test suites & verification tools
    ├── run_all_tests.mjs       # Master test runner (113+ automated tests)
    ├── verify.mjs              # End-to-end integration test suite
    ├── test_bugfixes.mjs       # Bugfix and regression suite
    ├── test_stripe_integration.mjs # Stripe provider test suite
    ├── test_paddle_live_migration.mjs # Paddle billing and webhook tests
    ├── verify_owner_demo.mjs   # Owner demo & plan limits test suite
    └── test_email_verification_flow.ts # OTP verification cryptographic tests
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

# 2. Firebase & Cloud Firestore Powered (Replaces Supabase & PostgreSQL)
# Client configuration is loaded from firebase-applet-config.json.
ADMIN_EMAIL=admin@your-domain.com

# 3. Payment Provider Configuration (Stripe & Paddle Configurable)
PAYMENT_PROVIDER=paddle # 'paddle' or 'stripe'

# --- Stripe Billing Configuration (Optional) ---
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_YEARLY_PRICE_ID=price_...
STRIPE_GROWTH_MONTHLY_PRICE_ID=price_...
STRIPE_GROWTH_YEARLY_PRICE_ID=price_...

# --- Paddle Billing v2 Configuration ---
PADDLE_ENVIRONMENT=sandbox # 'sandbox' or 'production'
PADDLE_CLIENT_TOKEN=test_client_token_here
PADDLE_API_KEY=pdl_sct_...
PADDLE_WEBHOOK_SECRET=pdl_ntf_set_...
PADDLE_STARTER_MONTHLY_PRICE_ID=pri_...
PADDLE_STARTER_YEARLY_PRICE_ID=pri_...
PADDLE_GROWTH_MONTHLY_PRICE_ID=pri_...
PADDLE_GROWTH_YEARLY_PRICE_ID=pri_...

# 4. Email Delivery (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Receipto <billing@your-domain.com>
EMAIL_REPLY_TO=support@your-domain.com
```

---

## Quickstart & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript check
npm run lint

# 3. Start local development server (serves frontend & backend on port 3000)
npm run dev

# 4. Run automated test suite (113+ automated tests across 6 suites)
npm test

# 5. Check production environment readiness
npm run readiness

# 6. Build for production deployment
npm run build

# 7. Start production server
npm start
```

---

## Deployment Options: Firebase Powered

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
