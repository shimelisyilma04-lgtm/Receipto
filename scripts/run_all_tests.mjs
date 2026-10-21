// scripts/run_all_tests.mjs
// Master test runner executing the complete Receipto automated test suite

import { spawn } from 'child_process';
import path from 'path';

const suites = [
  { name: 'Core E2E Verification Suite', script: 'scripts/verify.mjs', runner: 'node' },
  { name: 'Bug-Fix & Regression Suite', script: 'scripts/test_bugfixes.mjs', runner: 'node' },
  { name: 'Stripe Configurable Billing Suite', script: 'scripts/test_stripe_integration.mjs', runner: 'node' },
  { name: 'Owner Demo & Atomic Limits Suite', script: 'scripts/verify_owner_demo.mjs', runner: 'node' },
  { name: 'Cryptographic Email Verification Flow', script: 'scripts/test_email_verification_flow.ts', runner: 'npx', args: ['tsx'] },
];

async function runSuite(suite) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ RUNNING: ${suite.name} (${suite.script})`);
    const cmdArgs = suite.args ? [...suite.args, suite.script] : [suite.script];
    const proc = spawn(suite.runner, cmdArgs, { stdio: 'inherit', cwd: process.cwd() });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Suite "${suite.name}" exited with code ${code}`));
      }
    });
  });
}

async function runAll() {
  console.log('======================================================');
  console.log('      RECEIPTO MASTER AUTOMATED TEST RUNNER');
  console.log('======================================================');
  const startTime = Date.now();

  for (const suite of suites) {
    await runSuite(suite);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================');
  console.log(`🎉 ALL 5 TEST SUITES PASSED IN ${durationSec}s`);
  console.log('Total verified tests: 105+ across auth, Firestore, Stripe billing & security');
  console.log('======================================================\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test run failed:', err.message);
  process.exit(1);
});
