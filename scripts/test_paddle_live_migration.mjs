import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function runLiveMigrationTests() {
  console.log('======================================================');
  console.log('RECEIPTO PADDLE LIVE MIGRATION VERIFICATION SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`\x1b[32m✓ PASS:\x1b[0m ${name}`);
      passed++;
    } else {
      console.error(`\x1b[31m✗ FAIL:\x1b[0m ${name}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Check live legal pages resolution
  try {
    const termsRes = await fetch(`${BASE_URL}/terms`);
    assert('/terms endpoint returns HTTP 200', termsRes.status === 200);

    const privacyRes = await fetch(`${BASE_URL}/privacy`);
    assert('/privacy endpoint returns HTTP 200', privacyRes.status === 200);

    const refundRes = await fetch(`${BASE_URL}/refund-policy`);
    assert('/refund-policy endpoint returns HTTP 200', refundRes.status === 200);
  } catch (err) {
    assert('Legal pages reachable', false, err.message);
  }

  // 2. Check Paddle IP allowlisting endpoint directly from Paddle
  let officialIps = [];
  try {
    const paddleIpsRes = await fetch('https://api.paddle.com/ips');
    const paddleIpsData = await paddleIpsRes.json();
    officialIps = paddleIpsData?.data?.ipv4_cidrs || [];
    assert(
      'Paddle official live IPs endpoint reachable',
      paddleIpsRes.ok && Array.isArray(officialIps) && officialIps.length > 0,
      `Found ${officialIps.length} CIDRs`
    );
  } catch (err) {
    assert('Fetch https://api.paddle.com/ips', false, err.message);
  }

  // 3. Webhook security tests:
  // 3a. Unauthorized non-Paddle IP is rejected with HTTP 403 in production
  try {
    const unauthIpRes = await fetch(`${BASE_URL}/api/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.1', // Non-Paddle IP
      },
      body: JSON.stringify({
        event_id: 'evt_test_unauth_ip',
        event_type: 'subscription.created',
        data: {},
      }),
    });
    assert(
      'Unauthorized non-Paddle IP rejected with HTTP 403',
      unauthIpRes.status === 403
    );
  } catch (err) {
    assert('Unauthorized IP check', false, err.message);
  }

  // 3b. Request from official Paddle IP without valid signature returns HTTP 400
  try {
    const paddleIp = officialIps.length > 0 ? officialIps[0].split('/')[0] : '34.194.127.46';
    const localWebhookRes = await fetch(`${BASE_URL}/api/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': paddleIp,
      },
      body: JSON.stringify({
        event_id: 'evt_test_local',
        event_type: 'subscription.created',
        data: {},
      }),
    });
    assert(
      'Paddle IP without valid signature rejected with HTTP 400',
      localWebhookRes.status === 400
    );
  } catch (err) {
    assert('Webhook endpoint alive', false, err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveMigrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
