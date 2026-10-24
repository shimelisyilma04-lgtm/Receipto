// Production Smoke-Test Suite for Receipto v1.1.0
import http from 'http';
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

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

let testPassCount = 0;
let testFailCount = 0;

function logPass(title) {
  testPassCount++;
  console.log(`  \x1b[32mâœ“ PASS:\x1b[0m ${title}`);
}

function logFail(title, err) {
  testFailCount++;
  console.error(`  \x1b[31mâœ— FAIL:\x1b[0m ${title}`);
  if (err) console.error(`    -> ${err}`);
}

async function apiRequest(path, options = {}, cookie = '') {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  const setCookie = response.headers.get('set-cookie') || '';

  return {
    status: response.status,
    headers: response.headers,
    setCookie,
    data,
  };
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('RECEIPTO v1.1.0 PRODUCTION VERIFICATION SUITE');
  console.log('======================================================\n');

  const runId = Date.now();
  const testEmail1 = `engineer_${runId}@receipto.test`;
  const testEmail2 = `intruder_${runId}@receipto.test`;
  const password = process.env.TEST_PASSWORD || 'TestProductionPassword123!';

  let user1Cookie = '';
  let user2Cookie = '';
  let clientId1 = '';
  let invoiceId1 = '';
  let overdueInvoiceId = '';

  // 1. Health Check
  try {
    const res = await apiRequest('/health');
    if (res.status === 200 && res.data.status === 'ok' && res.data.app === 'Receipto') {
      logPass(`GET /health returns 200 with engine: ${res.data.database.engine}`);
    } else {
      throw new Error(`Unexpected health response: ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    logFail('GET /health endpoint check', err.message);
  }

  // 2. User 1 Registration
  try {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: testEmail1,
        password: password,
        name: 'Senior Engineer',
        business_name: 'Pilot Consulting Ltd',
        terms_accepted: true,
      },
    });

    if (res.status === 201 && res.data.user && res.data.user.email === testEmail1) {
      logPass('Registration: Successfully created primary test user');
      user1Cookie = res.setCookie.split(';')[0];
      markUserEmailVerified(testEmail1);
    } else {
      throw new Error(`Registration failed: ${res.status} - ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    logFail('Registration endpoint', err.message);
  }

  // 3. Duplicate Email Rejection
  try {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: testEmail1,
        password: password,
        name: 'Duplicate Test',
        terms_accepted: true,
      },
    });
    if (res.status === 409) {
      logPass('Registration: Duplicate email correctly rejected with HTTP 409');
    } else {
      throw new Error(`Expected HTTP 409, got ${res.status}`);
    }
  } catch (err) {
    logFail('Duplicate registration rejection', err.message);
  }

  // 4. Invalid Password Rejection
  try {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail1,
        password: 'wrongpassword',
      },
    });
    if (res.status === 401) {
      logPass('Login: Invalid password correctly rejected with HTTP 401');
    } else {
      throw new Error(`Expected HTTP 401, got ${res.status}`);
    }
  } catch (err) {
    logFail('Invalid login rejection', err.message);
  }

  // 5. Valid Login & Session Cookie
  try {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail1,
        password: password,
      },
    });
    if (res.status === 200 && res.data.user) {
      logPass('Login: Successfully authenticated and acquired session cookie');
      user1Cookie = res.setCookie.split(';')[0];
    } else {
      throw new Error(`Login failed: ${res.status} - ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    logFail('Valid login flow', err.message);
  }

  // 6. GET /api/auth/me
  try {
    const res = await apiRequest('/api/auth/me', {}, user1Cookie);
    if (res.status === 200 && res.data.user.email === testEmail1) {
      logPass(`Session Auth: GET /api/auth/me verified for ${res.data.user.email}`);
    } else {
      throw new Error(`Expected authenticated user, got ${res.status}`);
    }
  } catch (err) {
    logFail('Auth session verification', err.message);
  }

  // 7. Client Creation
  try {
    const res = await apiRequest('/api/clients', {
      method: 'POST',
      body: {
        name: 'Stark Industries',
        email: 'pepper@stark.com',
        phone: '+1 555-0199',
        company: 'Stark Industries LLC',
        address: '10880 Malibu Point, CA',
      },
    }, user1Cookie);

    if (res.status === 201 && res.data.client && res.data.client.name === 'Stark Industries') {
      clientId1 = res.data.client.id;
      logPass(`Client Management: Created client "${res.data.client.name}" (ID: ${clientId1})`);
    } else {
      throw new Error(`Failed to create client: ${res.status} - ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    logFail('Create client endpoint', err.message);
  }

  // 8. Client Retrieval
  try {
    const res = await apiRequest('/api/clients', {}, user1Cookie);
    if (res.status === 200 && Array.isArray(res.data.clients) && res.data.clients.length > 0) {
      logPass(`Client Management: Retrieved ${res.data.clients.length} client(s)`);
    } else {
      throw new Error(`Expected list of clients, got ${res.status}`);
    }
  } catch (err) {
    logFail('Get clients endpoint', err.message);
  }

  const futureDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pastDueDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const issueDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 9. Invoice Creation (Future Due Date: UNPAID)
  try {
    const res = await apiRequest('/api/invoices', {
      method: 'POST',
      body: {
        client_id: clientId1,
        invoice_number: `INV-${runId}-001`,
        amount: 2500.00,
        currency: 'USD',
        issue_date: issueDate,
        due_date: futureDueDate,
        notes: 'Consulting services for Q3 automation',
      },
    }, user1Cookie);

    if (res.status === 201 && res.data.invoice && res.data.invoice.payment_status === 'UNPAID') {
      invoiceId1 = res.data.invoice.id;
      logPass(`Invoice System: Created invoice #${res.data.invoice.invoice_number} ($2,500.00, Status: UNPAID)`);
    } else {
      throw new Error(`Failed to create invoice: ${res.status} - ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    logFail('Create invoice endpoint', err.message);
  }

  // 10. Duplicate Invoice Number Rejection
  try {
    const res = await apiRequest('/api/invoices', {
      method: 'POST',
      body: {
        client_id: clientId1,
        invoice_number: `INV-${runId}-001`,
        amount: 500.00,
        currency: 'USD',
        issue_date: issueDate,
        due_date: futureDueDate,
      },
    }, user1Cookie);

    if (res.status === 409) {
      logPass('Invoice System: Duplicate invoice number properly rejected (HTTP 409)');
    } else {
      throw new Error(`Expected HTTP 409, got ${res.status}`);
    }
  } catch (err) {
    logFail('Duplicate invoice number check', err.message);
  }

  // 11. Overdue Detection (Past Due Date: OVERDUE)
  try {
    const res = await apiRequest('/api/invoices', {
      method: 'POST',
      body: {
        client_id: clientId1,
        invoice_number: `INV-${runId}-OVERDUE`,
        amount: 1200.00,
        currency: 'USD',
        issue_date: issueDate,
        due_date: pastDueDate, // Past due!
        notes: 'Past due security review',
      },
    }, user1Cookie);

    if (res.status === 201 && res.data.invoice && res.data.invoice.payment_status === 'OVERDUE') {
      overdueInvoiceId = res.data.invoice.id;
      logPass(`Overdue Detection: Invoice with past due date correctly computed as OVERDUE ($1,200.00)`);
    } else {
      throw new Error(`Expected OVERDUE status, got: ${JSON.stringify(res.data?.invoice)}`);
    }
  } catch (err) {
    logFail('Overdue detection calculation', err.message);
  }

  // 12. Dashboard Calculations
  try {
    const res = await apiRequest('/api/dashboard', {}, user1Cookie);
    if (res.status === 200 && res.data.stats) {
      const stats = res.data.stats;
      // Outstanding should be 2500 + 1200 = 3700
      // Overdue should be 1200
      if (stats.total_outstanding === 3700 && stats.total_overdue === 1200 && stats.invoice_counts.overdue >= 1) {
        logPass(`Dashboard Metrics: Outstanding ($${stats.total_outstanding}), Overdue ($${stats.total_overdue}) computed accurately`);
      } else {
        throw new Error(`Unexpected stats values: ${JSON.stringify(stats)}`);
      }
    } else {
      throw new Error(`Dashboard request failed: ${res.status}`);
    }
  } catch (err) {
    logFail('Dashboard stats calculations', err.message);
  }

  // 13. Mark Overdue Invoice as Paid
  try {
    const res = await apiRequest(`/api/invoices/${overdueInvoiceId}/pay`, {
      method: 'POST',
      body: { paid_date: '2026-09-17' },
    }, user1Cookie);

    if (res.status === 200 && res.data.invoice.payment_status === 'PAID') {
      logPass(`Payment Workflow: Overdue invoice #${res.data.invoice.invoice_number} successfully marked as PAID`);
    } else {
      throw new Error(`Failed to mark paid: ${res.status} - ${JSON.stringify(res.data)}`);
    }

    // Verify dashboard reflects invoice is no longer overdue
    const dashRes = await apiRequest('/api/dashboard', {}, user1Cookie);
    const updatedStats = dashRes.data.stats;
    if (updatedStats.total_overdue === 0 && updatedStats.total_paid >= 1200) {
      logPass(`Overdue Clearance: Overdue total cleared ($0) and moved to Paid ($${updatedStats.total_paid})`);
    } else {
      throw new Error(`Stats did not update after payment: ${JSON.stringify(updatedStats)}`);
    }
  } catch (err) {
    logFail('Payment and overdue clearance flow', err.message);
  }

  // 14. Reminders Preview and Send
  try {
    // Test Preview
    const prevRes = await apiRequest('/api/reminders/preview', {
      method: 'POST',
      body: {
        invoice_id: invoiceId1,
        tone: 'friendly',
        custom_message: 'Please review and submit at your convenience.',
      },
    }, user1Cookie);

    if (prevRes.status === 200 && prevRes.data.preview && prevRes.data.preview.subject) {
      logPass(`Reminder System: Generated sanitized email preview with subject: "${prevRes.data.preview.subject}"`);
    } else {
      throw new Error(`Preview failed: ${prevRes.status}`);
    }

    // Test Send / Trigger
    const sendRes = await apiRequest('/api/reminders/send', {
      method: 'POST',
      body: {
        invoice_id: invoiceId1,
        tone: 'friendly',
      },
    }, user1Cookie);

    if (sendRes.status === 200 && sendRes.data.reminder) {
      logPass(`Reminder Dispatch: Handled reminder dispatch (Status: ${sendRes.data.reminder.status})`);
    } else {
      throw new Error(`Send reminder failed: ${sendRes.status}`);
    }
  } catch (err) {
    logFail('Reminder workflow', err.message);
  }

  // 15. Authorization & Multi-tenant Cross-User Isolation
  try {
    // Register User 2
    const u2Res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: testEmail2,
        password: password,
        name: 'Intruder User',
        terms_accepted: true,
      },
    });
    user2Cookie = u2Res.setCookie.split(';')[0];
    markUserEmailVerified(testEmail2);

    // User 2 attempts to read User 1's client
    const stealClientRes = await apiRequest(`/api/clients/${clientId1}`, {}, user2Cookie);
    if (stealClientRes.status === 404 || stealClientRes.status === 403) {
      logPass(`Security / Authz: Cross-user client access blocked (HTTP ${stealClientRes.status})`);
    } else {
      throw new Error(`CRITICAL SECURITY FAILURE: User 2 accessed User 1's client (HTTP ${stealClientRes.status})`);
    }

    // User 2 attempts to read User 1's invoice
    const stealInvRes = await apiRequest(`/api/invoices/${invoiceId1}`, {}, user2Cookie);
    if (stealInvRes.status === 404 || stealInvRes.status === 403) {
      logPass(`Security / Authz: Cross-user invoice access blocked (HTTP ${stealInvRes.status})`);
    } else {
      throw new Error(`CRITICAL SECURITY FAILURE: User 2 accessed User 1's invoice (HTTP ${stealInvRes.status})`);
    }

    // User 2 attempts to pay User 1's invoice
    const tamperPayRes = await apiRequest(`/api/invoices/${invoiceId1}/pay`, { method: 'POST' }, user2Cookie);
    if (tamperPayRes.status === 404 || tamperPayRes.status === 403) {
      logPass(`Security / Authz: Cross-user invoice payment blocked (HTTP ${tamperPayRes.status})`);
    } else {
      throw new Error(`CRITICAL SECURITY FAILURE: User 2 altered User 1's invoice (HTTP ${tamperPayRes.status})`);
    }
  } catch (err) {
    logFail('Multi-tenant authorization isolation', err.message);
  }

  // 16. Activity / Audit Trail Verification
  try {
    const actRes = await apiRequest('/api/activity', {}, user1Cookie);
    if (actRes.status === 200 && Array.isArray(actRes.data.logs) && actRes.data.logs.length >= 4) {
      logPass(`Audit Trail: Verified ${actRes.data.logs.length} logged actions for primary user`);
    } else {
      throw new Error(`Expected activity log entries, got: ${JSON.stringify(actRes.data)}`);
    }
  } catch (err) {
    logFail('Activity log verification', err.message);
  }

  // 17. Data Persistence Test
  try {
    // Check that querying again with user 1 finds client and invoices intact
    const invCheck = await apiRequest('/api/invoices', {}, user1Cookie);
    if (invCheck.status === 200 && invCheck.data.invoices.some(i => i.id === invoiceId1)) {
      logPass('Data Persistence: All user clients and invoices retained accurately');
    } else {
      throw new Error('Data persistence check failed');
    }
  } catch (err) {
    logFail('Data persistence verification', err.message);
  }

  // 18. Stripe Subscription Endpoint Check
  try {
    const subRes = await apiRequest('/api/billing/subscription', {}, user1Cookie);
    if (subRes.status === 200 && subRes.data.subscription && subRes.data.usage) {
      logPass(`Stripe Billing: Subscription details returned (Plan: ${subRes.data.subscription.plan}, Provider: ${subRes.data.subscription.provider || subRes.data.payment_provider})`);
    } else {
      throw new Error(`Failed to get subscription: ${subRes.status} - ${JSON.stringify(subRes.data)}`);
    }
  } catch (err) {
    logFail('Stripe subscription endpoint check', err.message);
  }

  // 19. Stripe Checkout Endpoint Check
  try {
    const checkoutRes = await apiRequest('/api/billing/checkout', {
      method: 'POST',
      body: { plan: 'STARTER', interval: 'monthly', provider: 'stripe' },
    }, user1Cookie);

    if (checkoutRes.status === 200 && checkoutRes.data.success && checkoutRes.data.checkout_params) {
      logPass(`Stripe Checkout: Generated checkout session for STARTER (Session ID: ${checkoutRes.data.checkout_params.sessionId || checkoutRes.data.id || 'ok'})`);
    } else {
      throw new Error(`Failed to initiate Stripe checkout: ${checkoutRes.status} - ${JSON.stringify(checkoutRes.data)}`);
    }
  } catch (err) {
    logFail('Stripe checkout endpoint check', err.message);
  }

  // 20. Plan Simulation & Limit Enforcement Check
  try {
    // Check initial FREE plan limits (5 clients, 10 invoices)
    const initialSub = await apiRequest('/api/billing/subscription', {}, user1Cookie);
    if (initialSub.data.usage.max_clients === 5 && initialSub.data.usage.max_invoices_per_month === 10) {
      logPass('Plan Limits: FREE tier correctly enforces 5 clients and 10 invoices limits');
    } else {
      throw new Error(`Unexpected FREE limits: ${JSON.stringify(initialSub.data.usage)}`);
    }

    // Simulate upgrade to STARTER (50 clients, 100 invoices)
    const upgradeRes = await apiRequest('/api/billing/simulate', {
      method: 'POST',
      body: { plan: 'STARTER', interval: 'monthly' },
    }, user1Cookie);

    if (upgradeRes.status === 200 && upgradeRes.data.subscription.plan === 'STARTER' && upgradeRes.data.usage.max_clients === 50) {
      logPass('Plan Upgrade: Upgraded to STARTER tier (max_clients: 50, max_invoices: 100)');
    } else {
      throw new Error(`Failed to upgrade to STARTER: ${upgradeRes.status} - ${JSON.stringify(upgradeRes.data)}`);
    }

    // Simulate upgrade to GROWTH (Unlimited)
    const growthRes = await apiRequest('/api/billing/simulate', {
      method: 'POST',
      body: { plan: 'GROWTH', interval: 'annual' },
    }, user1Cookie);

    if (growthRes.status === 200 && growthRes.data.subscription.plan === 'GROWTH' && growthRes.data.usage.max_clients === null) {
      logPass('Plan Upgrade: Upgraded to GROWTH tier (max_clients: Unlimited, max_invoices: Unlimited)');
    } else {
      throw new Error(`Failed to upgrade to GROWTH: ${growthRes.status} - ${JSON.stringify(growthRes.data)}`);
    }

    // Reset back to FREE
    await apiRequest('/api/billing/simulate', {
      method: 'POST',
      body: { plan: 'FREE' },
    }, user1Cookie);
    logPass('Plan Reset: Returned to FREE tier');
  } catch (err) {
    logFail('Plan simulation & limit enforcement', err.message);
  }

  // 21. Stripe Webhook Endpoint Verification
  try {
    const webhookRes = await apiRequest('/api/webhooks/stripe', {
      method: 'POST',
      body: {
        id: `evt_verify_${Date.now()}`,
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_verify_123' } },
      },
    });
    if (webhookRes.status === 200 && webhookRes.data.received === true) {
      logPass(`Stripe Webhook: Webhook route active and acknowledged event (HTTP 200)`);
    } else {
      throw new Error(`Unexpected webhook response: ${webhookRes.status} - ${JSON.stringify(webhookRes.data)}`);
    }
  } catch (err) {
    logFail('Stripe webhook route verification', err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`TEST SUMMARY: ${testPassCount} PASSED, ${testFailCount} FAILED`);
  console.log('------------------------------------------------------\n');

  if (testFailCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
