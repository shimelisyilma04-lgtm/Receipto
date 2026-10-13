// Production Readiness Checker for Receipto
// Evaluates required environment configurations without exposing secret values.

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
  const env = process.env.PADDLE_ENV?.trim().toLowerCase() || 'production';
  const isProduction = env === 'production' || env === 'live';

  const checks: EnvCheckItem[] = [];

  // 1. DATABASE_URL
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    checks.push({
      key: 'DATABASE_URL',
      category: 'DATABASE',
      status: 'MISSING',
      description: 'Database connection string for PostgreSQL persistence.',
      recommendation: 'Configure a valid Postgres connection string (e.g. Supabase, Neon, or Cloud SQL).',
    });
  } else if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
    checks.push({
      key: 'DATABASE_URL',
      category: 'DATABASE',
      status: 'INVALID FORMAT',
      description: 'Database connection string must begin with postgres:// or postgresql://',
      recommendation: 'Verify the DATABASE_URL protocol prefix.',
    });
  } else if (/\[.*?\]|<.*?>|YOUR_PASSWORD|\[YOUR-PASSWORD\]/i.test(dbUrl)) {
    checks.push({
      key: 'DATABASE_URL',
      category: 'DATABASE',
      status: 'INVALID FORMAT',
      description: 'Database connection string contains placeholder tokens ([ref], [password], etc.).',
      recommendation: 'Replace template placeholders with your real Supabase or Postgres database credentials.',
    });
  } else {
    try {
      const parsed = new URL(dbUrl);
      if (!parsed.hostname || parsed.hostname.includes('[') || parsed.hostname.includes(']')) {
        throw new Error('Invalid hostname in URL');
      }
      checks.push({
        key: 'DATABASE_URL',
        category: 'DATABASE',
        status: 'CONFIGURED',
        description: 'PostgreSQL connection string is configured.',
      });
    } catch {
      checks.push({
        key: 'DATABASE_URL',
        category: 'DATABASE',
        status: 'INVALID FORMAT',
        description: 'Database connection string is not a valid parseable URL.',
        recommendation: 'Verify the connection string format.',
      });
    }
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

  // 4. RESEND_FROM_EMAIL
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (!resendFrom) {
    checks.push({
      key: 'RESEND_FROM_EMAIL',
      category: 'EMAIL',
      status: 'MISSING',
      description: 'Verified sender email address for outgoing system emails.',
      recommendation: 'Configure RESEND_FROM_EMAIL with your verified domain (e.g. Receipto <billing@yourdomain.com>).',
    });
  } else if (!resendFrom.includes('@') || (!resendFrom.includes('<') && !resendFrom.includes('.'))) {
    checks.push({
      key: 'RESEND_FROM_EMAIL',
      category: 'EMAIL',
      status: 'INVALID FORMAT',
      description: 'Sender email must be a valid email format or Name <email@domain.com>.',
      recommendation: 'Format as "Receipto <billing@your-verified-domain.com>".',
    });
  } else {
    checks.push({
      key: 'RESEND_FROM_EMAIL',
      category: 'EMAIL',
      status: 'CONFIGURED',
      description: 'Sender email format is valid.',
    });
  }

  // 5. PADDLE_ENV
  const paddleEnvVal = process.env.PADDLE_ENV?.trim().toLowerCase();
  if (!paddleEnvVal) {
    checks.push({
      key: 'PADDLE_ENV',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Defaulting to production environment.',
    });
  } else if (paddleEnvVal !== 'production' && paddleEnvVal !== 'sandbox' && paddleEnvVal !== 'live') {
    checks.push({
      key: 'PADDLE_ENV',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'PADDLE_ENV must be either "production" or "sandbox".',
      recommendation: 'Set PADDLE_ENV="production" for live billing or "sandbox" for test mode.',
    });
  } else {
    checks.push({
      key: 'PADDLE_ENV',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: `Configured for ${isProduction ? 'Live Production' : 'Developer Sandbox'}.`,
    });
  }

  // 6. PADDLE_CLIENT_TOKEN
  const clientToken = process.env.PADDLE_CLIENT_TOKEN?.trim();
  const expectedTokenPrefix = isProduction ? 'live_' : 'test_';
  if (!clientToken) {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'MISSING',
      description: `Client token for Paddle.js overlay (${expectedTokenPrefix}...).`,
      recommendation: `Create a client-side token in Paddle Dashboard > Developer Tools > Authentication with prefix ${expectedTokenPrefix}.`,
    });
  } else if (!clientToken.startsWith(expectedTokenPrefix)) {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: `Token prefix mismatch. ${isProduction ? 'Live requires "live_"' : 'Sandbox requires "test_"'} prefix.`,
      recommendation: `Ensure token matches ${expectedTokenPrefix} prefix.`,
    });
  } else {
    checks.push({
      key: 'PADDLE_CLIENT_TOKEN',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: `Valid ${isProduction ? 'live' : 'sandbox'} client token configured.`,
    });
  }

  // 7. PADDLE_API_KEY
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'MISSING',
      description: 'Server-side API key for Paddle REST endpoints.',
      recommendation: 'Create an API key in Paddle Dashboard > Developer Tools > Authentication.',
    });
  } else if (apiKey.length < 15) {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'Paddle API key appears truncated or invalid.',
      recommendation: 'Check that the complete API key was copied.',
    });
  } else {
    checks.push({
      key: 'PADDLE_API_KEY',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Server-side Paddle API key is configured.',
    });
  }

  // 8. PADDLE_WEBHOOK_SECRET
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'MISSING',
      description: 'Notification signing secret for Paddle webhook signature verification.',
      recommendation: 'Create a Notification Destination in Paddle and copy the signing secret.',
    });
  } else if (webhookSecret.length < 10) {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'INVALID FORMAT',
      description: 'Paddle webhook signing secret is too short.',
      recommendation: 'Verify the webhook destination signing secret.',
    });
  } else {
    checks.push({
      key: 'PADDLE_WEBHOOK_SECRET',
      category: 'PADDLE',
      status: 'CONFIGURED',
      description: 'Paddle notification signing secret is configured.',
    });
  }

  // Helper for Price IDs
  function checkPriceId(key: string, label: string) {
    const val = process.env[key]?.trim();
    if (!val) {
      checks.push({
        key,
        category: 'PADDLE',
        status: 'MISSING',
        description: `Paddle Price ID for ${label} (pri_...).`,
        recommendation: `Create price in Paddle Live Catalog and set ${key}="pri_...".`,
      });
    } else if (!val.startsWith('pri_') || val.length < 6) {
      checks.push({
        key,
        category: 'PADDLE',
        status: 'INVALID FORMAT',
        description: `Price ID for ${label} must begin with "pri_".`,
        recommendation: `Check price ID from Paddle Catalog. Current value does not have "pri_" prefix.`,
      });
    } else {
      checks.push({
        key,
        category: 'PADDLE',
        status: 'CONFIGURED',
        description: `Valid price ID format configured for ${label}.`,
      });
    }
  }

  // 9. PADDLE_STARTER_MONTHLY_PRICE_ID
  checkPriceId('PADDLE_STARTER_MONTHLY_PRICE_ID', 'Starter Monthly');

  // 10. PADDLE_STARTER_YEARLY_PRICE_ID
  checkPriceId('PADDLE_STARTER_YEARLY_PRICE_ID', 'Starter Yearly');

  // 11. PADDLE_GROWTH_MONTHLY_PRICE_ID
  checkPriceId('PADDLE_GROWTH_MONTHLY_PRICE_ID', 'Growth Monthly');

  // 12. PADDLE_GROWTH_YEARLY_PRICE_ID
  checkPriceId('PADDLE_GROWTH_YEARLY_PRICE_ID', 'Growth Yearly');

  // 13. OWNER_DEMO_EMAIL
  const ownerEmail = process.env.OWNER_DEMO_EMAIL?.trim();
  if (!ownerEmail) {
    checks.push({
      key: 'OWNER_DEMO_EMAIL',
      category: 'OWNER_DEMO',
      status: 'MISSING',
      description: 'Authorized email for owner demo testing without real payments.',
      recommendation: 'Set OWNER_DEMO_EMAIL to your personal email to enable owner controls.',
    });
  } else if (!ownerEmail.includes('@') || !ownerEmail.includes('.')) {
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
      description: 'Owner demo authorized account is configured.',
    });
  }

  const configured = checks.filter((c) => c.status === 'CONFIGURED').length;
  const missing = checks.filter((c) => c.status === 'MISSING').length;
  const invalidFormat = checks.filter((c) => c.status === 'INVALID FORMAT').length;

  return {
    overall_ready: missing === 0 && invalidFormat === 0,
    environment: isProduction ? 'production' : 'sandbox',
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
