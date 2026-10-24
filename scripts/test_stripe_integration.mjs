// scripts/test_stripe_integration.mjs
// Verifies Stripe configurable billing and webhook handling

import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

async function runStripeTests() {
  console.log('======================================================');
  console.log('       RECEIPTO STRIPE INTEGRATION TEST SUITE');
  console.log('======================================================');

  // 1. Register test user
  const email = `stripe_test_${Date.now()}@receipto.test`;
  const password = process.env.TEST_PASSWORD || 'TestStripePassword123!';
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      name: 'Stripe Tester',
      business_name: 'Stripe Test Corp',
      terms_accepted: true,
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Registration successful');
  const token = regRes.data.token;
  console.log('✓ PASS: Registered Stripe test user');

  // 2. Query billing subscription details
  const subRes = await request('/api/billing/subscription', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(subRes.status, 200, 'Subscription route accessible');
  assert.strictEqual(typeof subRes.data.payment_provider, 'string', 'Payment provider present');
  assert.strictEqual(typeof subRes.data.stripe_configured, 'boolean', 'Stripe configuration flag present');
  console.log('✓ PASS: Subscription endpoint exposes payment provider and Stripe status');

  // 3. Initiate Stripe checkout
  const checkoutRes = await request('/api/billing/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      plan: 'STARTER',
      interval: 'monthly',
      provider: 'stripe',
    }),
  });
  assert.strictEqual(checkoutRes.status, 200, 'Stripe checkout route accessible');
  assert.strictEqual(checkoutRes.data.provider, 'stripe', 'Provider confirmed as Stripe');
  assert.strictEqual(checkoutRes.data.plan, 'STARTER', 'Plan is STARTER');
  assert.strictEqual(checkoutRes.data.interval, 'monthly', 'Interval is monthly');
  assert.strictEqual(typeof checkoutRes.data.checkout_params, 'object', 'Checkout params provided');
  assert.ok(checkoutRes.data.checkout_params.successUrl.includes('provider=stripe'), 'Success URL configured');
  assert.ok(checkoutRes.data.checkout_params.cancelUrl.includes('provider=stripe'), 'Cancel URL configured');
  console.log('✓ PASS: Generated Stripe checkout session parameters');

  // 4. Initiate Stripe Growth Annual checkout
  const growthRes = await request('/api/billing/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      plan: 'GROWTH',
      interval: 'annual',
      provider: 'stripe',
    }),
  });
  assert.strictEqual(growthRes.status, 200);
  assert.strictEqual(growthRes.data.plan, 'GROWTH');
  assert.strictEqual(growthRes.data.interval, 'annual');
  console.log('✓ PASS: Generated Stripe Growth Annual checkout parameters');

  // 5. Test Stripe Webhook endpoint
  const webhookRes = await request('/api/webhooks/stripe', {
    method: 'POST',
    body: JSON.stringify({
      id: `evt_test_${Date.now()}`,
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_test_123' } },
    }),
  });
  assert.strictEqual(webhookRes.status, 200, 'Stripe webhook received');
  assert.strictEqual(webhookRes.data.received, true, 'Stripe webhook acknowledged');
  console.log('✓ PASS: Stripe webhook route active and processing');

  console.log('------------------------------------------------------');
  console.log('ALL STRIPE TESTS PASSED SUCCESSFULLY (5/5)');
  console.log('------------------------------------------------------');
}

runStripeTests().catch((err) => {
  console.error('Stripe test failed:', err);
  process.exit(1);
});
