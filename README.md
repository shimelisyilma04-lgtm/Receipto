# Receipto — Modern Invoicing & Payment Follow-up SaaS

Receipto helps businesses track accounts receivable, identify overdue invoices, and follow up with customers with zero friction.

Built with a **100% Firebase-Powered Architecture** (Cloud Firestore & Firebase Authentication), **Stripe as the Sole Payment Provider** for recurring subscriptions, and **Resend** for transactional email delivery.

---

## Architecture Overview: Firebase & Cloud Firestore Powered

> **Environment & Deployment Architecture:** Receipto is strictly **Firebase-Powered**. All legacy Supabase and PostgreSQL database configurations have been completely eliminated and replaced by Google Cloud Firestore and Firebase Authentication for robust multi-tenant data isolation, security rules, and serverless reliability.

1. **Authoritative Backend Data Store**: **Cloud Firestore**
   - Cloud Firestore is the single source of truth for all user records, clients, invoices, reminders, activity audit logs, and subscriptions.
   - User data is strictly isolated within `users/{uid}` document hierarchies and scoped subcollections (`clients`, `invoices`, `reminders`, `activity_logs`, `subscription`).
   - Hardened Firestore Security Rules (`firestore.rules`) enforce tenant boundaries, prevent unauthorized role escalations, and prohibit client-side subscription modifications.
   - Zero external relational databases (PostgreSQL/Supabase) are required.

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

4. **Transactional Email & Reminders**: **Resend**
   - Responsive email templates for invoice reminders (Friendly, Standard, Urgent).
   - Welcome emails, email verification, and password reset dispatches.
   - Graceful status handling and fallback when API keys are not yet configured.

---

## Prerequisites & Clean Clone Installation

- **Node.js**: `v22.x` (LTS) or higher recommended (compatible with Node 22+)
- **Package Manager**: `npm` (v10+). Deterministic installations use `package-lock.json`.

```bash
# Clone the repository
git clone <repository-url>
cd receipto

# Install exact dependencies deterministically
npm ci
```

---

## Directory Structure

