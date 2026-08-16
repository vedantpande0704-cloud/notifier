// OpenNotify Studio — Ultra-Minimalist Client-Side Controller
document.addEventListener('DOMContentLoaded', () => {
  const client = window.createOpenNotifyClient();

  // -------------------------------------------------------------
  // 1. Segmented Tab Navigation
  // -------------------------------------------------------------
  const segButtons = document.querySelectorAll('.segment-btn[data-tab]');
  const panes = document.querySelectorAll('.tab-pane');

  segButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      segButtons.forEach((b) => b.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      const pane = document.getElementById(`tab-${target}`);
      if (pane) pane.classList.add('active');
    });
  });

  // Slide-Over Settings Drawer (On-Demand Summoning)
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const settingsDrawer = document.getElementById('settings-drawer');

  function openDrawer() {
    if (drawerBackdrop && settingsDrawer) {
      drawerBackdrop.classList.add('active');
      settingsDrawer.classList.add('active');
    }
  }

  function closeDrawer() {
    if (drawerBackdrop && settingsDrawer) {
      drawerBackdrop.classList.remove('active');
      settingsDrawer.classList.remove('active');
    }
  }

  if (btnOpenSettings) btnOpenSettings.onclick = openDrawer;
  if (btnCloseSettings) btnCloseSettings.onclick = closeDrawer;
  if (drawerBackdrop) drawerBackdrop.onclick = closeDrawer;

  // Modal Widget Launcher
  const testWidgetBtn = document.getElementById('btn-test-widget');
  if (testWidgetBtn) {
    testWidgetBtn.onclick = () => {
      window.OpenNotifyWidget.open({
        appName: 'OpenNotify Studio',
        onAuthSuccess: (user) => {
          alert(`🎉 Auth Successful!\nLogged in as: ${user.email || user.phone}`);
          fetchStats();
          fetchDevInbox();
          fetchDevPhoneMessages();
        },
      });
    };
  }

  // -------------------------------------------------------------
  // 2. Metrics & Engine Stats Fetcher
  // -------------------------------------------------------------
  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        const total = (s.totalSent || 0) + (s.totalSmsSent || 0) + (s.totalWhatsAppSent || 0);

        const totalEl = document.getElementById('stat-sent-total');
        if (totalEl) totalEl.textContent = total;

        const dbElem = document.getElementById('stat-db-mode');
        if (dbElem) {
          dbElem.textContent = s.dbType === 'supabase' ? 'Supabase' : 'SQLite';
          dbElem.style.color = s.dbType === 'supabase' ? 'var(--apple-green)' : 'var(--apple-blue)';
        }
      }
    } catch (e) {
      console.warn('Failed to load stats', e);
    }
  }

  // -------------------------------------------------------------
  // 3. Auth Playground Handlers
  // -------------------------------------------------------------
  const formSendOtp = document.getElementById('form-send-otp');
  const otpSendResult = document.getElementById('otp-send-result');
  const btnSendMagic = document.getElementById('btn-send-magic');

  if (formSendOtp) {
    formSendOtp.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('test-auth-email').value.trim();

      otpSendResult.className = 'result-box';
      otpSendResult.style.display = 'block';
      otpSendResult.textContent = 'Sending OTP...';

      try {
        const res = await client.auth.sendOtp({ email, appName: 'My App' });
        otpSendResult.className = 'result-box success';
        otpSendResult.innerHTML = `✅ <strong>Sent:</strong> ${res.message}. View in <strong>Live Inboxes</strong>!`;
        fetchDevInbox();
        fetchStats();
      } catch (err) {
        otpSendResult.className = 'result-box error';
        otpSendResult.textContent = `❌ ${err.message}`;
      }
    };
  }

  if (btnSendMagic) {
    btnSendMagic.onclick = async () => {
      const email = document.getElementById('test-auth-email').value.trim();
      if (!email) return alert('Please enter an email address');

      otpSendResult.className = 'result-box';
      otpSendResult.style.display = 'block';
      otpSendResult.textContent = 'Generating magic link...';

      try {
        const res = await client.auth.sendMagicLink({ email, appName: 'My App' });
        otpSendResult.className = 'result-box success';
        otpSendResult.innerHTML = `✅ <strong>Sent:</strong> ${res.message}. View in <strong>Live Inboxes</strong>!`;
        fetchDevInbox();
        fetchStats();
      } catch (err) {
        otpSendResult.className = 'result-box error';
        otpSendResult.textContent = `❌ ${err.message}`;
      }
    };
  }

  // SMS OTP Send
  const formSendSmsOtp = document.getElementById('form-send-sms-otp');
  const smsOtpSendResult = document.getElementById('sms-otp-send-result');

  if (formSendSmsOtp) {
    formSendSmsOtp.onsubmit = async (e) => {
      e.preventDefault();
      const phone = document.getElementById('test-auth-phone').value.trim();

      smsOtpSendResult.className = 'result-box';
      smsOtpSendResult.style.display = 'block';
      smsOtpSendResult.textContent = 'Sending SMS...';

      try {
        const res = await client.auth.sendSmsOtp({ phone, appName: 'My App' });
        smsOtpSendResult.className = 'result-box success';
        smsOtpSendResult.innerHTML = `✅ <strong>Sent:</strong> ${res.message}. View in <strong>Live Inboxes</strong>!`;
        fetchDevPhoneMessages();
        fetchStats();
      } catch (err) {
        smsOtpSendResult.className = 'result-box error';
        smsOtpSendResult.textContent = `❌ ${err.message}`;
      }
    };
  }

  // Verify OTP
  const formVerifyOtp = document.getElementById('form-verify-otp');
  const otpVerifyResult = document.getElementById('otp-verify-result');
  const authSessionBox = document.getElementById('auth-session-box');
  const authSessionJwt = document.getElementById('auth-session-jwt');

  if (formVerifyOtp) {
    formVerifyOtp.onsubmit = async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('test-verify-identifier').value.trim();
      const code = document.getElementById('test-auth-code').value.trim();

      otpVerifyResult.className = 'result-box';
      otpVerifyResult.style.display = 'block';
      otpVerifyResult.textContent = 'Verifying token...';

      try {
        let res;
        if (identifier.includes('@')) {
          res = await client.auth.verifyOtp({ email: identifier, code });
        } else {
          res = await client.auth.verifySmsOtp({ phone: identifier, code });
        }

        otpVerifyResult.className = 'result-box success';
        otpVerifyResult.innerHTML = `✅ <strong>Authenticated!</strong> User ID: <code>${res.user.id}</code>`;
        if (authSessionBox && authSessionJwt) {
          authSessionBox.style.display = 'block';
          authSessionJwt.textContent = res.token;
        }
        fetchStats();
      } catch (err) {
        otpVerifyResult.className = 'result-box error';
        otpVerifyResult.textContent = `❌ ${err.message}`;
      }
    };
  }

  // -------------------------------------------------------------
  // 4. WhatsApp Interactive Automation & Simulator Engine
  // -------------------------------------------------------------
  const formWaTemplate = document.getElementById('form-wa-template');
  const waSaveResult = document.getElementById('wa-save-result');
  const waTemplatesList = document.getElementById('wa-templates-list');
  const waTemplateCount = document.getElementById('wa-template-count');
  const waSimFeed = document.getElementById('wa-sim-feed');
  const formWaSimSend = document.getElementById('form-wa-sim-send');
  const waSimInput = document.getElementById('wa-sim-input');
  const btnWaClearSim = document.getElementById('btn-wa-clear-sim');
  const btnWaQuickTest = document.getElementById('btn-wa-quick-test');
  const btnWaClearForm = document.getElementById('btn-wa-clear-form');

  // Auto-slugification on Template ID for non-technical users
  const waTplIdInput = document.getElementById('wa-tpl-id');
  const waTplNameInput = document.getElementById('wa-tpl-name');

  if (waTplIdInput) {
    waTplIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    });
  }

  if (waTplNameInput && waTplIdInput) {
    waTplNameInput.addEventListener('input', (e) => {
      if (!waTplIdInput.dataset.touched) {
        waTplIdInput.value = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      }
    });
    waTplIdInput.addEventListener('keydown', () => {
      waTplIdInput.dataset.touched = 'true';
    });
  }

  window.insertWaVar = (varName) => {
    const bodyInput = document.getElementById('wa-tpl-body');
    if (bodyInput) {
      const start = bodyInput.selectionStart || bodyInput.value.length;
      const end = bodyInput.selectionEnd || bodyInput.value.length;
      const text = bodyInput.value;
      bodyInput.value = text.substring(0, start) + `{{${varName}}}` + text.substring(end);
      bodyInput.focus();
      bodyInput.setSelectionRange(start + varName.length + 4, start + varName.length + 4);
    }
  };

  window.simulateWaKeyword = async (keyword) => {
    if (waSimInput) waSimInput.value = keyword;
    await sendWaSimulation(keyword);
  };

  // Interactive Clickable Button in Live WhatsApp Simulator
  window.handleWaButtonClick = async (buttonId, buttonTitle) => {
    try {
      await fetch('/api/whatsapp/dev/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '+18005550199',
          type: 'button_reply',
          buttonId,
          buttonTitle,
          variables: { customer_name: 'Alex', order_id: '9842', amount: '$49.00', company_name: 'OpenNotify' },
        }),
      });

      fetchWhatsAppChat();
      fetchStats();
    } catch (e) {
      console.error('Failed to trigger interactive button click', e);
    }
  };

  async function sendWaSimulation(text) {
    if (!text || !text.trim()) return;
    try {
      await fetch('/api/whatsapp/dev/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '+18005550199',
          type: 'text',
          text: text.trim(),
          variables: { customer_name: 'Alex', company_name: 'OpenNotify' },
        }),
      });

      if (waSimInput) waSimInput.value = '';
      fetchWhatsAppChat();
      fetchStats();
    } catch (e) {
      console.error('Failed to send WhatsApp message', e);
    }
  }

  if (formWaSimSend) {
    formWaSimSend.onsubmit = async (e) => {
      e.preventDefault();
      if (waSimInput) {
        await sendWaSimulation(waSimInput.value);
      }
    };
  }

  async function fetchWhatsAppChat() {
    try {
      const res = await fetch('/api/dev/whatsapp');
      const data = await res.json();
      const messages = data.messages || [];

      updateTotalInboxBadge();

      if (waSimFeed) {
        if (messages.length === 0) {
          waSimFeed.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); margin: auto; font-size: 12.5px;">
              <div style="width: 42px; height: 42px; margin: 0 auto 10px; background: rgba(37, 211, 102, 0.12); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg class="icon icon-md" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.22-1.15l-.3-.18-3.13.82.83-3.05-.2-.31a8.16 8.16 0 0 1-1.25-4.38c0-4.51 3.67-8.18 8.18-8.18 2.19 0 4.24.85 5.79 2.4 1.54 1.55 2.4 3.6 2.4 5.79 0 4.51-3.67 8.18-8.18 8.18z"/>
                </svg>
              </div>
              <strong style="color: var(--text-primary);">Virtual Simulator Ready</strong>
              <div style="font-size: 11px; margin-top: 2px; color: var(--text-tertiary);">Click "Test Buttons" or send a message.</div>
            </div>
          `;
        } else {
          const reversed = [...messages].reverse();
          waSimFeed.innerHTML = reversed
            .map((m) => {
              const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const isOutbound = m.direction === 'outbound';
              const bubbleClass = isOutbound ? 'wa-bubble-outbound' : 'wa-bubble-inbound';

              let buttonsHtml = '';
              if (isOutbound && m.buttons && m.buttons.length > 0) {
                buttonsHtml = `
                <div class="wa-buttons-container">
                  ${m.buttons
                    .map(
                      (b) => `
                    <button class="wa-interactive-btn" onclick="handleWaButtonClick('${escapeHtml(b.id)}', '${escapeHtml(b.title)}')">
                      <span>${escapeHtml(b.title)}</span>
                    </button>
                  `
                    )
                    .join('')}
                </div>
              `;
              }

              let selectedBadge = '';
              if (!isOutbound && m.selectedButton) {
                selectedBadge = `
                <div>
                  <span class="wa-selected-badge">Button: ${escapeHtml(m.selectedButton.title)}</span>
                </div>
              `;
              }

              return `
              <div class="${bubbleClass}">
                ${m.headerText ? `<div class="wa-header-text">${escapeHtml(m.headerText)}</div>` : ''}
                <div style="white-space: pre-wrap;">${escapeHtml(m.body)}</div>
                ${m.footerText ? `<div class="wa-footer-text">${escapeHtml(m.footerText)}</div>` : ''}
                ${buttonsHtml}
                ${selectedBadge}
                <div style="font-size: 10px; color: var(--text-tertiary); text-align: right; margin-top: 4px;">${timeStr} ${isOutbound ? '✓✓' : ''}</div>
              </div>
            `;
            })
            .join('');

          waSimFeed.scrollTop = waSimFeed.scrollHeight;
        }
      }

      // Populate Live Inboxes WhatsApp Stream
      const streamWaFeed = document.getElementById('stream-wa-feed');
      if (streamWaFeed) {
        if (messages.length === 0) {
          streamWaFeed.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px;">No WhatsApp audit messages yet.</div>';
        } else {
          streamWaFeed.innerHTML = messages
            .map(
              (m) => `
            <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-secondary); margin-bottom: 4px;">
                <span><strong>${m.direction.toUpperCase()}</strong> | From: ${escapeHtml(m.from)} → To: ${escapeHtml(m.to)}</span>
                <span>${new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
              <div style="font-size: 13px; color: var(--text-primary); line-height: 1.4;">${escapeHtml(m.body)}</div>
              ${
                m.buttons && m.buttons.length > 0
                  ? `
                <div style="margin-top: 6px; font-size: 11.5px; color: var(--apple-wa-dark); font-weight: 600;">
                  Buttons: ${m.buttons.map((b) => `[${escapeHtml(b.title)}]`).join(' ')}
                </div>
              `
                  : ''
              }
            </div>
          `
            )
            .join('');
        }
      }
    } catch (e) {
      console.warn('Failed to load WhatsApp chat', e);
    }
  }

  async function loadWhatsAppTemplates() {
    try {
      const res = await fetch('/api/whatsapp/templates');
      const data = await res.json();
      const templates = data.templates || [];

      if (waTemplateCount) waTemplateCount.textContent = `${templates.length} Templates`;

      if (waTemplatesList) {
        if (templates.length === 0) {
          waTemplatesList.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px; text-align: center; padding: 10px;">No templates created.</div>';
        } else {
          waTemplatesList.innerHTML = templates
            .map(
              (t) => `
            <div style="background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); padding: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 13px; color: var(--apple-wa-dark);">${escapeHtml(t.name)}</span>
                <span style="font-size: 10.5px; color: var(--text-tertiary); font-family: monospace;">${escapeHtml(t.id)}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${escapeHtml(t.body)}
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-wa" onclick="dispatchWaTemplate('${escapeHtml(t.id)}')" style="font-size: 11px; padding: 3px 8px;">
                  ⚡ Dispatch
                </button>
                <button class="btn btn-secondary" onclick="editWaTemplate('${escapeHtml(t.id)}')" style="font-size: 11px; padding: 3px 6px;">Edit</button>
                ${!t.is_system ? `<button class="btn btn-danger" onclick="deleteWaTemplate('${escapeHtml(t.id)}')" style="font-size: 11px; padding: 3px 6px;">Delete</button>` : ''}
              </div>
            </div>
          `
            )
            .join('');
        }
      }
    } catch (e) {
      console.warn('Failed to load WhatsApp templates', e);
    }
  }

  window.dispatchWaTemplate = async (templateId) => {
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '+18005550199',
          templateId,
          variables: { customer_name: 'Alex', order_id: '9842', amount: '$49.00', company_name: 'OpenNotify' },
        }),
      });
      fetchWhatsAppChat();
      fetchStats();
    } catch (e) {
      console.error('Failed to dispatch WhatsApp template', e);
    }
  };

  window.editWaTemplate = async (templateId) => {
    try {
      const res = await fetch('/api/whatsapp/templates');
      const data = await res.json();
      const t = (data.templates || []).find((item) => item.id === templateId);
      if (t) {
        document.getElementById('wa-tpl-id').value = t.id;
        document.getElementById('wa-tpl-name').value = t.name;
        document.getElementById('wa-tpl-body').value = t.body;

        const b1 = t.buttons?.[0];
        const b2 = t.buttons?.[1];

        document.getElementById('wa-btn1-title').value = b1 ? b1.title : '';
        document.getElementById('wa-btn1-id').value = b1 ? b1.id : '';
        document.getElementById('wa-btn1-reply').value = b1 ? b1.replyText || '' : '';

        document.getElementById('wa-btn2-title').value = b2 ? b2.title : '';
        document.getElementById('wa-btn2-id').value = b2 ? b2.id : '';
        document.getElementById('wa-btn2-reply').value = b2 ? b2.replyText || '' : '';
      }
    } catch (e) {
      console.error('Failed to load template for edit', e);
    }
  };

  window.deleteWaTemplate = async (templateId) => {
    if (!confirm(`Delete template '${templateId}'?`)) return;
    try {
      await fetch(`/api/whatsapp/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
      loadWhatsAppTemplates();
    } catch (e) {
      console.error('Failed to delete template', e);
    }
  };

  if (formWaTemplate) {
    formWaTemplate.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('wa-tpl-id').value.trim();
      const name = document.getElementById('wa-tpl-name').value.trim();
      const body = document.getElementById('wa-tpl-body').value.trim();

      const buttons = [];
      const b1Title = document.getElementById('wa-btn1-title').value.trim();
      const b1Id = document.getElementById('wa-btn1-id').value.trim() || 'btn_1';
      const b1Reply = document.getElementById('wa-btn1-reply').value.trim();
      if (b1Title) buttons.push({ id: b1Id, title: b1Title, actionType: 'reply', replyText: b1Reply });

      const b2Title = document.getElementById('wa-btn2-title').value.trim();
      const b2Id = document.getElementById('wa-btn2-id').value.trim() || 'btn_2';
      const b2Reply = document.getElementById('wa-btn2-reply').value.trim();
      if (b2Title) buttons.push({ id: b2Id, title: b2Title, actionType: 'reply', replyText: b2Reply });

      try {
        const res = await fetch('/api/whatsapp/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, body, buttons }),
        });
        const data = await res.json();
        if (waSaveResult) {
          waSaveResult.style.display = 'block';
          waSaveResult.className = data.success ? 'result-box success' : 'result-box error';
          waSaveResult.textContent = data.message || 'Saved';
        }
        loadWhatsAppTemplates();
      } catch (err) {
        if (waSaveResult) {
          waSaveResult.style.display = 'block';
          waSaveResult.className = 'result-box error';
          waSaveResult.textContent = err.message;
        }
      }
    };
  }

  if (btnWaClearForm) {
    btnWaClearForm.onclick = () => {
      if (formWaTemplate) formWaTemplate.reset();
      if (waSaveResult) waSaveResult.style.display = 'none';
    };
  }

  if (btnWaQuickTest) {
    btnWaQuickTest.onclick = () => {
      dispatchWaTemplate('wa_order_confirm');
    };
  }

  if (btnWaClearSim) {
    btnWaClearSim.onclick = async () => {
      await fetch('/api/dev/whatsapp', { method: 'DELETE' });
      fetchWhatsAppChat();
      fetchStats();
    };
  }

  // -------------------------------------------------------------
  // 5. Unified Inboxes (WhatsApp / Phone SMS / Mailbox)
  // -------------------------------------------------------------
  window.switchInboxStream = (stream) => {
    const waFeed = document.getElementById('stream-wa-feed');
    const smsFeed = document.getElementById('stream-sms-feed');
    const mailFeed = document.getElementById('stream-mail-feed');

    const btnWa = document.getElementById('btn-inbox-tab-wa');
    const btnSms = document.getElementById('btn-inbox-tab-sms');
    const btnMail = document.getElementById('btn-inbox-tab-mail');

    [btnWa, btnSms, btnMail].forEach((b) => b?.classList.remove('active'));

    if (stream === 'wa') {
      btnWa?.classList.add('active');
      if (waFeed) waFeed.style.display = 'flex';
      if (smsFeed) smsFeed.style.display = 'none';
      if (mailFeed) mailFeed.style.display = 'none';
    } else if (stream === 'sms') {
      btnSms?.classList.add('active');
      if (waFeed) waFeed.style.display = 'none';
      if (smsFeed) smsFeed.style.display = 'flex';
      if (mailFeed) mailFeed.style.display = 'none';
    } else {
      btnMail?.classList.add('active');
      if (waFeed) waFeed.style.display = 'none';
      if (smsFeed) smsFeed.style.display = 'none';
      if (mailFeed) mailFeed.style.display = 'flex';
    }
  };

  let smsMessagesCount = 0;
  let mailboxEmailsCount = 0;

  function updateTotalInboxBadge() {
    const badge = document.getElementById('total-inbox-badge');
    if (badge) {
      badge.textContent = smsMessagesCount + mailboxEmailsCount;
    }
  }

  async function fetchDevPhoneMessages() {
    try {
      const res = await fetch('/api/dev/phone');
      const data = await res.json();
      if (!data.success) return;

      const messages = data.messages || [];
      smsMessagesCount = messages.length;
      updateTotalInboxBadge();

      const streamSmsFeed = document.getElementById('stream-sms-feed');
      if (streamSmsFeed) {
        if (messages.length === 0) {
          streamSmsFeed.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px;">No SMS received yet.</div>';
          return;
        }

        streamSmsFeed.innerHTML = messages
          .map((sms) => {
            const timeStr = new Date(sms.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
            <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">
                <span><strong>From:</strong> ${escapeHtml(sms.from)} → <strong>To:</strong> ${escapeHtml(sms.to)}</span>
                <span>${timeStr}</span>
              </div>
              <div style="font-size: 13px; color: var(--text-primary); line-height: 1.4;">${escapeHtml(sms.body)}</div>
              ${
                sms.previewOtp
                  ? `
                <div style="margin-top: 6px;">
                  <span class="code-tag" onclick="copyAndFillOtp('${sms.previewOtp}', '${escapeHtml(sms.to)}')" title="Click to copy OTP" style="background: var(--apple-green-light); color: #1b8a38;">
                    OTP: ${sms.previewOtp} (Click to Fill)
                  </span>
                </div>
              `
                  : ''
              }
            </div>
          `;
          })
          .join('');
      }
    } catch (e) {
      console.warn('Failed to fetch dev phone messages', e);
    }
  }

  async function fetchDevInbox() {
    try {
      const res = await fetch('/api/dev/inbox');
      const data = await res.json();
      if (!data.success) return;

      const emails = data.emails || [];
      mailboxEmailsCount = emails.length;
      updateTotalInboxBadge();

      const streamMailFeed = document.getElementById('stream-mail-feed');
      if (streamMailFeed) {
        if (emails.length === 0) {
          streamMailFeed.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px;">Virtual Mailbox is empty.</div>';
          return;
        }

        streamMailFeed.innerHTML = emails
          .map((email) => {
            const timeStr = new Date(email.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
            <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 13px; color: var(--apple-blue);">${escapeHtml(email.subject)}</span>
                <span style="font-size: 10.5px; color: var(--text-tertiary);">${timeStr}</span>
              </div>
              <div style="background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); padding: 8px; margin-bottom: 6px; font-size: 12px;">
                ${email.html}
              </div>
              ${
                email.previewOtp
                  ? `
                <div>
                  <span class="code-tag" onclick="copyAndFillOtp('${email.previewOtp}', '${escapeHtml(email.to)}')" title="Click to auto-fill">
                    OTP: ${email.previewOtp} (Click to Verify)
                  </span>
                </div>
              `
                  : ''
              }
            </div>
          `;
          })
          .join('');
      }
    } catch (e) {
      console.warn('Failed to fetch dev mailbox', e);
    }
  }

  const btnRefreshInboxes = document.getElementById('btn-refresh-inboxes');
  const btnClearInboxes = document.getElementById('btn-clear-inboxes');

  if (btnRefreshInboxes) {
    btnRefreshInboxes.onclick = () => {
      fetchWhatsAppChat();
      fetchDevPhoneMessages();
      fetchDevInbox();
    };
  }

  if (btnClearInboxes) {
    btnClearInboxes.onclick = async () => {
      await Promise.all([
        fetch('/api/dev/whatsapp', { method: 'DELETE' }),
        fetch('/api/dev/phone', { method: 'DELETE' }),
        fetch('/api/dev/inbox', { method: 'DELETE' }),
      ]);
      fetchWhatsAppChat();
      fetchDevPhoneMessages();
      fetchDevInbox();
      fetchStats();
    };
  }

  window.copyAndFillOtp = (code, identifier) => {
    navigator.clipboard.writeText(code);
    const codeInput = document.getElementById('test-auth-code');
    const identInput = document.getElementById('test-verify-identifier');
    const verifyForm = document.getElementById('form-verify-otp');

    if (codeInput) codeInput.value = code;
    if (identInput && identifier) identInput.value = identifier;

    // Switch to Auth Playground tab
    const authTabBtn = document.querySelector('.segment-btn[data-tab="auth-playground"]');
    if (authTabBtn) authTabBtn.click();
    if (codeInput) codeInput.focus();

    // Instant auto-verify on click
    if (verifyForm && code && identifier) {
      setTimeout(() => {
        verifyForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 100);
    }
  };

  // -------------------------------------------------------------
  // 6. Gateway Settings Handlers (In Slide-Over Drawer)
  // -------------------------------------------------------------
  const formWaConfig = document.getElementById('form-wa-config');
  const cfgWaProvider = document.getElementById('cfg-wa-provider');
  const cfgWaMetaFields = document.getElementById('cfg-wa-meta-fields');
  const cfgWaMetaPhoneId = document.getElementById('cfg-wa-meta-phone-id');
  const cfgWaMetaToken = document.getElementById('cfg-wa-meta-token');

  function updateWaGatewayUi() {
    if (!cfgWaProvider || !cfgWaMetaFields) return;
    cfgWaMetaFields.style.display = cfgWaProvider.value === 'meta' ? 'block' : 'none';
  }

  if (cfgWaProvider) cfgWaProvider.onchange = updateWaGatewayUi;

  async function loadWhatsAppConfig() {
    try {
      const res = await fetch('/api/config/whatsapp');
      const data = await res.json();
      if (data.success && data.config) {
        const c = data.config;
        if (cfgWaProvider) cfgWaProvider.value = c.provider;
        if (cfgWaMetaPhoneId) cfgWaMetaPhoneId.value = c.meta?.phoneNumberId || '';
        updateWaGatewayUi();
      }
    } catch (e) {}
  }

  if (formWaConfig) {
    formWaConfig.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/config/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: cfgWaProvider.value,
            meta: {
              phoneNumberId: cfgWaMetaPhoneId?.value.trim() || '',
              accessToken: cfgWaMetaToken?.value.trim() || '',
              verifyToken: 'opennotify_meta_webhook_secret',
            },
          }),
        });
        alert('WhatsApp Gateway Configuration Saved!');
        closeDrawer();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    };
  }

  // Email Config
  const formMailerConfig = document.getElementById('form-mailer-config');
  const cfgMailProvider = document.getElementById('cfg-mail-provider');
  const cfgSmtpFields = document.getElementById('cfg-smtp-fields');
  const cfgSmtpUser = document.getElementById('cfg-smtp-user');
  const cfgSmtpPass = document.getElementById('cfg-smtp-pass');

  function updateMailerUi() {
    if (!cfgMailProvider || !cfgSmtpFields) return;
    cfgSmtpFields.style.display = cfgMailProvider.value === 'smtp' ? 'block' : 'none';
  }

  if (cfgMailProvider) cfgMailProvider.onchange = updateMailerUi;

  if (formMailerConfig) {
    formMailerConfig.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/config/mailer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: cfgMailProvider.value,
            emailFrom: 'OpenNotify <auth@yourdomain.com>',
            smtp: {
              host: 'smtp.gmail.com',
              port: 587,
              user: cfgSmtpUser?.value.trim() || '',
              pass: cfgSmtpPass?.value || '',
              secure: false,
            },
          }),
        });
        alert('Email Gateway Configuration Saved!');
        closeDrawer();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    };
  }

  // Copy Snippet Buttons
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        navigator.clipboard.writeText(targetEl.textContent);
        const prev = btn.textContent;
        btn.textContent = 'Copied! ✓';
        setTimeout(() => (btn.textContent = prev), 2000);
      }
    };
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // Initial Boot Loads
  fetchStats();
  fetchDevInbox();
  fetchDevPhoneMessages();
  fetchWhatsAppChat();
  loadWhatsAppTemplates();
  loadWhatsAppConfig();

  // Periodic Refresh
  setInterval(() => {
    fetchStats();
    fetchDevInbox();
    fetchDevPhoneMessages();
    fetchWhatsAppChat();
  }, 3000);
});
