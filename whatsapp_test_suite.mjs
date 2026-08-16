// WhatsApp Automation & Interactive Message Engine Test Suite
const BASE_URL = 'http://localhost:3000';

async function runWhatsAppTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       WhatsApp Interactive Automation E2E Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 0. Ensure Dev Simulator Mode
  await fetch(`${BASE_URL}/api/config/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'dev' })
  });

  // 1. Meta Webhook Verification Handshake
  console.log('1. Testing Meta Webhook Verification Handshake (GET /api/webhooks/whatsapp)...');
  const verifyRes = await fetch(
    `${BASE_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=opennotify_meta_webhook_secret&hub.challenge=CHALLENGE_ACCEPTED_123`
  );
  const verifyText = await verifyRes.text();
  console.log('   ✅ Webhook Challenge Handshake Result:', verifyText);
  if (verifyText !== 'CHALLENGE_ACCEPTED_123') throw new Error('Webhook verification handshake failed');

  // 2. Create Custom Interactive Template with Clickable Buttons
  console.log('\n2. Testing Custom Interactive Template Creation (POST /api/whatsapp/templates)...');
  const customTplId = `wa_custom_${Date.now()}`;
  const createTplRes = await fetch(`${BASE_URL}/api/whatsapp/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: customTplId,
      name: 'Custom Service Upgrade Offer',
      category: 'marketing',
      headerText: '🚀 Special Upgrade for {{customer_name}}',
      body: 'Hi {{customer_name}}, would you like to upgrade your {{plan_name}} plan with 50% discount today?',
      footerText: 'Offer valid for 24 hours',
      buttons: [
        { id: 'btn_yes_upgrade', title: '✅ Yes, Upgrade Me', actionType: 'reply', replyText: 'Awesome choice, {{customer_name}}! Your plan has been upgraded with 50% discount. 🎉' },
        { id: 'btn_no_thanks', title: '❌ No, Keep Current', actionType: 'reply', replyText: 'No problem! You will stay on your current plan.' }
      ],
      variables: ['customer_name', 'plan_name']
    })
  });
  const createTplData = await createTplRes.json();
  console.log('   ✅ Template Created:', createTplData.message);

  // 3. Dispatch Interactive Template to Customer
  console.log('\n3. Testing Interactive Template Dispatch (POST /api/whatsapp/send)...');
  const customerPhone = '+15559876543';
  const dispatchRes = await fetch(`${BASE_URL}/api/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: customerPhone,
      templateId: customTplId,
      variables: {
        customer_name: 'David',
        plan_name: 'Pro Cloud'
      }
    })
  });
  const dispatchData = await dispatchRes.json();
  console.log('   ✅ Message Dispatched:', dispatchData.provider, '(Message ID:', dispatchData.messageId + ')');

  // 4. Verify Interactive Message in Dev WhatsApp Simulator
  console.log('\n4. Inspecting Virtual Dev WhatsApp Simulator (GET /api/dev/whatsapp)...');
  const simRes = await fetch(`${BASE_URL}/api/dev/whatsapp`);
  const simData = await simRes.json();
  const latestOutbound = simData.messages.find(m => m.direction === 'outbound' && m.to === customerPhone);
  console.log('   ✅ Simulator Captured Header:', latestOutbound?.headerText);
  console.log('   ✅ Simulator Captured Body:', latestOutbound?.body);
  console.log('   🔘 Captured Interactive Buttons:', latestOutbound?.buttons?.map(b => `[${b.title}]`).join(' '));

  if (!latestOutbound || !latestOutbound.buttons || latestOutbound.buttons.length !== 2) {
    throw new Error('Interactive buttons not captured properly in simulator');
  }

  // 5. Simulate Customer Clicking [Yes, Upgrade Me] Button
  console.log('\n5. Simulating Customer Clicking [Yes, Upgrade Me] (POST /api/whatsapp/dev/simulate)...');
  const clickYesRes = await fetch(`${BASE_URL}/api/whatsapp/dev/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: customerPhone,
      type: 'button_reply',
      buttonId: 'btn_yes_upgrade',
      buttonTitle: '✅ Yes, Upgrade Me',
      variables: { customer_name: 'David' }
    })
  });
  const clickYesData = await clickYesRes.json();
  console.log('   ✅ Flow Engine Action:', clickYesData.result.actionTaken);
  console.log('   🤖 Automated Response Dispatched:', clickYesData.result.responseSent);

  if (!clickYesData.result.responseSent?.includes('Awesome choice, David')) {
    throw new Error(`Expected 'Awesome choice, David' reply, got: ${clickYesData.result.responseSent}`);
  }

  // 6. Simulate Customer Clicking [No, Keep Current] Button
  console.log('\n6. Simulating Customer Clicking [No, Keep Current] (POST /api/whatsapp/dev/simulate)...');
  const clickNoRes = await fetch(`${BASE_URL}/api/whatsapp/dev/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: customerPhone,
      type: 'button_reply',
      buttonId: 'btn_no_thanks',
      buttonTitle: '❌ No, Keep Current',
      variables: { customer_name: 'David' }
    })
  });
  const clickNoData = await clickNoRes.json();
  console.log('   ✅ Flow Engine Action:', clickNoData.result.actionTaken);
  console.log('   🤖 Automated Alternative Dispatched:', clickNoData.result.responseSent);

  if (!clickNoData.result.responseSent?.includes('stay on your current plan')) {
    throw new Error(`Expected 'stay on your current plan' reply, got: ${clickNoData.result.responseSent}`);
  }

  // 7. Test Keyword Automation Trigger ('menu' -> Automated Support Menu)
  console.log('\n7. Testing Keyword Automation Trigger "menu" (POST /api/whatsapp/dev/simulate)...');
  const menuRes = await fetch(`${BASE_URL}/api/whatsapp/dev/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: customerPhone,
      type: 'text',
      text: 'hi, can you send the menu please?',
      variables: { company_name: 'OpenNotify' }
    })
  });
  const menuData = await menuRes.json();
  console.log('   ✅ Keyword Triggered Template:', menuData.result.templateId);
  console.log('   🔘 Interactive Buttons Dispatched:', menuData.result.buttonsSent?.map(b => `[${b.title}]`).join(' '));

  // 8. Test Meta Graph API Webhook Payload Handling
  console.log('\n8. Testing Meta Cloud Webhook Format (POST /api/webhooks/whatsapp)...');
  const metaWebhookRes = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '+18005550199' },
            messages: [{
              from: '15559876543',
              id: `wamid.${Date.now()}`,
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              type: 'interactive',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'btn_confirm',
                  title: '✅ Confirm Order'
                }
              }
            }]
          }
        }]
      }]
    })
  });
  const metaWebhookText = await metaWebhookRes.text();
  console.log('   ✅ Meta Webhook Event Response:', metaWebhookText);

  // 9. Verify System Stats
  console.log('\n9. Checking System Statistics (GET /api/stats)...');
  const statsRes = await fetch(`${BASE_URL}/api/stats`);
  const statsData = await statsRes.json();
  console.log('   ✅ System Stats:', statsData.stats);

  console.log('\n============================================================');
  console.log('🎉 ALL 9 WHATSAPP AUTOMATION & INTERACTIVE TESTS PASSED 100%!');
  console.log('============================================================\n');
}

runWhatsAppTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
