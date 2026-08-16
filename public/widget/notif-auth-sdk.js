/**
 * OpenNotify Client SDK
 * Lightweight, zero-dependency client for In-House Email Authentication & Notifications
 */
(function (global) {
  class OpenNotifyClient {
    constructor(options = {}) {
      this.endpoint = (options.endpoint || window.location.origin).replace(/\/$/, '');
      this.storageKey = options.storageKey || 'opennotify_auth_session';
      this.token = this.loadToken();

      this.auth = {
        sendOtp: this.sendOtp.bind(this),
        verifyOtp: this.verifyOtp.bind(this),
        sendSmsOtp: this.sendSmsOtp.bind(this),
        verifySmsOtp: this.verifySmsOtp.bind(this),
        sendMagicLink: this.sendMagicLink.bind(this),
        getSession: this.getSession.bind(this),
        getUser: this.getUser.bind(this),
        signOut: this.signOut.bind(this),
      };

      this.notify = {
        send: this.sendNotification.bind(this),
        sendSms: this.sendSmsNotification.bind(this),
      };
    }

    loadToken() {
      try {
        return localStorage.getItem(this.storageKey);
      } catch (e) {
        return null;
      }
    }

    saveSession(token, user) {
      this.token = token;
      try {
        localStorage.setItem(this.storageKey, token);
        if (user) {
          localStorage.setItem(`${this.storageKey}_user`, JSON.stringify(user));
        }
      } catch (e) {}
    }

    signOut() {
      this.token = null;
      try {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(`${this.storageKey}_user`);
      } catch (e) {}
    }

    getSession() {
      return this.token;
    }

    getUser() {
      try {
        const raw = localStorage.getItem(`${this.storageKey}_user`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    async sendOtp({ email, appName = 'OpenNotify', metadata = {} }) {
      const res = await fetch(`${this.endpoint}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, appName, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send verification code');
      return data;
    }

    async verifyOtp({ email, code }) {
      const res = await fetch(`${this.endpoint}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      if (data.token) {
        this.saveSession(data.token, data.user);
      }
      return data;
    }

    async sendMagicLink({ email, appName = 'OpenNotify', redirectUrl, metadata = {} }) {
      const res = await fetch(`${this.endpoint}/api/auth/send-magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, appName, redirectUrl, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send sign-in link');
      return data;
    }

    async sendSmsOtp({ phone, appName = 'OpenNotify', metadata = {} }) {
      const res = await fetch(`${this.endpoint}/api/auth/sms/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, appName, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send SMS code');
      return data;
    }

    async verifySmsOtp({ phone, code }) {
      const res = await fetch(`${this.endpoint}/api/auth/sms/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'SMS Verification failed');
      if (data.token) {
        this.saveSession(data.token, data.user);
      }
      return data;
    }

    async sendNotification({ to, templateId, subject, html, variables = {}, metadata = {} }) {
      const res = await fetch(`${this.endpoint}/api/notify/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, templateId, subject, html, variables, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch notification');
      return data;
    }

    async sendSmsNotification({ to, templateId, body, variables = {}, metadata = {} }) {
      const res = await fetch(`${this.endpoint}/api/notify/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, channel: 'sms', templateId, body, variables, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch SMS notification');
      return data;
    }

    async fetchCurrentUser() {
      if (!this.token) return null;
      const res = await fetch(`${this.endpoint}/api/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        this.signOut();
        return null;
      }
      return data.user;
    }
  }

  // Factory function & global registration
  global.createOpenNotifyClient = (options) => new OpenNotifyClient(options);
  global.OpenNotifyClient = OpenNotifyClient;
})(typeof window !== 'undefined' ? window : globalThis);
