# Receipto

Receipto helps businesses track invoices, identify overdue payments, and follow up with customers.

## Overview

Receipto is a modern, high-reliability invoicing, overdue payment detection, and automated client follow-up platform. It gives small businesses, consultants, agencies, and service providers complete control over their accounts receivable without the overhead of heavy, complex accounting suites.

> **Note**: Receipto is dedicated to invoice tracking, overdue detection, and customer follow-up. It is not an accounting replacement or a general ledger platform.

## Key Features

- **Invoice Tracking**: Monitor status (`UNPAID`, `OVERDUE`, `PAID`, `CANCELLED`) with automatic daily overdue calculation.
- **Client Directory**: Manage business contacts, billing emails, and customer invoicing history.
- **Automated Payment Follow-ups**: Dispatch polite, standard, or urgent payment reminders directly to client email addresses via Resend.
- **Print & PDF Preview**: Clean, printable invoice modal with professional typography and formatting.
- **Secure Authentication**: Production-grade bcrypt password hashing, signed session cookies, and 6-digit transactional email OTP verification.
- **Dual Persistence Architecture**: Native PostgreSQL / Supabase connection pool with zero-dependency local JSON file storage fallback.
- **Audit Logging**: Comprehensive activity logs for all invoice status transitions, client updates, and reminder dispatches.

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (via `pg` pool) with automatic local persistent JSON storage (`receipto_db.json`)
- **Email Delivery**: Resend API integration with customizable email reminder templates
- **Security**: Cryptographic HMAC-SHA256 session signing, rate limiting, and input sanitization

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# Database (PostgreSQL / Supabase):
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Session Security:
SESSION_SECRET="your-secure-session-secret"
NODE_ENV="production"

# Email Delivery (Resend):
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="Receipto <billing@resend.dev>"
```

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```
