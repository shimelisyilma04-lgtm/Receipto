// Regression test script for Receipto Bug-Fixes
import fs from 'fs';
import path from 'path';

function markUserEmailVerified(email) {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'receipto_db.json');
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      if (Array.isArray(data.users)) {
        const u = data.users.find(x => x.email === email);
        if (u) {
          u.email_verified = true;
          fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
        }
      }
    }
  } catch (e) {
    console.error('Failed to mark user verified in test helper:', e);
  }
}

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  const cookieHeader = res.headers.get('set-cookie');
  let cookie = '';
  if (cookieHeader) {
    cookie = cookieHeader.split(';')[0];
  }

  return { status: res.status, headers: res.headers, contentType, data, cookie };
}

async function runTests() {
  console.log('======================================================');
  console.log('RECEIPTO BUG-FIX & REGRESSION VERIFICATION');
  console.log('======================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`\x1b[32m✓ PASS:\x1b[0m ${message}`);
      passed++;
    } else {
      console.log(`\x1b[31m✗ FAIL:\x1b[0m ${message}`);
      failed++;
    }
  }

  // 1. Unauthenticated Print Request must return HTML (not raw JSON)
  const unauthPrint = await request('/api/invoices/non-existent-id/print');
  assert(unauthPrint.status === 401, 'Unauth print request returns HTTP 401');
  assert(unauthPrint.contentType.includes('text/html'), `Unauth print returns text/html content-type (got ${unauthPrint.contentType})`);
  assert(typeof unauthPrint.data === 'string' && unauthPrint.data.includes('Please Log In to View Invoice'), 'Unauth print renders styled HTML login page, not JSON');

  // Register a test user
  const email = `test_audit_${Date.now()}@receipto.test`;
  const password = process.env.TEST_PASSWORD || 'TestAuditPassword123!';
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      name: 'Audit Merchant',
      business_name: 'Audit Solutions LLC',
      terms_accepted: true,
    },
  });
  assert(regRes.status === 201, 'Registered test audit user');
  markUserEmailVerified(email);

  // Log in to obtain verified session
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert(loginRes.status === 200, 'Logged in with verified user');
  const cookie = loginRes.cookie;
  const token = loginRes.data?.token;

  // Create a client
  const clientRes = await request('/api/clients', {
    method: 'POST',
    headers: { Cookie: cookie, Authorization: `Bearer ${token}` },
    body: {
      name: 'Acme Corporation',
      email: 'billing@acmewidgets.com',
      company: 'Acme International',
      currency: 'USD',
    },
  });
  assert(clientRes.status === 201 && clientRes.data?.client, 'Created test client Acme Corporation');
  const clientId = clientRes.data.client.id;

  // Create an invoice
  const invRes = await request('/api/invoices', {
    method: 'POST',
    headers: { Cookie: cookie, Authorization: `Bearer ${token}` },
    body: {
      client_id: clientId,
      invoice_number: `INV-AUDIT-${Date.now()}`,
      amount: 1450.75,
      currency: 'USD',
      issue_date: '2026-09-01',
      due_date: '2026-09-15',
      notes: 'Net 14 payment terms apply.',
    },
  });
  assert(invRes.status === 201 && invRes.data?.invoice, 'Created test invoice');
  const invoiceId = invRes.data.invoice.id;

  // BUG 1: Print Invoice route returns rendered HTML with all required fields
  const printRes = await request(`/api/invoices/${invoiceId}/print`, {
    headers: { Cookie: cookie },
  });
  assert(printRes.status === 200, 'Print invoice route returns HTTP 200');
  assert(printRes.contentType.includes('text/html'), 'Print invoice returns text/html content-type');
  assert(printRes.data.includes('Receipto Printable Invoice'), 'Print invoice includes Receipto branding');
  assert(printRes.data.includes('Acme Corporation'), 'Print invoice includes client name');
  assert(printRes.data.includes('billing@acmewidgets.com'), 'Print invoice includes client email');
  assert(printRes.data.includes('Acme International'), 'Print invoice includes client company');
  assert(printRes.data.includes('1,450.75'), 'Print invoice formats amount accurately');
  assert(printRes.data.includes('Net 14 payment terms apply.'), 'Print invoice includes invoice notes');
  assert(printRes.data.includes('@media print'), 'Print invoice includes print-specific media queries');
  assert(printRes.data.includes('window.print()'), 'Print invoice includes print trigger script');

  // BUG 1 (Edge Case): Direct browser access to /api/invoices/:id with Accept: text/html
  const browserGetRes = await request(`/api/invoices/${invoiceId}`, {
    headers: {
      Cookie: cookie,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  assert(browserGetRes.status === 200, 'Direct browser access to invoice URL returns HTTP 200');
  assert(browserGetRes.contentType.includes('text/html'), 'Direct browser access returns rendered HTML (never raw JSON)');

  // BUG 2: CSV Export Plan Gating and text/csv delivery
  // On FREE plan, CSV export should be rejected with HTTP 403
  const csvFreeRes = await request('/api/invoices/export/csv', {
    headers: { Cookie: cookie },
  });
  assert(csvFreeRes.status === 403, 'Free tier CSV export rejected with HTTP 403');
  assert(csvFreeRes.data.code === 'FEATURE_LOCKED', 'Returns FEATURE_LOCKED code');

  // Upgrade to Starter plan via billing simulation
  const upgradeRes = await request('/api/billing/simulate', {
    method: 'POST',
    headers: { Cookie: cookie, Authorization: `Bearer ${token}` },
    body: { plan: 'STARTER', interval: 'monthly' },
  });
  assert(upgradeRes.status === 200, 'Upgraded user to STARTER plan');

  // Now CSV export should succeed and return text/csv
  const csvStarterRes = await request('/api/invoices/export/csv', {
    headers: { Cookie: cookie },
  });
  assert(csvStarterRes.status === 200, 'Starter tier CSV export returns HTTP 200');
  assert(csvStarterRes.contentType.includes('text/csv'), `Starter CSV export returns text/csv (got ${csvStarterRes.contentType})`);
  assert(csvStarterRes.data.includes('"Invoice Number"') && csvStarterRes.data.includes('"Client Name"'), 'CSV contains proper header row');
  assert(csvStarterRes.data.includes('"1450.75"'), 'CSV preserves pure numeric amount without corruption');
  assert(csvStarterRes.data.includes('Acme Corporation'), 'CSV contains client record');

  // BUG 3: Resend Email Reminder response handling
  const reminderRes = await request('/api/reminders/send', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: {
      invoice_id: invoiceId,
      tone: 'friendly',
    },
  });
  assert(reminderRes.status === 200, 'Reminder send returns HTTP 200 with status info');
  assert(reminderRes.data.success === false, 'Returns success: false when Resend key is invalid/unconfigured');
  assert(reminderRes.data.reminder && (reminderRes.data.reminder.status === 'CONFIG_REQUIRED' || reminderRes.data.reminder.status === 'FAILED'), `Reminder record persisted with appropriate status (${reminderRes.data?.reminder?.status})`);
  assert(reminderRes.data.message.includes('Email could not be sent') || reminderRes.data.message.includes('configuration') || reminderRes.data.message.includes('Failed') || reminderRes.data.message.includes('rejected'), 'Clear explanation provided in response');

  console.log('------------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
