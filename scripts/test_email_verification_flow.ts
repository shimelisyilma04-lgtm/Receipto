/**
 * Comprehensive End-to-End Verification Test Suite
 * Tests all requirements of the registration and email verification system.
 */

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    results.push({ name, passed: true });
  } else {
    console.error(`  ❌ FAIL: ${name} - ${details || 'Assertion failed'}`);
    results.push({ name, passed: false, details });
  }
}

async function run() {
  console.log('\n===============================================================');
  console.log('STARTING RECEIPTO EMAIL VERIFICATION E2E TEST SUITE');
  console.log('===============================================================\n');

  const testEmail = `test_pilot_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testName = 'Jane Production';
  let cookieHeader = '';

  // 0. Purge if exists
  await fetch(`${BASE_URL}/api/test/purge-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });

  // -----------------------------------------------------------------
  // 1. REGISTRATION FORM VALIDATION TESTS
  // -----------------------------------------------------------------
  console.log('\n--- 1. Testing Registration Form Validation ---');

  // 1.1 Missing Name
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        confirm_password: testPassword,
        name: '',
        terms_accepted: true,
      }),
    });
    const data = await res.json();
    assert(res.status === 400 && data.error.includes('name'), 'Reject empty name', data.error);
  }

  // 1.2 Invalid Email
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email-no-at',
        password: testPassword,
        confirm_password: testPassword,
        name: testName,
        terms_accepted: true,
      }),
    });
    const data = await res.json();
    assert(res.status === 400 && data.error.includes('email'), 'Reject invalid email format', data.error);
  }

  // 1.3 Short Password (<8 chars)
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'short',
        confirm_password: 'short',
        name: testName,
        terms_accepted: true,
      }),
    });
    const data = await res.json();
    assert(res.status === 400 && data.error.includes('8 characters'), 'Reject short password (<8)', data.error);
  }

  // 1.4 Password Mismatch
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        confirm_password: 'DifferentPassword123!',
        name: testName,
        terms_accepted: true,
      }),
    });
    const data = await res.json();
    assert(res.status === 400 && data.error.includes('match'), 'Reject password mismatch', data.error);
  }

  // 1.5 Terms & Conditions not accepted (false)
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        confirm_password: testPassword,
        name: testName,
        terms_accepted: false,
      }),
    });
    const data = await res.json();
    assert(res.status === 400 && data.error.includes('Terms and Conditions'), 'Reject registration without Terms agreement', data.error);
  }

  // -----------------------------------------------------------------
  // 2. VALID REGISTRATION & UNVERIFIED ACCOUNT STATE
  // -----------------------------------------------------------------
  console.log('\n--- 2. Testing Valid Registration & Unverified State ---');

  let registeredUserId = '';
  let sessionToken = '';
  {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        confirm_password: testPassword,
        name: testName,
        business_name: 'Acme Test Corp',
        terms_accepted: true,
      }),
    });

    const cookies = res.headers.get('set-cookie');
    if (cookies) {
      cookieHeader = cookies.split(';')[0];
    }

    const data = await res.json();
    registeredUserId = data.user?.id;
    sessionToken = data.token || '';
    assert(res.status === 201, 'HTTP 201 Created on valid registration');
    assert(data.requires_verification === true, 'Response indicates requires_verification = true');
    assert(data.user?.email_verified === false, 'New user email_verified is false initially');
    assert(!('otp' in data || 'code' in data), 'SECURITY: Plaintext OTP is NEVER returned in API response');
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
    Authorization: `Bearer ${sessionToken}`,
  };

  // -----------------------------------------------------------------
  // 3. ACCESS CONTROL FOR UNVERIFIED ACCOUNT
  // -----------------------------------------------------------------
  console.log('\n--- 3. Testing Middleware Access Restriction (Unverified Account) ---');

  // 3.1 Attempt to access /api/clients
  {
    const res = await fetch(`${BASE_URL}/api/clients`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(res.status === 403, 'HTTP 403 Forbidden for unverified user accessing /api/clients');
    assert(data.requires_verification === true, 'Response flags requires_verification = true');
  }

  // 3.2 Attempt to access /api/invoices
  {
    const res = await fetch(`${BASE_URL}/api/invoices`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(res.status === 403, 'HTTP 403 Forbidden for unverified user accessing /api/invoices');
  }

  // 3.3 Attempt to access /api/dashboard
  {
    const res = await fetch(`${BASE_URL}/api/dashboard`, {
      headers: authHeaders,
    });
    assert(res.status === 403, 'HTTP 403 Forbidden for unverified user accessing /api/dashboard');
  }

  // -----------------------------------------------------------------
  // 4. OTP CODE VERIFICATION RULES & ATTEMPT RATE LIMITING
  // -----------------------------------------------------------------
  console.log('\n--- 4. Testing OTP Code Verification Rules ---');

  // 4.1 Invalid code length/format (e.g. 5 digits or non-digits)
  {
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: '12345' }),
    });
    assert(res.status === 400, 'Reject non-6-digit code format');
  }

  // 4.2 Incorrect 6-digit OTP code
  {
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: '000000' }),
    });
    const data = await res.json();
    assert(res.status === 400, 'Reject incorrect code with HTTP 400');
    assert(data.reason === 'invalid_code', 'Reason is invalid_code', `Got: ${data.reason}`);
    assert(typeof data.attempts_remaining === 'number', 'Reports attempts_remaining', `Remaining: ${data.attempts_remaining}`);
  }

  // -----------------------------------------------------------------
  // 5. RESEND COOLDOWN ENFORCEMENT
  // -----------------------------------------------------------------
  console.log('\n--- 5. Testing Resend Cooldown Enforcement ---');
  {
    // Try to resend immediately (should be blocked by 60s cooldown)
    const res = await fetch(`${BASE_URL}/api/auth/resend-code`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: testEmail }),
    });
    const data = await res.json();
    assert(res.status === 429, 'HTTP 429 on rapid resend request within 60s cooldown');
    assert(data.cooldown_remaining > 0, 'Reports cooldown_remaining in seconds');
  }

  // -----------------------------------------------------------------
  // 6. CHANGE REGISTRATION EMAIL OPTION
  // -----------------------------------------------------------------
  console.log('\n--- 6. Testing Change Registration Email Option ---');
  const correctedEmail = `corrected_${Date.now()}@example.com`;
  {
    const res = await fetch(`${BASE_URL}/api/auth/change-registration-email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ new_email: correctedEmail }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success === true, 'Successfully change unverified registration email');
    assert(data.email === correctedEmail, 'Returns updated email address');
  }

  // -----------------------------------------------------------------
  // 7. REAL OTP RETRIEVAL (FROM SECURE STORAGE HASH CHECK) & SUCCESSFUL VERIFICATION
  // -----------------------------------------------------------------
  console.log('\n--- 7. Testing Valid Verification Flow ---');

  // Let's import the database and verification helper directly in this script to verify the crypto hash
  const { getLatestEmailVerification, reloadLocalStore } = await import('../server/db.js');
  const { verifyOTPHash } = await import('../server/verification.js');

  reloadLocalStore();
  const verifRecord = await getLatestEmailVerification(registeredUserId);
  assert(verifRecord !== null, 'Verification record found in persistent store');
  assert(Boolean(verifRecord?.otp_hash), 'OTP is stored exclusively as cryptographic hash');
  assert(!('otp' in (verifRecord || {})), 'Plaintext OTP is never stored in DB column');

  // We can find the matching 6-digit code by testing which 6-digit code matches the salt/hash
  console.log('  Testing timing-safe hash match across challenge space...');
  let matchingOtp = '';
  for (let c = 0; c <= 999999; c++) {
    const candidate = c.toString().padStart(6, '0');
    if (verifyOTPHash(candidate, verifRecord!.otp_hash, verifRecord!.salt)) {
      matchingOtp = candidate;
      break;
    }
  }

  assert(matchingOtp.length === 6, 'Successfully recovered issued challenge via timing-safe cryptographic verification');

  // Now submit the correct code to the API
  {
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: matchingOtp }),
    });

    const data = await res.json();
    if (res.status !== 200) {
      console.log('    [DEBUG] verify-email response status:', res.status, 'body:', data);
    }
    assert(res.status === 200, 'HTTP 200 OK on correct OTP entry', JSON.stringify(data));
    assert(data.success === true, 'Verification returns success: true');
    assert(data.user?.email_verified === true, 'User returned with email_verified = true');

    if (data.token) {
      sessionToken = data.token;
      authHeaders.Authorization = `Bearer ${sessionToken}`;
    }
    const cookies = res.headers.get('set-cookie');
    if (cookies) {
      cookieHeader = cookies.split(';')[0];
      authHeaders.Cookie = cookieHeader;
    }
  }

  // -----------------------------------------------------------------
  // 8. ONE-TIME USE ENFORCEMENT (REPLAY ATTACK PREVENTION)
  // -----------------------------------------------------------------
  console.log('\n--- 8. Testing One-Time Use (Replay Attack Prevention) ---');
  {
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: matchingOtp }),
    });
    assert(res.status === 400, 'Re-submitting already-used OTP code is rejected (one-time use)');
  }

  // -----------------------------------------------------------------
  // 9. VERIFIED USER ACCESS RESTORATION
  // -----------------------------------------------------------------
  console.log('\n--- 9. Testing Verified User Access Restoration ---');

  // 9.1 Access /api/clients as verified user
  {
    const res = await fetch(`${BASE_URL}/api/clients`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(res.status === 200, 'Verified user successfully granted access to /api/clients');
    assert(Array.isArray(data.clients), 'Returns client list successfully');
  }

  // 9.2 Create a client as verified user
  {
    const res = await fetch(`${BASE_URL}/api/clients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Verified Client Co',
        email: 'client@example.com',
      }),
    });
    const data = await res.json();
    assert(res.status === 201, 'Verified user successfully created client');
  }

  // 9.3 Access /api/invoices as verified user
  {
    const res = await fetch(`${BASE_URL}/api/invoices`, {
      headers: authHeaders,
    });
    assert(res.status === 200, 'Verified user successfully granted access to /api/invoices');
  }

  // -----------------------------------------------------------------
  // 10. UNVERIFIED LOGIN REDIRECTION CHECK
  // -----------------------------------------------------------------
  console.log('\n--- 10. Testing Login Behavior for Unverified vs Verified ---');

  // Create another unverified user
  const unverifiedEmail = `unverified_${Date.now()}@example.com`;
  {
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: unverifiedEmail,
        password: testPassword,
        confirm_password: testPassword,
        name: 'Unverified Person',
        terms_accepted: true,
      }),
    });

    // Attempt to log in with unverified account
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: unverifiedEmail,
        password: testPassword,
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'Login response HTTP 200');
    assert(loginData.requires_verification === true, 'Login response halts at requires_verification = true');
    assert(loginData.user?.email_verified === false, 'User status remains email_verified = false');
  }

  // Clean up test accounts
  console.log('\n--- 11. Cleanup Test Accounts ---');
  await fetch(`${BASE_URL}/api/test/purge-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correctedEmail }),
  });
  await fetch(`${BASE_URL}/api/test/purge-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverifiedEmail }),
  });
  console.log('  Cleaned up test users.');

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
