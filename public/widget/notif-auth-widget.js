/**
 * OpenNotify Drop-in Authentication Modal Widget
 * Embeddable auth UI for any website
 */
(function (global) {
  let modalInstance = null;

  class OpenNotifyWidgetModal {
    constructor(options = {}) {
      this.endpoint = (options.endpoint || window.location.origin).replace(/\/$/, '');
      this.appName = options.appName || 'OpenNotify App';
      this.onAuthSuccess = options.onAuthSuccess || (() => {});
      this.onClose = options.onClose || (() => {});
      this.client = global.createOpenNotifyClient({ endpoint: this.endpoint });
      
      this.state = {
        authType: 'email', // 'email' | 'phone'
        step: 'input', // 'input' | 'otp' | 'magic_sent' | 'success'
        email: '',
        phone: '',
        loading: false,
        error: '',
        otpCode: ['', '', '', '', '', ''],
      };

      this.injectStyles();
    }

    injectStyles() {
      if (document.getElementById('opennotify-widget-styles')) return;

      const style = document.createElement('style');
      style.id = 'opennotify-widget-styles';
      style.textContent = `
        .on-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          opacity: 0;
          visibility: hidden;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
        }
        .on-modal-overlay.on-open {
          opacity: 1;
          visibility: visible;
        }
        .on-modal-card {
          background: rgba(28, 28, 30, 0.94);
          color: #f5f5f7;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          padding: 36px 32px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), 0 0 1px rgba(255, 255, 255, 0.2);
          transform: scale(0.95) translateY(10px);
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }
        .on-modal-overlay.on-open .on-modal-card {
          transform: scale(1) translateY(0);
        }
        .on-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: #8e8e93;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: background 0.15s, color 0.15s;
        }
        .on-close-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .on-brand-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #0071e3 0%, #42a5f5 100%);
          border-radius: 12px;
          color: #fff;
          font-size: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 14px rgba(0, 113, 227, 0.35);
        }
        .on-title {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.4px;
          margin: 0 0 8px 0;
          color: #ffffff;
        }
        .on-desc {
          font-size: 14px;
          line-height: 1.45;
          color: #8e8e93;
          margin: 0 0 24px 0;
        }
        .on-input-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .on-label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #a1a1a6;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .on-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 12px;
          padding: 14px 16px;
          color: #ffffff;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .on-input:focus {
          border-color: #0071e3;
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.25);
        }
        .on-otp-container {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin: 20px 0 24px 0;
        }
        .on-otp-box {
          width: 48px;
          height: 56px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          text-align: center;
          font-size: 24px;
          font-weight: 600;
          color: #ffffff;
          outline: none;
          font-family: SFMono-Regular, Menlo, monospace;
          transition: all 0.2s;
        }
        .on-otp-box:focus {
          border-color: #0071e3;
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.25);
          background: rgba(0, 0, 0, 0.6);
        }
        .on-btn-primary {
          width: 100%;
          background: #0071e3;
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 14px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .on-btn-primary:hover {
          background: #0077ed;
        }
        .on-btn-primary:active {
          transform: scale(0.99);
        }
        .on-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .on-btn-ghost {
          background: transparent;
          border: none;
          color: #2997ff;
          font-size: 13px;
          cursor: pointer;
          margin-top: 14px;
          padding: 6px 12px;
          border-radius: 8px;
          transition: background 0.15s;
        }
        .on-btn-ghost:hover {
          background: rgba(41, 151, 255, 0.1);
        }
        .on-error-msg {
          background: rgba(255, 69, 58, 0.12);
          border: 1px solid rgba(255, 69, 58, 0.3);
          color: #ff453a;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          margin-bottom: 16px;
          text-align: left;
        }
        .on-success-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(48, 209, 88, 0.15);
          color: #30d158;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin: 0 auto 20px auto;
        }
        .on-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: on-spin 0.8s linear infinite;
        }
        @keyframes on-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    render() {
      let overlay = document.getElementById('opennotify-modal-container');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'opennotify-modal-container';
        overlay.className = 'on-modal-overlay';
        document.body.appendChild(overlay);
      }

      overlay.innerHTML = `
        <div class="on-modal-card" id="on-card-inner">
          <button class="on-close-btn" id="on-close-x">&times;</button>
          ${this.getStepHtml()}
        </div>
      `;

      this.bindEvents(overlay);
    }

    getStepHtml() {
      const errorHtml = this.state.error ? `<div class="on-error-msg">${this.state.error}</div>` : '';

      if (this.state.step === 'input') {
        const isEmail = this.state.authType === 'email';
        return `
          <div class="on-brand-badge">${isEmail ? '✉️' : '📱'}</div>
          <h3 class="on-title">Sign in to ${this.appName}</h3>
          
          <!-- Channel Toggle -->
          <div style="display: flex; background: rgba(0,0,0,0.4); border-radius: 10px; padding: 4px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.08);">
            <button type="button" id="on-tab-email" style="flex: 1; padding: 8px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; background: ${isEmail ? 'rgba(255,255,255,0.12)' : 'transparent'}; color: ${isEmail ? '#fff' : '#8e8e93'};">
              ✉️ Email
            </button>
            <button type="button" id="on-tab-phone" style="flex: 1; padding: 8px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; background: ${!isEmail ? 'rgba(255,255,255,0.12)' : 'transparent'}; color: ${!isEmail ? '#fff' : '#8e8e93'};">
              📱 Mobile SMS
            </button>
          </div>

          <p class="on-desc">${isEmail ? 'Enter your email to receive a secure 6-digit code or magic link.' : 'Enter your mobile phone number to receive a 6-digit SMS code.'}</p>
          ${errorHtml}

          ${isEmail ? `
            <form id="on-auth-form">
              <div class="on-input-group">
                <label class="on-label">Email Address</label>
                <input type="email" id="on-primary-input" class="on-input" placeholder="name@example.com" value="${this.state.email}" required autofocus />
              </div>
              <button type="submit" class="on-btn-primary" id="on-send-btn" ${this.state.loading ? 'disabled' : ''}>
                ${this.state.loading ? '<div class="on-spinner"></div> Sending Code...' : 'Continue with Email OTP'}
              </button>
              <div style="text-align: center; margin-top: 12px;">
                <button type="button" class="on-btn-ghost" id="on-send-magic-btn">or send a Magic Sign-In Link</button>
              </div>
            </form>
          ` : `
            <form id="on-auth-form">
              <div class="on-input-group">
                <label class="on-label">Mobile Phone Number</label>
                <input type="tel" id="on-primary-input" class="on-input" placeholder="+1 (555) 019-2834" value="${this.state.phone}" required autofocus />
              </div>
              <button type="submit" class="on-btn-primary" id="on-send-btn" ${this.state.loading ? 'disabled' : ''}>
                ${this.state.loading ? '<div class="on-spinner"></div> Sending SMS...' : 'Send SMS Verification Code'}
              </button>
            </form>
          `}
        `;
      }

      if (this.state.step === 'otp') {
        const isEmail = this.state.authType === 'email';
        const target = isEmail ? this.state.email : this.state.phone;
        return `
          <div class="on-brand-badge">🔑</div>
          <h3 class="on-title">Enter Verification Code</h3>
          <p class="on-desc">We sent a 6-digit verification code to <strong style="color:#fff;">${target}</strong></p>
          ${errorHtml}
          <form id="on-otp-form">
            <div class="on-otp-container">
              ${[0, 1, 2, 3, 4, 5].map(i => `
                <input type="text" maxlength="1" inputmode="numeric" class="on-otp-box" data-index="${i}" value="${this.state.otpCode[i] || ''}" />
              `).join('')}
            </div>
            <button type="submit" class="on-btn-primary" id="on-verify-btn" ${this.state.loading ? 'disabled' : ''}>
              ${this.state.loading ? '<div class="on-spinner"></div> Verifying...' : 'Verify & Sign In'}
            </button>
            <div style="text-align: center; margin-top: 14px; display: flex; justify-content: space-between;">
              <button type="button" class="on-btn-ghost" id="on-back-input">← Change ${isEmail ? 'Email' : 'Phone'}</button>
              <button type="button" class="on-btn-ghost" id="on-resend-otp">Resend Code</button>
            </div>
          </form>
        `;
      }

      if (this.state.step === 'magic_sent') {
        return `
          <div class="on-brand-badge">✉️</div>
          <h3 class="on-title">Magic Link Dispatched</h3>
          <p class="on-desc">We sent a secure one-click sign-in link to <strong style="color:#fff;">${this.state.email}</strong>. Check your inbox and click the link to proceed.</p>
          <div style="text-align: center; margin-top: 24px;">
            <button type="button" class="on-btn-ghost" id="on-back-input">← Back to Sign In</button>
          </div>
        `;
      }

      if (this.state.step === 'success') {
        const target = this.state.authType === 'email' ? this.state.email : this.state.phone;
        return `
          <div class="on-success-icon">✓</div>
          <h3 class="on-title">Authenticated!</h3>
          <p class="on-desc">You are now signed in as <strong style="color:#fff;">${target}</strong></p>
          <button type="button" class="on-btn-primary" id="on-success-close">Done</button>
        `;
      }

      return '';
    }

    bindEvents(overlay) {
      const closeBtn = overlay.querySelector('#on-close-x');
      if (closeBtn) closeBtn.onclick = () => this.close();

      overlay.onclick = (e) => {
        if (e.target === overlay) this.close();
      };

      // Tab toggles
      const tabEmail = overlay.querySelector('#on-tab-email');
      const tabPhone = overlay.querySelector('#on-tab-phone');
      if (tabEmail && tabPhone) {
        tabEmail.onclick = () => {
          this.state.authType = 'email';
          this.state.error = '';
          this.render();
        };
        tabPhone.onclick = () => {
          this.state.authType = 'phone';
          this.state.error = '';
          this.render();
        };
      }

      // Main Input Form (Email or Phone)
      const authForm = overlay.querySelector('#on-auth-form');
      if (authForm) {
        authForm.onsubmit = async (e) => {
          e.preventDefault();
          const val = overlay.querySelector('#on-primary-input').value.trim();
          if (!val) return;

          this.state.loading = true;
          this.state.error = '';
          this.render();

          try {
            if (this.state.authType === 'email') {
              this.state.email = val;
              await this.client.auth.sendOtp({ email: val, appName: this.appName });
            } else {
              this.state.phone = val;
              await this.client.auth.sendSmsOtp({ phone: val, appName: this.appName });
            }
            this.state.loading = false;
            this.state.step = 'otp';
            this.render();
          } catch (err) {
            this.state.loading = false;
            this.state.error = err.message;
            this.render();
          }
        };

        const magicBtn = overlay.querySelector('#on-send-magic-btn');
        if (magicBtn) {
          magicBtn.onclick = async () => {
            const email = overlay.querySelector('#on-primary-input').value.trim();
            if (!email) {
              this.state.error = 'Please enter your email address';
              this.render();
              return;
            }
            this.state.email = email;
            this.state.loading = true;
            this.state.error = '';
            this.render();

            try {
              await this.client.auth.sendMagicLink({ email, appName: this.appName });
              this.state.loading = false;
              this.state.step = 'magic_sent';
              this.render();
            } catch (err) {
              this.state.loading = false;
              this.state.error = err.message;
              this.render();
            }
          };
        }
      }

      // OTP Box Events
      const otpBoxes = overlay.querySelectorAll('.on-otp-box');
      if (otpBoxes.length > 0) {
        const firstEmpty = Array.from(otpBoxes).find(b => !b.value);
        if (firstEmpty) firstEmpty.focus();

        otpBoxes.forEach((box, index) => {
          box.oninput = (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            box.value = val;
            this.state.otpCode[index] = val;

            if (val && index < 5) {
              otpBoxes[index + 1].focus();
            }

            if (this.state.otpCode.every(d => d.length === 1)) {
              this.submitOtp();
            }
          };

          box.onkeydown = (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
              otpBoxes[index - 1].focus();
            }
          };

          box.onpaste = (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim().slice(0, 6);
            if (/^\d+$/.test(pasteData)) {
              pasteData.split('').forEach((char, i) => {
                if (i < 6) {
                  otpBoxes[i].value = char;
                  this.state.otpCode[i] = char;
                }
              });
              if (pasteData.length === 6) {
                this.submitOtp();
              }
            }
          };
        });

        const otpForm = overlay.querySelector('#on-otp-form');
        if (otpForm) {
          otpForm.onsubmit = (e) => {
            e.preventDefault();
            this.submitOtp();
          };
        }

        const backInput = overlay.querySelector('#on-back-input');
        if (backInput) {
          backInput.onclick = () => {
            this.state.step = 'input';
            this.state.error = '';
            this.render();
          };
        }

        const resendOtp = overlay.querySelector('#on-resend-otp');
        if (resendOtp) {
          resendOtp.onclick = async () => {
            this.state.loading = true;
            this.render();
            try {
              if (this.state.authType === 'email') {
                await this.client.auth.sendOtp({ email: this.state.email, appName: this.appName });
              } else {
                await this.client.auth.sendSmsOtp({ phone: this.state.phone, appName: this.appName });
              }
              this.state.loading = false;
              this.state.error = 'New 6-digit code sent!';
              this.render();
            } catch (err) {
              this.state.loading = false;
              this.state.error = err.message;
              this.render();
            }
          };
        }
      }

      // Success Step
      const successDone = overlay.querySelector('#on-success-close');
      if (successDone) {
        successDone.onclick = () => this.close();
      }
    }

    async submitOtp() {
      const code = this.state.otpCode.join('');
      if (code.length !== 6) {
        this.state.error = 'Please enter all 6 digits';
        this.render();
        return;
      }

      this.state.loading = true;
      this.state.error = '';
      this.render();

      try {
        let result;
        if (this.state.authType === 'email') {
          result = await this.client.auth.verifyOtp({
            email: this.state.email,
            code,
          });
        } else {
          result = await this.client.auth.verifySmsOtp({
            phone: this.state.phone,
            code,
          });
        }

        this.state.loading = false;
        this.state.step = 'success';
        this.render();
        this.onAuthSuccess(result.user, result.token);
      } catch (err) {
        this.state.loading = false;
        this.state.error = err.message;
        this.render();
      }
    }

    open() {
      this.render();
      const overlay = document.getElementById('opennotify-modal-container');
      setTimeout(() => overlay.classList.add('on-open'), 10);
    }

    close() {
      const overlay = document.getElementById('opennotify-modal-container');
      if (overlay) {
        overlay.classList.remove('on-open');
        setTimeout(() => {
          this.state.step = 'email';
          this.state.error = '';
          this.state.otpCode = ['', '', '', '', '', ''];
          this.onClose();
        }, 280);
      }
    }
  }

  // Global Widget Singleton & API
  global.OpenNotifyWidget = {
    open: (options = {}) => {
      modalInstance = new OpenNotifyWidgetModal(options);
      modalInstance.open();
      return modalInstance;
    },
    close: () => {
      if (modalInstance) modalInstance.close();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
