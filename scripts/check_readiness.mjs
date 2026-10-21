#!/usr/bin/env node

/**
 * Receipto Production Readiness CLI Checker
 * Validates all required environment variables and configuration parameters
 * for production deployment without exposing sensitive secrets.
 */

let evaluateProductionReadiness;
try {
  const mod = await import('../server/readiness.js').catch(() => import('../server/readiness.ts'));
  evaluateProductionReadiness = mod.evaluateProductionReadiness;
} catch (e) {
  console.error('To run the readiness check with TypeScript, please run: npm run readiness (or npx tsx scripts/check_readiness.mjs)');
  process.exit(1);
}

console.log('\n======================================================');
console.log('       RECEIPTO PRODUCTION READINESS CHECKER');
console.log('======================================================\n');

const report = evaluateProductionReadiness();

console.log(`Target Environment: ${report.environment.toUpperCase()}`);
console.log(`Checked At:         ${report.timestamp}`);
console.log(`Overall Ready:      ${report.overall_ready ? '✅ YES' : '❌ NO'}\n`);

console.log('------------------------------------------------------');
console.log(
  'KEY'.padEnd(35) +
  'STATUS'.padEnd(16) +
  'CATEGORY'
);
console.log('------------------------------------------------------');

for (const check of report.checks) {
  let statusIcon = '⚠️';
  if (check.status === 'CONFIGURED') statusIcon = '✅';
  else if (check.status === 'MISSING') statusIcon = '❌';
  else if (check.status === 'INVALID FORMAT') statusIcon = '🚫';

  console.log(
    check.key.padEnd(35) +
    `${statusIcon} ${check.status}`.padEnd(16) +
    check.category
  );
  if (check.recommendation && check.status !== 'CONFIGURED') {
    console.log(`   ↳ Advice: ${check.recommendation}`);
  }
}

console.log('\n------------------------------------------------------');
console.log(`Summary: ${report.summary.configured}/${report.summary.total} Configured, ${report.summary.missing} Missing, ${report.summary.invalid_format} Invalid Format`);
console.log('------------------------------------------------------\n');

if (report.overall_ready) {
  console.log('🚀 All required production configurations are present and valid!\n');
  process.exit(0);
} else {
  console.log('⚠️ Some production environment configurations are pending.');
  console.log('Check .env or deployment settings against .env.example before launching to real users.\n');
  process.exit(0);
}
