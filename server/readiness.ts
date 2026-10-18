// Production Readiness Checker for Receipto
// Evaluates required environment configurations without exposing secret values.
import fs from 'fs';
import path from 'path';

export type ReadinessStatus = 'CONFIGURED' | 'MISSING' | 'INVALID FORMAT' | 'NOT TESTED';

export interface EnvCheckItem {
  key: string;
  category: 'DATABASE' | 'SECURITY' | 'EMAIL' | 'PADDLE' | 'OWNER_DEMO';
  status: ReadinessStatus;
  description: string;
  recommendation?: string;
}

export interface ProductionReadinessReport {
  overall_ready: boolean;
  environment: 'production' | 'sandbox' | 'development';
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
  const env =
    process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() ||
    process.env.PADDLE_ENV?.trim().toLowerCase() ||
    'sandbox';
  const isProduction = env === 'production' || env === 'live';

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

  // 5. PADDLE_ENVIRONMENT
  const paddleEnvVal =
    process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() ||
    process.env.PADDLE_ENV?.trim().toLowerCase() ||
    'sandbox';
  if (paddleEnvVal !== 'production' && paddleEnvVal !== 'sandbox' && paddleEnvVal !== 'live') {
    checks.push({
      key: 'PADDLE_ENVIRONMENT',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'PADDLE_ENVIRONMENT must be either "production" or "sandbox".',
      recommendation: 'Set PADDLE_ENVIRONMENT="production" for live billing or "sandbox" for test mode.',
    });
  } else {
    checks.push({
      key: 'PADDLE_ENVIRONMENT',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: `Paddle active environment: ${paddleEnvVal}.`,
    });
  }

  // 6. PADDLE_CLIENT_TOKEN
  const clientToken = process.env.PADDLE_CLIENT_TOKEN?.trim();
  const tokenPrefix = isProduction ? 'live_' : 'test_';
  if (!clientToken) {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'MISSING',
      description: 'Public client-side token for initializing the Paddle.js checkout library.',
      recommendation: `Generate a client-side token in the Paddle Dashboard (${tokenPrefix}...).`,
    });
  } else if (!clientToken.startsWith(tokenPrefix)) {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: `Client token prefix mismatch: expected "${tokenPrefix}" for ${env} environment.`,
      recommendation: `Provide a client token starting with "${tokenPrefix}" for ${env} mode.`,
    });
  } else {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Paddle client token format matches active environment.',
    });
  }

  // 7. PADDLE_API_KEY
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'MISSING',
      description: 'Secret API key for server-to-server Paddle Billing operations.',
      recommendation: 'Generate an API key in Paddle Dashboard under Developer Tools.',
    });
  } else if (!apiKey.startsWith('paddlesecret_') && apiKey.length < 20) {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'Paddle API key appears truncated or malformed.',
      recommendation: 'Copy the full API key from the Paddle developer dashboard.',
    });
  } else {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Paddle server API key is configured.',
    });
  }

  // 8. PADDLE_WEBHOOK_SECRET
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'MISSING',
      description: 'Secret signing key for cryptographic verification of Paddle webhook notifications.',
      recommendation: 'Create a webhook endpoint in Paddle and copy the notification secret key.',
    });
  } else if (!webhookSecret.startsWith('pdl_ntf_set_') && !webhookSecret.startsWith('pdl_') && webhookSecret.length < 15) {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'Paddle notification secret format is unrecognized (expected pdl_ntf_set_...).',
      recommendation: 'Copy the notification secret key directly from the notification destination setting.',
    });
  } else {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Paddle webhook signing secret is configured.',
    });
  }

  // 9. Plan Price IDs
  const starterMonthly = process.env.PADDLE_STARTER_MONTHLY_PRICE_ID?.trim();
  const starterYearly = process.env.PADDLE_STARTER_YEARLY_PRICE_ID?.trim();
  const growthMonthly = process.env.PADDLE_GROWTH_MONTHLY_PRICE_ID?.trim();
  const growthYearly = process.env.PADDLE_GROWTH_YEARLY_PRICE_ID?.trim();

  const priceConfigs = [
    { key: 'PADDLE_STARTER_MONTHLY_PRICE_ID', val: starterMonthly, desc: 'Starter Monthly price' },
    { key: 'PADDLE_STARTER_YEARLY_PRICE_ID', val: starterYearly, desc: 'Starter Yearly price' },
    { key: 'PADDLE_GROWTH_MONTHLY_PRICE_ID', val: growthMonthly, desc: 'Growth Monthly price' },
    { key: 'PADDLE_GROWTH_YEARLY_PRICE_ID', val: growthYearly, desc: 'Growth Yearly price' },
  ];

  for (const p of priceConfigs) {
    if (!p.val) {
      checks.push({
        key: p.key,
        category: 'PADDLE',
        status: 'MISSING',
        description: `${p.desc} ID from Paddle product catalog.`,
        recommendation: `Create price for ${p.desc} in Paddle and set ${p.key}=pri_...`,
      });
    } else if (!p.val.startsWith('pri_')) {
      checks.push({
        key: p.key,
        category: 'PADDLE',
        status: 'INVALID FORMAT',
        description: `${p.key} must begin with "pri_".`,
        recommendation: `Verify the Price ID from Paddle Catalog (starts with pri_).`,
      });
    } else {
      checks.push({
        key: p.key,
        category: 'PADDLE',
        status: 'CONFIGURED',
        description: `${p.desc} configured.`,
      });
    }
  }

  // 10. OWNER_DEMO_EMAIL
  const ownerEmail = process.env.OWNER_DEMO_EMAIL?.trim();
  if (!ownerEmail) {
    checks.push({
      key: 'OWNER_DEMO_EMAIL',
      category: 'OWNER_DEMO',
      status: 'MISSING',
      description: 'Email for owner/founder to test unlocked features.',
      recommendation: 'Set OWNER_DEMO_EMAIL to your personal email to enable owner controls.',
    });
  } else {
    checks.push({
      key: 'OWNER_DEMO_EMAIL',
      category: 'OWNER_DEMO',
      status: 'CONFIGURED',
      description: `Owner demo controls active for ${ownerEmail}.`,
    });
  }

  const configured = checks.filter((c) => c.status === 'CONFIGURED').length;
  const missing = checks.filter((c) => c.status === 'MISSING').length;
  const invalid_format = checks.filter((c) => c.status === 'INVALID FORMAT').length;

  // Essential keys that must be configured and valid for overall_ready: true
  const requiredKeys = ['FIREBASE_CONFIG', 'SESSION_SECRET'];
  const overallReady = requiredKeys.every(
    (k) => checks.find((c) => c.key === k)?.status === 'CONFIGURED'
  );

  return {
    overall_ready: overallReady,
    environment: env as any,
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      configured,
      missing,
      invalid_format,
    },
    checks,
  };
}