```
├── .github/
│   ├── dependabot.yml          # Automated weekly dependency updates
│   └── workflows/
│       └── ci.yml              # Hardened GitHub Actions CI (typecheck, lint, test, coverage, build, audit)
├── Dockerfile                  # Multi-stage secure non-root Docker build
├── docker-compose.yml          # Production & local Docker Compose stack
├── eslint.config.js            # ESLint flat config with TypeScript & React Hooks rules
├── firebase-applet-config.json # Firebase client configuration
├── firebase-blueprint.json     # Intermediate Schema Blueprint
├── firebase.json               # Firebase hosting and rules config
├── firestore.rules             # Production security rules
├── package-lock.json           # Deterministic npm dependency lockfile
├── vitest.config.ts            # Vitest unit, integration & v8 coverage configuration
├── server.ts                   # Express server entry point & background worker
├── server/                     # Backend modular architecture
│   ├── auth.ts                 # Authentication & session middlewares
│   ├── db.ts                   # Facade re-exporting domain repositories & init
│   ├── email.ts                # Resend transactional email provider
│   ├── plans.ts                # Subscription plan definitions & tier limits
│   ├── readiness.ts            # Production readiness evaluator
│   ├── routes.ts               # Express router mounting domain controllers
│   ├── stripe.ts               # Stripe billing provider (Checkout & Portal)
│   ├── types.ts                # Server TypeScript definitions
│   ├── verification.ts         # Secure email OTP challenge engine
│   ├── worker.ts               # Automated invoice reminder background worker
│   ├── lib/                    # Concurrency, state, and structured logging
│   │   ├── asyncKeyLock.ts     # Per-key write mutex primitive
│   │   ├── dbStore.ts          # In-memory store & disk persistence
│   │   ├── firestoreClient.ts  # Live Cloud Firestore client & active latency probe
│   │   └── logger.ts           # Structured Pino logger with credential redaction
│   ├── schemas/                # Strict Zod input validation schemas
│   │   ├── admin.schema.ts     # User role & status schemas
│   │   ├── auth.schema.ts      # Registration, login, and password schemas
│   │   ├── billing.schema.ts   # Stripe checkout session schemas
│   │   ├── client.schema.ts    # Client CRUD validation schemas
│   │   ├── invoice.schema.ts   # Invoice lifecycle validation schemas
│   │   └── validate.ts         # Express Zod validation middleware
│   ├── repositories/           # Isolated domain repositories
│   │   ├── userRepository.ts
│   │   ├── clientRepository.ts
│   │   ├── invoiceRepository.ts
│   │   ├── reminderRepository.ts
│   │   ├── activityRepository.ts
│   │   ├── subscriptionRepository.ts
│   │   ├── verificationRepository.ts
│   │   └── adminRepository.ts
│   ├── routes/                 # Domain-specific route controllers
│   │   ├── auth.routes.ts
│   │   ├── clients.routes.ts
│   │   ├── invoices.routes.ts
│   │   ├── reminders.routes.ts
│   │   ├── activity.routes.ts
│   │   ├── billing.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── helpers.routes.ts
│   │   └── invoicePrintTemplate.ts
│   └── tests/                  # Backend automated test suite
│       ├── routes.test.ts      # Real route tests, auth, tenant isolation
│       └── repositories.test.ts# Isolated unit tests for domain repositories
├── src/                        # Frontend React SPA
│   ├── App.tsx                 # Main application controller & routing
│   ├── api.ts                  # Client API & Firebase Auth client
│   ├── firebase.ts             # Firebase SDK client initialization
│   ├── components/             # UI views, modals, and legal pages
│   │   ├── AdminPanel.tsx      # Orchestrator administration view
│   │   ├── admin/              # Modular admin subcomponents
│   │   │   ├── AdminOverview.tsx
│   │   │   ├── AdminUsers.tsx
│   │   │   ├── AdminSubscriptions.tsx
│   │   │   ├── AdminActivity.tsx
│   │   │   └── AdminSystem.tsx
│   │   ├── BillingView.tsx     # Stripe subscription & billing management
│   │   ├── LandingPage.tsx     # Responsive homepage with legal header navigation
│   │   ├── LegalPages.tsx      # Privacy Policy, Terms, and Refund Policy
│   │   └── Navbar.tsx          # Authenticated top header with legal menu
│   ├── services/
│   │   └── firestoreService.ts # Direct Firestore operations & error handlers
│   └── tests/                  # Frontend automated test suite
│       └── api.test.ts         # API client, error parsing, and retry tests
└── scripts/                    # End-to-end test suites & verification tools
    ├── run_all_tests.mjs       # Master regression runner (105+ automated tests)
    ├── verify.mjs              # End-to-end integration test suite
    ├── test_bugfixes.mjs       # Bugfix and regression suite
    ├── test_stripe_integration.mjs # Stripe provider test suite
    ├── verify_owner_demo.mjs   # Owner demo & plan limits test suite
    ├── test_email_verification_flow.ts # Secure verification tests
    ├── check_readiness.mjs     # Environment readiness CLI diagnostic
    └── make-admin.mjs          # User role promotion CLI tool
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
- *Merchant Eligibility Notice:* Stripe operates in 46+ countries. Ensure your legal business entity and operating jurisdiction satisfy Stripe's current merchant eligibility requirements.

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
- Use Stripe official test card numbers (e.g., `4242 4242 4242 4242`, any future expiration date, and any 3-digit CVC).
- Verify that your subscription status updates immediately upon completion and that features unlock according to your plan tier.

---

## Quickstart & Local Development

```bash
# 1. Install dependencies deterministically
npm ci

# 2. Run TypeScript compilation check
npm run lint

# 3. Start local development server (serves frontend & backend on port 3000)
npm run dev

# 4. Run automated unit & route test suite (Vitest)
npm test

# 5. Run end-to-end integration and regression suite
npm run test:e2e

# 6. Check production environment readiness diagnostic
npm run readiness

# 7. Run dependency security vulnerability audit (clean 0 high/critical vulnerabilities)
npm audit --audit-level=high

# 8. Build for production deployment
npm run build

