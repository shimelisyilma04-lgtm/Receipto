// scripts/verify_owner_demo.mjs
// Verifies Owner Demo Access & Atomic Plan Limit Enforcement

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const OVERRIDE_FILE = path.join(process.cwd(), 'data', 'owner_override.json');

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

async function runOwnerDemoTests() {
  console.log('--- RUNNING OWNER DEMO & ATOMIC LIMIT TESTS ---');

  // 1. Create a regular (non-owner) user
  const testPassword = process.env.TEST_PASSWORD || 'TestOwnerPassword123!';
  const regularEmail = `regular_${Date.now()}@receipto.test`;
  const regUserRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: regularEmail,
      password: testPassword,
      name: 'Regular User',
      business_name: 'Regular Co',
      terms_accepted: true,
    }),
  });
  assert.strictEqual(regUserRes.status, 201, 'Regular user registered');
  const regToken = regUserRes.data.token;

  // Check regular user subscription
  const regSubRes = await request('/api/billing/subscription', {
    headers: { Authorization: `Bearer ${regToken}` },
  });
  assert.strictEqual(regSubRes.status, 200);
  assert.strictEqual(regSubRes.data.is_owner_demo, false, 'Regular user must NOT be owner demo');
  assert.notStrictEqual(regSubRes.data.access_mode, 'owner_demo', 'Regular user cannot have owner_demo access mode');
  console.log('✓ PASS: Regular user is not owner demo');

  // Regular user trying to switch owner demo plan must be blocked with 403
  const forbiddenRes = await request('/api/billing/owner-demo/switch-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regToken}` },
    body: JSON.stringify({ plan: 'GROWTH' }),
  });
  assert.strictEqual(forbiddenRes.status, 403, 'Non-owner blocked from owner demo switch');
  console.log('✓ PASS: Non-owner blocked from owner demo plan switch (HTTP 403)');

  // 2. Test verified owner demo account
  const testOwnerEmail = `owner_verified_${Date.now()}@receipto.test`;
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify({ email: testOwnerEmail }));

  const ownerUserRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: testOwnerEmail,
      password: testPassword,
      name: 'Receipto Owner',
      business_name: 'Receipto Corp',
      terms_accepted: true,
    }),
  });
  assert.strictEqual(ownerUserRes.status, 201, 'Owner user registered');
  const ownerToken = ownerUserRes.data.token;
  let otp = ownerUserRes.data.dev_preview_otp;

  // In production mode, OTP is not returned over the wire; recover from local store challenge
  if (!otp && fs.existsSync(path.join(process.cwd(), 'data', 'receipto_db.json'))) {
    try {
      const dbData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'receipto_db.json'), 'utf8'));
      const verif = dbData.email_verifications?.find(v => v.email === testOwnerEmail && v.used_at === null);
      if (verif) {
        for (let i = 100000; i <= 999999; i++) {
          const candidate = String(i);
          const candidateHash = crypto.createHash('sha256').update(`${verif.salt}:${candidate}`).digest('hex');
          if (crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(verif.otp_hash, 'hex'))) {
            otp = candidate;
            break;
          }
        }
      }
    } catch {}
  }

  // Verify email for owner
  const verifRes = await request('/api/auth/verify-email', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ email: testOwnerEmail, code: otp }),
  });
  assert.strictEqual(verifRes.status, 200, 'Owner email verified');

  // Re-login to get refreshed token
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testOwnerEmail, password: testPassword }),
  });
  assert.strictEqual(loginRes.status, 200, 'Owner login successful');
  const verifiedOwnerToken = loginRes.data.token;

  // Check owner subscription
  const ownerSubRes = await request('/api/billing/subscription', {
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
  });
  assert.strictEqual(ownerSubRes.status, 200);
  assert.strictEqual(ownerSubRes.data.is_owner_demo, true, 'Owner user identified as owner demo');
  assert.strictEqual(ownerSubRes.data.access_mode, 'owner_demo');
  console.log('✓ PASS: Owner account receives owner_demo access mode');

  // Test Owner Demo plan switching: Switch to STARTER
  const switchStarterRes = await request('/api/billing/owner-demo/switch-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({ plan: 'STARTER' }),
  });
  assert.strictEqual(switchStarterRes.status, 200);
  assert.strictEqual(switchStarterRes.data.subscription.plan, 'STARTER');
  assert.strictEqual(switchStarterRes.data.usage.max_clients, 50);
  assert.strictEqual(switchStarterRes.data.usage.max_invoices_per_month, 100);
  console.log('✓ PASS: Owner successfully switched to STARTER tier (max_clients: 50)');

  // Switch to GROWTH
  const switchGrowthRes = await request('/api/billing/owner-demo/switch-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({ plan: 'GROWTH' }),
  });
  assert.strictEqual(switchGrowthRes.status, 200);
  assert.strictEqual(switchGrowthRes.data.subscription.plan, 'GROWTH');
  assert.strictEqual(switchGrowthRes.data.usage.max_clients, null); // Unlimited
  assert.strictEqual(switchGrowthRes.data.usage.max_invoices_per_month, null); // Unlimited
  console.log('✓ PASS: Owner successfully switched to GROWTH tier (Unlimited clients & invoices)');

  // Switch back to FREE
  const switchFreeRes = await request('/api/billing/owner-demo/switch-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({ plan: 'FREE' }),
  });
  assert.strictEqual(switchFreeRes.status, 200);
  assert.strictEqual(switchFreeRes.data.subscription.plan, 'FREE');
  assert.strictEqual(switchFreeRes.data.usage.max_clients, 5);
  assert.strictEqual(switchFreeRes.data.usage.max_invoices_per_month, 10);
  console.log('✓ PASS: Owner successfully switched to FREE tier (max_clients: 5, max_invoices: 10)');

  // 3. Test Atomic Plan Limit Enforcement on FREE tier
  console.log('Testing atomic plan limit enforcement on FREE tier...');
  // Create 5 clients
  for (let i = 1; i <= 5; i++) {
    const cRes = await request('/api/clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
      body: JSON.stringify({
        name: `Owner Client ${i}`,
        email: `client${i}@example.com`,
      }),
    });
    assert.strictEqual(cRes.status, 201, `Client ${i} created`);
  }

  // Attempting to create the 6th client on FREE plan MUST return 403
  const c6Res = await request('/api/clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({
      name: `Owner Client 6`,
      email: `client6@example.com`,
    }),
  });
  assert.strictEqual(c6Res.status, 403, '6th client correctly blocked by atomic plan limit');
  assert.strictEqual(c6Res.data.code, 'PLAN_LIMIT_REACHED');
  console.log('✓ PASS: 6th client rejected with HTTP 403 PLAN_LIMIT_REACHED');

  // Now switch to STARTER and verify the 6th client can now be created
  await request('/api/billing/owner-demo/switch-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({ plan: 'STARTER' }),
  });

  const c6AfterUpgrade = await request('/api/clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${verifiedOwnerToken}` },
    body: JSON.stringify({
      name: `Owner Client 6`,
      email: `client6@example.com`,
    }),
  });
  assert.strictEqual(c6AfterUpgrade.status, 201, '6th client created immediately after tier switch');
  console.log('✓ PASS: 6th client successfully created after switching to STARTER tier');

  console.log('\nALL OWNER DEMO & ATOMIC LIMIT TESTS PASSED SUCCESSFULLY!');
}

runOwnerDemoTests()
  .catch((err) => {
    console.error('Test failure:', err);
    process.exit(1);
  })
  .finally(() => {
    if (fs.existsSync(OVERRIDE_FILE)) {
      try { fs.unlinkSync(OVERRIDE_FILE); } catch {}
    }
  });
