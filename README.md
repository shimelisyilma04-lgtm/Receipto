# Receipto — Modern Invoicing & Payment Follow-up SaaS

Receipto helps businesses track invoices, identify overdue payments, and follow up with customers with zero friction.

Built with a **Firebase-First Architecture** (Cloud Firestore & Firebase Authentication), modular **Paddle Billing v2** checkout, and **Resend** transactional email notifications.

---

## Architecture Overview

1. **Authoritative Backend Data Store**: **Cloud Firestore**
   - Cloud Firestore is the single source of truth for all user records, clients, invoices, reminders, activity audit logs, and subscriptions.
   - User data is strictly isolated within `users/{uid}` paths and subcollections (`clients`, `invoices`, `reminders`, `activity_logs`, `subscription`).
   - Hardened Firestore Security Rules prevent cross-tenant data access, unauthorized role escalations, and unverified subscription modifications.
   - All legacy PostgreSQL and Supabase dependencies have been completely removed.

2. **Authentication & Session Security**: **Firebase Authentication**
   - Email & password registration and login.
   - Google Sign-In via Firebase Auth provider.
   - Cryptographically hashed sessions and instant auth state synchronization.
   - Transactional email verification and password reset flows with expiry and attempt limits.
   - Protected routes and email verification enforcement.

3. **Payments & Subscription Engine**: **Paddle Billing v2**
   - Clean, modular payment adapter supporting Starter and Growth tiers (monthly and annual intervals).
   - Dynamic sandbox and production environment switching via `PADDLE_ENVIRONMENT`.
   - Webhook signature verification (HMAC-SHA256) with idempotency tracking to prevent duplicate billing processing.
   - Client token checkout initialization with server-side API key isolation.

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
│   └── worker.ts               # Automated invoice reminder background worker
└── src/                        # Frontend React SPA
    ├── App.tsx                 # Main application controller
    ├── api.ts                  # Client API & Firebase Auth client
    ├── firebase.ts             # Firebase SDK client initialization
    ├── components/             # UI views and modals
    └── services/
        └── firestoreService.ts # Direct Firestore operations & error handlers
```

---

## Environment Variables (.env)

Receipto cleanly separates public client configuration from server-side secrets.

Copy `.env.example` to `.env`:

```bash
# Server & App Settings
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://your-domain.com
SESSION_SECRET=your-random-32-character-session-secret

# Administrative Superuser
ADMIN_EMAIL=admin@your-domain.com

# Paddle Billing v2
PAYMENT_PROVIDER=paddle
PADDLE_ENVIRONMENT=sandbox
PADDLE_CLIENT_TOKEN=test_client_token_here
PADDLE_API_KEY=pdl_sct_...
PADDLE_WEBHOOK_SECRET=pdl_ntf_set_...
PADDLE_STARTER_MONTHLY_PRICE_ID=pri_...
PADDLE_STARTER_YEARLY_PRICE_ID=pri_...
PADDLE_GROWTH_MONTHLY_PRICE_ID=pri_...
PADDLE_GROWTH_YEARLY_PRICE_ID=pri_...

# Email Delivery (Resend)
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

# 4. Run automated test suite
npm test

# 5. Build for production deployment
npm run build

# 6. Start production server
npm start
```

---

## Deployment Options

### Option A: Full-Stack Container (Recommended: Cloud Run, Render, Railway, VPS)
Build the frontend and server bundle into a standalone executable:
```bash
npm run build
npm start
```
- Health check endpoint: `GET /health` (returns HTTP 200 with engine `firestore`)
- Readiness report: `GET /system/readiness`

### Option B: Firebase Hosting (Static Frontend)
Deploy the pre-built `dist/` directory directly to Firebase Hosting:
```bash
firebase deploy --only hosting
```
Deploy the security rules:
```bash
firebase deploy --only firestore:rules
```

---

## License
Commercial SaaS codebase ready for buyer deployment.