# 9. Start production server
npm start
```

---

## Firebase Configuration & Firestore Deployment Guide

Receipto uses Google Cloud Firestore as its authoritative database and Firebase Authentication for identity.

### 1. Firebase Project Setup & Authentication
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create or select your project.
2. In **Build > Authentication**, click **Get Started** and enable the **Google** and **Email/Password** sign-in providers.
3. Add your deployment domain (e.g., `your-domain.com`) to **Authentication > Settings > Authorized domains**.
4. In **Project settings > General > Your apps**, register a Web App and download the configuration.
5. Populate `firebase-applet-config.json` with your credentials:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
   - `firestoreDatabaseId` (e.g. `(default)` or custom named database)

### 2. Firestore Rules Deployment
Receipto enforces Zero-Trust multi-tenant rules (`firestore.rules`) isolating each user's records under `/users/{userId}/**` with strict attribute checks.

To deploy security rules using Firebase CLI:
```bash
# Log in to Firebase CLI
firebase login

# Set your target project
firebase use <your-project-id>

# Deploy security rules
firebase deploy --only firestore:rules
```

### 3. Firestore Indexes
Most queries in Receipto are user-scoped subcollection queries (`/users/{userId}/invoices`) filtered by fields like `issue_date` or `due_date`. Single-field indexes are created automatically by Firestore. For compound queries (e.g., filtering invoices by `payment_status` and sorting by `due_date`), Firestore will automatically generate an index URL in the console log upon first execution. Alternatively, deploy composite indexes via `firestore.indexes.json`:
```bash
firebase deploy --only firestore:indexes
```

---

## Resend Email Configuration & Domain Requirements

Transactional email reminders and account verification codes are dispatched via **Resend**.

1. Create a free account at [https://resend.com](https://resend.com).
2. Generate an API Key under **API Keys** with "Full access" or "Sending access". Prefix must start with `re_`.
3. In **Domains**, add and verify your sending domain by publishing the required DNS records (DKIM, SPF, and DMARC TXT records).
4. Set `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_REPLY_TO` in `.env`:
   ```bash
   RESEND_API_KEY=re_1234567890abcdef...
   EMAIL_FROM=Receipto <billing@your-verified-domain.com>
   EMAIL_REPLY_TO=support@your-verified-domain.com
   ```
5. *Testing without verified domain:* When testing locally before DNS records propagate, Resend permits test sending to the email address associated with your Resend account using `onboarding@resend.dev`.

---

## Known Limitations & External Credentials Checklist

For an acquiring team evaluating the production readiness of Receipto:

1. **Stripe Credentials**:
   - In development/evaluation mode without active Stripe keys, Receipto runs in **Test Sandbox Simulation**, allowing UI and end-to-end user journeys to be verified safely.
   - For live production billing, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and product recurring price IDs (`STRIPE_STARTER_MONTHLY_PRICE_ID`, etc.) must be provided by the buyer.

2. **Resend Sending Domain**:
   - Outgoing email delivery requires a verified domain under Resend. If unconfigured, the system gracefully logs reminder dispatches without failing user transactions, and indicates `CONFIG_REQUIRED` in the delivery audit log.

3. **Server-Side Admin Firestore Tasks**:
   - Client web operations and server health pings authenticate directly via the Firebase Web SDK and Web API key.
   - For backend administrative operations requiring bypass of user-level security rules, a Google Cloud service account JSON file should be configured via `GOOGLE_APPLICATION_CREDENTIALS` on the server host.


---

## Deployment Architecture & Supported Options

Receipto is a full-stack web application comprising a Vite React Single Page Application (frontend) and an Express Node.js API (backend).

### Full-Stack Deployment vs. Frontend-Only Static Hosting

It is critical for an acquiring team or prospective operator to understand the architectural distinction between full-stack deployment and frontend static hosting:

| Feature / Responsibility | Full-Stack Node Container (Recommended) | Frontend-Only Static Hosting (CDN / Bucket) |
| :--- | :--- | :--- |
| **Hosting Target** | Google Cloud Run, Render, Railway, AWS ECS, VPS, Docker | Firebase Hosting, Vercel Static, AWS S3 / CloudFront |
| **Command** | `npm run build && npm start` | `firebase deploy --only hosting` |
| **Stripe Secret Operations** | **Supported** (Server-side API calls with `STRIPE_SECRET_KEY`) | **Not Supported** (Secret keys cannot be exposed on client) |
| **Stripe Webhooks Ingestion** | **Supported** (`POST /api/webhooks/stripe` signature verification) | **Not Supported** (No server process to receive webhooks) |
| **Resend Email Delivery** | **Supported** (Server-side API calls with `RESEND_API_KEY`) | **Not Supported** (API key cannot be exposed to browser) |
| **Session Cookies / Auth** | **Supported** (HttpOnly cookies + Bearer token verification) | **Client-only** (Limited to direct Firebase client tokens) |
| **Diagnostic Endpoints** | **Supported** (`/health`, `/system/readiness`) | **Not Supported** |

> **Crucial Security Guideline:** Server-side Stripe credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and Resend credentials (`RESEND_API_KEY`) must **only** reside in a secure, server-side environment. Never expose them to public client bundles.

### Recommended Deployment Options

#### Option A: Full-Stack Container (Recommended: Google Cloud Run, Render, Railway, VPS, Docker)
Build the frontend and server bundle into a standalone executable:
```bash
npm run build
npm start
```
- Set environment variables in your container management dashboard according to `.env.example`.
- Health check endpoint: `GET /health` (returns HTTP 200 with engine `firestore`).
- Readiness report: `GET /system/readiness` (returns configuration validation).

#### Option B: Docker & Docker Compose
Run Receipto containerized in isolated production mode with zero local setup:
```bash
# Build and run the multi-stage non-root container
docker-compose up --build -d

# Check live container health status
docker ps
curl http://localhost:3000/health
```

#### Option C: Verification & Quality Assurance Commands
Run local quality and security checks identical to GitHub Actions CI:
```bash
# 1. TypeScript static analysis
npm run typecheck

# 2. ESLint code cleanliness & React Hook rules
npm run lint

# 3. Vitest automated test suite (85 tests)
npm test

# 4. Comprehensive v8 test coverage report
npm run coverage

# 5. Production build bundle validation
npm run build

# 6. Dependency vulnerability security audit
npm audit --audit-level=high
```

#### Option D: Hybrid (Firebase Hosting with Cloud Run Backend)
Deploy the pre-built `dist/` directory to Firebase Hosting and route `/api/**` to your Cloud Run service via `firebase.json` rewrites:
```bash
firebase deploy --only hosting
```
Deploy the security rules:
```bash
firebase deploy --only firestore:rules
```

---

## Software Licensing, IP Ownership & Acquisition Due Diligence

### 1. Proprietary Source Code Ownership
- The custom application source code (including frontend React components, backend Express controllers, database handlers, business logic, reminders engine, and custom styling) is proprietary intellectual property created for Receipto.
- The repository does not currently include a public open-source license file (e.g. MIT, GPL). For an acquisition or asset sale, a formal **Intellectual Property Assignment Agreement** or **Commercial Software License** executed between the seller and the acquiring entity is required.

### 2. Third-Party Open Source Dependencies & Attribution
Receipto incorporates standard open-source libraries via `npm`. These dependencies are distributed under permissive open-source licenses:
- **MIT License**: React, React DOM, Vite, Express, Lucide React, Motion, Tsx, Cookie-parser, Dotenv.
- **Apache-2.0 License**: Google GenAI SDK (`@google/genai`), Firebase JS SDK (`firebase`), Firebase Admin SDK (`firebase-admin`).
- **BSD-2-Clause / BSD-3-Clause / ISC**: Bcryptjs, TypeScript, Esbuild, Autoprefixer.

*Ownership Transfer Notice:* The acquisition or transfer of this repository conveys rights only to the original proprietary code, assets, and documentation authored specifically for Receipto. It does not convey exclusive copyright to third-party open-source libraries or runtime dependencies, which remain subject to their respective upstream licenses.

### 3. AI Training & Code Research Permissions
- **Proprietary Code:** The seller/copyright holder can grant or assign rights to use the original proprietary code for AI model training, fine-tuning, code intelligence, and research as part of the asset transfer agreement.
- **Third-Party Code:** Training on third-party dependencies (`node_modules`) or open-source packages is governed by the respective upstream open-source licenses and applicable intellectual property law.
- **No Inherent Data Scraping:** The application does not contain scraped proprietary datasets or third-party proprietary trade secrets.

### 4. Decisions Requiring Owner / Seller Action Prior to Sale
1. **Formal License Selection**: Determine whether the codebase will be transferred under a full copyright assignment (Asset Purchase Agreement), an exclusive commercial license, or dual-licensed.
2. **Entity & Trademark Assignment**: Formally assign the "Receipto" trademark/wordmark, domain names, and brand assets to the buyer.
3. **Representations & Warranties**: Review standard M&A warranties regarding non-infringement, absence of undisclosed open-source copyleft licenses (no GPL/AGPL dependencies exist in `package.json`), and authority to sell.

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
