# Changelog

All notable changes to the Receipto SaaS codebase are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-28

### Architecture & Refactoring (Zero Files > 500 Lines)
- **Email Service Modularization**: Refactored monolithic `server/email.ts` (748 lines) into clean, single-responsibility modules:
  - `server/email/types.ts`: TypeScript contracts for email options and delivery results.
  - `server/email/templates.ts`: HTML & plain-text responsive templates with accessible styling.
  - `server/email/client.ts`: Resend API client with rate-limiting and resilience handling.
  - `server/email.ts`: Backward-compatible public facade (7 lines).
- **Frontend API Client Modularization**: Decomposed `src/api.ts` (979 lines) into domain modules:
  - `src/api/client.ts`: Core fetch wrapper with CSRF, error normalization, and Bearer token headers.
  - `src/api/auth.ts`: Authentication, registration, OTP challenges, and session verification.
  - `src/api/clients.ts`: Client management and CRUD operations.
  - `src/api/invoices.ts`: Invoice creation, status mutations, and PDF exports.
  - `src/api/reminders.ts`: Manual reminder dispatch and automated schedule controls.
  - `src/api/billing.ts`: Stripe Checkout sessions and Customer Portal integrations.
  - `src/api/admin.ts`: Administrative metrics, user lifecycle controls, and system audit logs.
  - `src/api.ts`: Central facade maintaining complete backward compatibility.
- **Client Firestore Service Modularization**: Refactored `src/services/firestoreService.ts` (740 lines) into focused domain subservices:
  - `src/services/firestore/utils.ts`: Token providers, converters, and permission error mappers.
  - `src/services/firestore/users.ts`: User profile, state synchronization, and deletion routines.
  - `src/services/firestore/clients.ts`: Scoped client document operations.
  - `src/services/firestore/invoices.ts`: Invoicing subcollection queries and mutations.
  - `src/services/firestore/reminders.ts`: Reminder logs and status tracking.
  - `src/services/firestore/subscriptions.ts`: Quota calculation and limit enforcement.
  - `src/services/firestoreService.ts`: Unified facade preserving existing import signatures.
- **Billing Component Decomposition**: Modularized `src/components/BillingView.tsx` (694 lines down to 439 lines) into:
  - `src/components/billing/PlanQuotaGrid.tsx`: Visual progress bars for client and invoice limits.
  - `src/components/billing/PlanCardsGrid.tsx`: Pricing cards with monthly/annual interval toggle.
  - `src/components/billing/SandboxDevPanel.tsx`: Isolated evaluation and sandbox simulation panel.
- **Verification View Decomposition**: Modularized `src/components/EmailVerificationView.tsx` (559 lines down to 470 lines) into:
  - `src/components/verification/DeliveryStatusBanners.tsx`: Status notifications for OTP delivery.
  - `src/components/verification/ChangeEmailForm.tsx`: Self-service email address change form.

### Automated Testing & Quality Enforcement (164 Tests)
- **Expanded Test Coverage Across Statements & Lines**:
  - Statements: 60.80% (exceeds 60% threshold).
  - Lines: 61.66% (exceeds 60% threshold).
  - Functions: 69.05% (exceeds 60% threshold).
  - Branches: 44.96% (exceeds 40% threshold).
- **11 Deterministic Test Suites**:
  - `server/tests/repositories.test.ts` (35 tests): Complete repository coverage across all domain collections.
  - `server/tests/routes.test.ts` (32 tests): Express route authorization, tenant isolation, and error handling.
  - `server/tests/reminders.test.ts` (14 tests): Reminder previews, tone selection, paid invoice guards, and automated schedules.
  - `server/tests/email.test.ts` (14 tests): Resend integration, HTML template generation, and unconfigured key safety.
  - `server/tests/billing.test.ts` (13 tests): Stripe secret key validation, checkout sessions, customer portal, and HMAC-SHA256 webhook signatures.
  - `server/tests/plans.test.ts` (12 tests): Tier limit enforcement, feature access, and grace period evaluation.
  - `src/tests/api.test.ts` (11 tests): Client error mapping, retry logic, and HTTP status codes.
  - `src/tests/firestoreService.test.ts` (10 tests): Firestore facade methods and error normalization.
  - `server/tests/adminActivity.test.ts` (9 tests): Admin role verification, audit logs, and system metrics.
  - `src/tests/firestoreDomainServices.test.ts` (6 tests): Subservice domain methods.
  - `server/tests/worker.test.ts` (6 tests): Automated invoice reminder background worker intervals and error recovery.
- **Coverage Threshold Enforced**: Configured strict thresholds in `vitest.config.ts` enforcing `>= 60%` statements and lines in CI.
- **100% Deterministic Offline Testing**: In-memory Firestore adapter allows complete test execution without live cloud credentials or network dependencies.

### Security & Hygiene
- **Strict Lint Cleanliness**: 0 ESLint errors and 0 warnings (`$ eslint .`).
- **Strict TypeScript Validation**: 0 TypeScript compilation errors (`tsc --noEmit`).
- **Dependency Hygiene**: 0 high or critical vulnerabilities (`npm audit --audit-level=high`).
- **Production Compilation**: Clean Vite SPA and Node.js server bundle builds verified (`compile_applet`).
