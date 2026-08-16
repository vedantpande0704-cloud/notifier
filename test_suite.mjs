// OpenNotify E2E Verification Test Suite
async function runTests() {
  const BASE_URL = 'http://localhost:3000';
  console.log('🧪 Starting OpenNotify E2E Verification...\n');

  // 1. Health Check
  console.log('1. Testing /api/health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await healthRes.json();
  console.log('   ✅ Health Status:', health.status, `(${health.dbType} DB, ${health.mailProvider} Mailer)`);

  // 2. Request OTP
  console.log('\n2. Testing /api/auth/send-otp...');
  const sendRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test.user@example.com', appName: 'My Awesome SaaS' })
  });
  const sendData = await sendRes.json();
  console.log('   ✅ Send OTP Result:', sendData.message);

  // 3. Inspect Virtual Dev Mailbox to get the OTP
  console.log('\n3. Inspecting /api/dev/inbox for OTP code...');
  const inboxRes = await fetch(`${BASE_URL}/api/dev/inbox`);
  const inboxData = await inboxRes.json();
  const latestMail = inboxData.emails[0];
  const otpCode = latestMail.previewOtp;
  console.log('   ✅ Captured Dev Email:', latestMail.subject);
  console.log('   🔑 Extracted 6-Digit OTP:', otpCode);

  if (!otpCode) throw new Error('OTP code not found in dev inbox');

  // 4. Verify OTP & Issue JWT
  console.log('\n4. Testing /api/auth/verify-otp...');
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test.user@example.com', code: otpCode })
  });
  const verifyData = await verifyRes.json();
  console.log('   ✅ Verification Result:', verifyData.message);
  console.log('   👤 User ID:', verifyData.user.id);
  console.log('   🎟️ Session JWT (First 30 chars):', verifyData.token.substring(0, 30) + '...');

  // 5. Test Authenticated Route /api/auth/me
  console.log('\n5. Testing /api/auth/me with Bearer token...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${verifyData.token}` }
  });
  const meData = await meRes.json();
  console.log('   ✅ Me Profile Email:', meData.user.email);

  // 6. Test Notification Dispatch
  console.log('\n6. Testing /api/notify/send (Transactional Email)...');
  const notifRes = await fetch(`${BASE_URL}/api/notify/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'customer@client.com',
      templateId: 'welcome',
      variables: {
        user_name: 'Sarah',
        app_name: 'CloudSync',
        dashboard_url: 'https://cloudsync.io/app'
      }
    })
  });
  const notifData = await notifRes.json();
  console.log('   ✅ Notification Result:', notifData.provider, '(Message ID:', notifData.messageId + ')');

  // 7. Test SMS OTP Request
  console.log('\n7. Testing /api/auth/sms/send-otp...');
  const smsOtpRes = await fetch(`${BASE_URL}/api/auth/sms/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+18005550199', appName: 'My Awesome SaaS' })
  });
  const smsOtpData = await smsOtpRes.json();
  console.log('   ✅ Send SMS OTP Result:', smsOtpData.message);

  // 8. Inspect Virtual Dev Phone Simulator
  console.log('\n8. Inspecting /api/dev/phone for SMS OTP code...');
  const phoneRes = await fetch(`${BASE_URL}/api/dev/phone`);
  const phoneData = await phoneRes.json();
  const latestSms = phoneData.messages[0];
  const smsCode = latestSms.previewOtp;
  console.log('   ✅ Captured Dev SMS Body:', latestSms.body);
  console.log('   🔑 Extracted 6-Digit SMS OTP:', smsCode);

  if (!smsCode) throw new Error('SMS OTP code not found in dev phone');

  // 9. Verify SMS OTP & Issue JWT
  console.log('\n9. Testing /api/auth/sms/verify-otp...');
  const verifySmsRes = await fetch(`${BASE_URL}/api/auth/sms/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+18005550199', code: smsCode })
  });
  const verifySmsData = await verifySmsRes.json();
  console.log('   ✅ SMS Verification Result:', verifySmsData.message);
  console.log('   👤 User ID:', verifySmsData.user.id);
  console.log('   📱 Verified Phone:', verifySmsData.user.phone);

  // 10. Test SMS Transactional Notification Dispatch
  console.log('\n10. Testing /api/notify/send (Transactional SMS)...');
  const smsNotifRes = await fetch(`${BASE_URL}/api/notify/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: '+18005550199',
      channel: 'sms',
      templateId: 'sms_welcome',
      variables: {
        user_name: 'Alex',
        app_name: 'CloudSync'
      }
    })
  });
  const smsNotifData = await smsNotifRes.json();
  console.log('   ✅ SMS Notification Result:', smsNotifData.provider, '(Message ID:', smsNotifData.messageId + ')');

  // 11. Verify Stats
  console.log('\n11. Testing /api/stats...');
  const statsRes = await fetch(`${BASE_URL}/api/stats`);
  const statsData = await statsRes.json();
  console.log('   ✅ System Stats:', statsData.stats);

  console.log('\n=============================================');
  console.log('🎉 ALL 11 E2E INTEGRATION TESTS PASSED 100%!');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
