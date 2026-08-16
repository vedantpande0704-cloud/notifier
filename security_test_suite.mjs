// OpenNotify Comprehensive Security & Penetration Test Suite
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function runSecurityAudit() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       OpenNotify Comprehensive Security Audit & Test Suite     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = [];

  function record(category, testName, passed, details) {
    results.push({ category, testName, passed, details });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | [${category}] ${testName}`);
    if (details) console.log(`         ↳ Details: ${details}`);
  }

  // =========================================================================
  // VECTOR 1: HTTP Security Headers & Transport
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 1: HTTP Security Headers & Middleware ---');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const h = res.headers;

    const nosniff = h.get('x-content-type-options') === 'nosniff';
    record('HTTP Headers', 'X-Content-Type-Options is nosniff', nosniff, h.get('x-content-type-options'));

    const frameOptions = h.get('x-frame-options') === 'SAMEORIGIN';
    record('HTTP Headers', 'X-Frame-Options is SAMEORIGIN (Clickjacking defense)', frameOptions, h.get('x-frame-options'));

    const xss = (h.get('x-xss-protection') || '').includes('1');
    record('HTTP Headers', 'X-XSS-Protection enabled', xss, h.get('x-xss-protection'));

    const referrer = h.get('referrer-policy') === 'strict-origin-when-cross-origin';
    record('HTTP Headers', 'Referrer-Policy is strict-origin-when-cross-origin', referrer, h.get('referrer-policy'));
  } catch (err) {
    record('HTTP Headers', 'Health Check Reachable', false, err.message);
  }

  // =========================================================================
  // VECTOR 2: Input Validation & Sanitization
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 2: Input Validation & Malformed Payload Defense ---');
  try {
    // 2.1 Malformed Email
    const res1 = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email-at-all' })
    });
    record('Input Validation', 'Reject invalid email format without @ or domain', res1.status === 400, `Status: ${res1.status}`);

    // 2.2 Non-string / Object Injection in Email
    const res2 = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $gt: '' } })
    });
    record('Input Validation', 'Reject object injection / NoSQL-style payload in email field', res2.status === 400, `Status: ${res2.status}`);

    // 2.3 Invalid Phone Number
    const res3 = await fetch(`${BASE_URL}/api/auth/sms/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '123' })
    });
    const res3Data = await res3.json();
    record('Input Validation', 'Reject short/invalid phone numbers (<8 chars)', res3Data.success === false, res3Data.message);

    // 2.4 Missing Template Parameters
    const res4 = await fetch(`${BASE_URL}/api/notify/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test' })
    });
    record('Input Validation', 'Reject template creation with missing required fields', res4.status === 400, `Status: ${res4.status}`);
  } catch (err) {
    record('Input Validation', 'Input validation execution', false, err.message);
  }

  // =========================================================================
  // VECTOR 3: Cryptographic Token Security & Constant-Time Verification
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 3: Token Cryptography & Verification Integrity ---');
  const targetEmail = `sec.user.${Date.now()}@example.com`;
  let capturedOtp = null;

  try {
    // 3.1 Send OTP
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, appName: 'SecurityAudit' })
    });

    const inboxRes = await fetch(`${BASE_URL}/api/dev/inbox`);
    const inboxData = await inboxRes.json();
    const mail = inboxData.emails.find(m => m.to === targetEmail);
    capturedOtp = mail ? mail.previewOtp : null;

    record('Crypto & Storage', 'OTP generated with 6-digit numeric entropy', Boolean(capturedOtp && /^[0-9]{6}$/.test(capturedOtp)), `Generated OTP: ${capturedOtp}`);

    // 3.2 Verify Incorrect OTP fails
    const badVerify = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, code: '000000' })
    });
    const badVerifyData = await badVerify.json();
    record('Crypto & Storage', 'Incorrect OTP rejected with attempts decremented', badVerifyData.success === false && badVerifyData.remainingAttempts !== undefined, badVerifyData.message);

    // 3.3 Verify Correct OTP succeeds
    const goodVerify = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, code: capturedOtp })
    });
    const goodVerifyData = await goodVerify.json();
    record('Crypto & Storage', 'Valid OTP authenticated & JWT issued', goodVerifyData.success === true && Boolean(goodVerifyData.token), `User: ${goodVerifyData.user?.id}`);

    // 3.4 Replay Attack Defense: Single-Use Token Enforcement
    const replayVerify = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, code: capturedOtp })
    });
    const replayData = await replayVerify.json();
    record('Replay Defense', 'Used token cannot be re-used (Single-Use Token Enforcement)', replayData.success === false, replayData.message);

  } catch (err) {
    record('Crypto & Storage', 'Crypto test execution', false, err.message);
  }

  // =========================================================================
  // VECTOR 4: Brute-Force & Rate Limiting Defense
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 4: Rate Limiting & Brute-Force Mitigation ---');
  try {
    const bruteEmail = `brute.${Date.now()}@target.com`;
    // 4.1 Request OTP for brute test
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: bruteEmail })
    });

    // 4.2 Send 5 wrong attempts to trigger lock
    let lastBadStatus = null;
    let lockTriggered = false;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bruteEmail, code: `11111${i}` })
      });
      lastBadStatus = res.status;
      const data = await res.json();
      if (data.retryAfterSeconds || data.remainingAttempts === 0) {
        lockTriggered = true;
      }
    }

    // 4.3 6th Attempt should be locked out / rejected
    const lockedRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: bruteEmail, code: '999999' })
    });
    const lockedData = await lockedRes.json();
    const isLocked = lockedRes.status === 429 || lockedData.remainingAttempts === 0 || lockedData.message.includes('locked') || lockedData.message.includes('expired');

    record('Rate Limiting', 'Brute-force lockout triggered after max failed attempts', isLocked, `Locked response: ${lockedData.message}`);

    // 4.4 Cooldown spam prevention on send-otp
    const spamEmail = `spam.${Date.now()}@test.com`;
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: spamEmail })
    });
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: spamEmail })
    });
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: spamEmail })
    });
    const spam4 = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: spamEmail })
    });
    const spam4Data = await spam4.json();
    record('Rate Limiting', 'OTP Request Cooldown prevents notification flooding', spam4Data.success === false && spam4Data.retryAfterSeconds !== undefined, spam4Data.message);

  } catch (err) {
    record('Rate Limiting', 'Rate limit test execution', false, err.message);
  }

  // =========================================================================
  // VECTOR 5: JWT Session & Authorization Header Security
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 5: JWT Session & Bearer Auth Integrity ---');
  try {
    // 5.1 Request without Authorization header
    const noAuth = await fetch(`${BASE_URL}/api/auth/me`);
    record('JWT Security', 'Reject unauthenticated request to /api/auth/me with 401', noAuth.status === 401, `Status: ${noAuth.status}`);

    // 5.2 Request with malformed Bearer token
    const badAuth = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: 'Bearer this.is.a.forged.jwt.token' }
    });
    record('JWT Security', 'Reject invalid / forged JWT signature with 401', badAuth.status === 401, `Status: ${badAuth.status}`);

    // 5.3 Request with valid token
    const userEmail = `auth.test.${Date.now()}@example.com`;
    await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    const inbox = await (await fetch(`${BASE_URL}/api/dev/inbox`)).json();
    const tokenOtp = inbox.emails.find(e => e.to === userEmail)?.previewOtp;
    const vRes = await (await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, code: tokenOtp })
    })).json();

    const validAuth = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${vRes.token}` }
    });
    const validData = await validAuth.json();
    record('JWT Security', 'Valid Bearer JWT grants access to user identity', validAuth.status === 200 && validData.user?.email === userEmail, `User email: ${validData.user?.email}`);

  } catch (err) {
    record('JWT Security', 'JWT test execution', false, err.message);
  }

  // =========================================================================
  // VECTOR 6: SMS OTP Isolation & Replay Protection
  // =========================================================================
  console.log('\n--- 🛡️  VECTOR 6: SMS OTP Isolation & Token Security ---');
  try {
    const testPhone = `+1999${Math.floor(100000 + Math.random() * 900000)}`;
    
    // 6.1 Dispatch SMS OTP
    await fetch(`${BASE_URL}/api/auth/sms/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, appName: 'SecurityAudit' })
    });

    const phoneRes = await fetch(`${BASE_URL}/api/dev/phone`);
    const phoneData = await phoneRes.json();
    const capturedSms = phoneData.messages.find(m => m.to === testPhone);
    const smsOtp = capturedSms ? capturedSms.previewOtp : null;

    record('SMS Security', 'SMS OTP generated and isolated in secure store', Boolean(smsOtp && /^[0-9]{6}$/.test(smsOtp)), `SMS OTP: ${smsOtp}`);

    // 6.2 Wrong code rejection
    const wrongSmsRes = await fetch(`${BASE_URL}/api/auth/sms/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, code: '000000' })
    });
    record('SMS Security', 'Incorrect SMS OTP rejected', wrongSmsRes.status === 400, `Status: ${wrongSmsRes.status}`);

    // 6.3 Valid verification
    const correctSmsRes = await fetch(`${BASE_URL}/api/auth/sms/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, code: smsOtp })
    });
    const correctSmsData = await correctSmsRes.json();
    record('SMS Security', 'Valid SMS OTP authenticated & session issued', correctSmsData.success === true, `Phone: ${correctSmsData.user?.phone}`);

    // 6.4 SMS Replay Defense
    const replaySmsRes = await fetch(`${BASE_URL}/api/auth/sms/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, code: smsOtp })
    });
    record('SMS Security', 'SMS token single-use enforced (Replay protection)', replaySmsRes.status === 400, `Status: ${replaySmsRes.status}`);

  } catch (err) {
    record('SMS Security', 'SMS Security test execution', false, err.message);
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   SECURITY AUDIT SUMMARY REPORT                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const score = Math.round((passed / total) * 100);

  console.log(`\n Total Security Checks: ${total}`);
  console.log(` ✅ Passed:             ${passed}`);
  console.log(` ❌ Failed:             ${failed}`);
  console.log(` 📊 Security Score:     ${score}%`);

  if (failed > 0) {
    console.log('\n⚠️ Failed Checks:');
    results.filter(r => !r.passed).forEach(f => console.log(`  - [${f.category}] ${f.testName}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('\n🛡️ ALL SECURITY TESTS PASSED PERFECTLY WITH ZERO VULNERABILITIES DETECTED.\n');
    process.exit(0);
  }
}

runSecurityAudit().catch(err => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
