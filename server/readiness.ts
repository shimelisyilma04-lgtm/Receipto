// Production Readiness Checker for Receipto
// Evaluates required environment configurations without exposing secret values.
import fs from 'fs';
import path from 'path';

export type ReadinessStatus = 'CONFIGURED' | 'MISSING' | 'INVALID FORMAT' | 'NOT TESTED';

export interface EnvCheckItem {
  key: string;
  category: 'DATABASE' | 'SECURITY' | 'EMAIL' | 'STRIPE' | 'OWNER_DEMO';
  status: ReadinessStatus;
  description: string;
  recommendation?: string;
}

export interface ProductionReadinessReport {
  overall_ready: boolean;
  environment: 'production' | 'test' | 'development';
  timestamp: string;
  summary: {
    total: number;
    configured: number;
    missing: number;
    invalid_format: number;
  };
  checks: EnvCheckItem[];
}

export function evaluateProductionReadiness(): ProductionReadinessReport {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const isProduction = stripeKey.startsWith('sk_live_') || process.env.NODE_ENV === 'production';

  const checks: EnvCheckItem[] = [];

  // 1. FIREBASE_CONFIG / CLOUD FIRESTORE
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const hasFirebaseConfig = fs.existsSync(configPath);
  if (hasFirebaseConfig) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (cfg.projectId && cfg.apiKey && cfg.firestoreDatabaseId) {
        checks.push({
          key: 'FIREBASE_CONFIG',
          category: 'DATABASE',
          status: 'CONFIGURED',
          description: `Cloud Firestore and Firebase Authentication configured (Project: ${cfg.projectId}).`,
        });
      } else {
        checks.push({
          key: 'FIREBASE_CONFIG',
          category: 'DATABASE',
          status: 'INVALID FORMAT',
          description: 'firebase-applet-config.json is missing required fields (projectId, apiKey, or firestoreDatabaseId).',
          recommendation: 'Verify your firebase-applet-config.json file against Firebase console credentials.',
        });
      }
    } catch {
      checks.push({
        key: 'FIREBASE_CONFIG',
        category: 'DATABASE',
        status: 'INVALID FORMAT',
        description: 'firebase-applet-config.json is not valid JSON.',
        recommendation: 'Check JSON syntax in firebase-applet-config.json.',
      });
    }
  } else {
    checks.push({
      key: 'FIREBASE_CONFIG',
      category: 'DATABASE',
      status: 'MISSING',
      description: 'Firebase configuration (firebase-applet-config.json) for Cloud Firestore and Auth.',
      recommendation: 'Ensure firebase-applet-config.json is present with valid Firebase project details.',
    });
  }

  // 2. SESSION_SECRET
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    checks.push({
      key: 'SESSION_SECRET',
      category: 'SECURITY',
      status: 'MISSING',
      description: 'Cryptographic secret for signing session cookies and auth tokens.',
      recommendation: 'Provide a strong random secret with at least 32 characters.',
    });
  } else if (sessionSecret.length < 16) {
    checks.push({
      key: 'SESSION_SECRET',
      category: 'SECURITY',
      status: 'INVALID FORMAT',
      description: 'Session secret is too short for production use (minimum 16 chars).',
      recommendation: 'Generate a 32+ character random string.',
    });
  } else {
    checks.push({
      key: 'SESSION_SECRET',
      category: 'SECURITY',
      status: 'CONFIGURED',
      description: 'Cryptographic session secret is configured.',
    });
  }

  // 3. RESEND_API_KEY
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    checks.push({
      key: 'RESEND_API_KEY',
      category: 'EMAIL',
      status: 'MISSING',
      description: 'Resend API key for transactional email dispatches.',
      recommendation: 'Generate an API key in the Resend dashboard and set RESEND_API_KEY.',
    });
  } else if (!resendKey.startsWith('re_')) {
    checks.push({
      key: 'RESEND_API_KEY',
      category: 'EMAIL',
      status: 'INVALID FORMAT',
      description: 'Resend API keys must start with the "re_" prefix.',
      recommendation: 'Verify that the key is copied correctly from the Resend dashboard.',
    });
  } else {
    checks.push({
      key: 'RESEND_API_KEY',
      category: 'EMAIL',
      status: 'CONFIGURED',
      description: 'Resend API key is configured with correct prefix.',
    });
  }

  // 4. EMAIL_FROM / RESEND_FROM_EMAIL
  const resendFrom = process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
  if (!resendFrom) {
    checks.push({
      key: 'EMAIL_FROM',
      category: 'EMAIL',
      status: 'MISSING',
      description: 'Verified sender email address for outgoing system emails.',
      recommendation: 'Configure EMAIL_FROM with your verified domain (e.g. Receipto <billing@yourdomain.com>).',
    });
  } else if (!resendFrom.includes('@')) {
    checks.push({
      key: 'EMAIL_FROM',
      category: 'EMAIL',
      status: 'INVALID FORMAT',
      description: 'Sender email must be a valid email format or Name <email@domain.com>.',
      recommendation: 'Format as "Receipto <billing@your-verified-domain.com>".',
    });
  } else {
    checks.push({
      key: 'EMAIL_FROM',
      category: 'EMAIL',
      status: 'CONFIGURED',
      description: 'Sender email format is valid.',
    });
  }

  // 5. STRIPE_SECRET_KEY
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    checks.push({
      key: 'STRIPE_SECRET_KEY',
      category: 'STRIPE',
      status: 'MISSING',
      description: 'Secret API key for server-to-server Stripe operations.',
      recommendation: 'Create a Stripe account and copy your secret key (sk_test_... or sk_live_...).',
    });
  } else if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    checks.push({
      key: 'STRIPE_SECRET_KEY',
      category: 'STRIPE',
      status: 'INVALID FORMAT',
      description: 'Stripe secret key must start with "sk_test_" or "sk_live_".',
      recommendation: 'Copy the secret key directly from the Stripe Dashboard > Developers > API keys.',
    });
  } else {
    checks.push({
      key: 'STRIPE_SECRET_KEY',
      category: 'STRIPE',
      status: 'CONFIGURED',
      description: 'Stripe secret key is configured.',
    });
  }

  // 6. STRIPE_PUBLISHABLE_KEY
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!pubKey) {
    checks.push({
      key: 'STRIPE_PUBLISHABLE_KEY',
      category: 'STRIPE',
      status: 'MISSING',
      description: 'Public publishable key for client-side Stripe checkout.',
      recommendation: 'Copy your publishable key (pk_test_... or pk_live_...) from Stripe Dashboard.',
    });
  } else if (!pubKey.startsWith('pk_test_') && !pubKey.startsWith('pk_live_')) {
    checks.push({
      key: 'STRIPE_PUBLISHABLE_KEY',
      category: 'STRIPE',
      status: 'INVALID FORMAT',
      description: 'Stripe publishable key must start with "pk_test_" or "pk_live_".',
      recommendation: 'Copy the publishable key from Stripe Dashboard > Developers > API keys.',
    });
  } else {
    checks.push({
      key: 'STRIPE_PUBLISHABLE_KEY',
      category: 'STRIPE',
      status: 'CONFIGURED',
      description: 'Stripe publishable key is configured.',
    });
  }

  // 7. STRIPE_WEBHOOK_SECRET
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    checks.push({
      key: 'STRIPE_WEBHOOK_SECRET',
      category: 'STRIPE',
      status: 'MISSING',
      description: 'Secret signing key for cryptographic verification of Stripe webhooks.',
      recommendation: 'Create a webhook endpoint pointing to /api/webhooks/stripe and copy the signing secret (whsec_...).',
    });
  } else if (!webhookSecret.startsWith('whsec_')) {
    checks.push({
      key: 'STRIPE_WEBHOOK_SECRET',
      category: 'STRIPE',
      status: 'INVALID FORMAT',
      description: 'Stripe webhook signing secret must start with "whsec_".',
      recommendation: 'Copy the signing secret from your Stripe Webhook endpoint page.',
    });
  } else {
    checks.push({
      key: 'STRIPE_WEBHOOK_SECRET',
      category: 'STRIPE',
      status: 'CONFIGURED',
      description: 'Stripe webhook signing secret is configured.',
    });
  }

  // 8. Plan Price IDs
  const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID?.trim();
  const starterYearly = process.env.STRIPE_STARTER_YEARLY_PRICE_ID?.trim();
  const growthMonthly = process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID?.trim();
  const growthYearly = process.env.STRIPE_GROWTH_YEARLY_PRICE_ID?.trim();

  const priceConfigs = [
    { key: 'STRIPE_STARTER_MONTHLY_PRICE_ID', val: starterMonthly, desc: 'Starter Monthly recurring price' },
    { key: 'STRIPE_STARTER_YEARLY_PRICE_ID', val: starterYearly, desc: 'Starter Yearly recurring price' },
    { key: 'STRIPE_GROWTH_MONTHLY_PRICE_ID', val: growthMonthly, desc: 'Growth Monthly recurring price' },
    { key: 'STRIPE_GROWTH_YEARLY_PRICE_ID', val: growthYearly, desc: 'Growth Yearly recurring price' },
  ];

  for (const p of priceConfigs) {
    if (!p.val) {
      checks.push({
        key: p.key,
        category: 'STRIPE',
        status: 'MISSING',
        description: `Stripe Price ID for ${p.desc}.`,
        recommendation: `Create a recurring price in Stripe Dashboard > Product Catalog and set ${p.key}.`,
      });
    } else if (!p.val.startsWith('price_')) {
      checks.push({
        key: p.key,
        category: 'STRIPE',
        status: 'INVALID FORMAT',
        description: `Stripe Price ID for ${p.desc} must start with "price_".`,
        recommendation: `Verify that ${p.key} starts with "price_" (found: "${p.val}").`,
      });
    } else {
      checks.push({
        key: p.key,
        category: 'STRIPE',
        status: 'CONFIGURED',
        description: `Stripe Price ID for ${p.desc} is configured.`,
      });
    }
  }

  // 9. OWNER_DEMO_EMAIL
  const ownerDemo = process.env.OWNER_DEMO_EMAIL?.trim();
  if (ownerDemo) {
    if (!ownerDemo.includes('@')) {
      checks.push({
        key: 'OWNER_DEMO_EMAIL',
        category: 'OWNER_DEMO',
        status: 'INVALID FORMAT',
        description: 'OWNER_DEMO_EMAIL must be a valid email address.',
        recommendation: 'Provide a valid email address for owner demo access.',
      });
    } else {
      checks.push({
        key: 'OWNER_DEMO_EMAIL',
        category: 'OWNER_DEMO',
        status: 'CONFIGURED',
        description: 'Owner demo account switcher is enabled for authorized email.',
      });
    }
  }

  const missing = checks.filter((c) => c.status === 'MISSING').length;
  const invalidFormat = checks.filter((c) => c.status === 'INVALID FORMAT').length;
  const configured = checks.filter((c) => c.status === 'CONFIGURED').length;

  const requiredKeys = ['FIREBASE_CONFIG', 'SESSION_SECRET'];
  const requiredChecks = checks.filter((c) => requiredKeys.includes(c.key));
  const overallReady = requiredChecks.every((c) => c.status === 'CONFIGURED');

  return {
    overall_ready: overallReady,
    environment: isProduction ? 'production' : 'test',
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      configured,
      missing,
      invalid_format: invalidFormat,
    },
    checks,
  };
}
