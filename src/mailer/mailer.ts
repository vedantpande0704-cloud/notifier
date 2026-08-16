import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { devInbox } from './dev-inbox.js';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface MailerResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface MailerConfig {
  provider: 'dev' | 'smtp' | 'resend';
  emailFrom: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  resend: {
    apiKey: string;
  };
}

export class MailerService {
  private transporter: nodemailer.Transporter | null = null;
  private currentConfig: MailerConfig;

  constructor() {
    this.currentConfig = {
      provider: config.mailProvider,
      emailFrom: config.emailFrom,
      smtp: { ...config.smtp },
      resend: { ...config.resend },
    };
    this.initTransporter();
  }

  public getConfig(): Omit<MailerConfig, 'smtp' | 'resend'> & { smtp: Omit<MailerConfig['smtp'], 'pass'> & { hasPass: boolean }; resend: { hasApiKey: boolean } } {
    return {
      provider: this.currentConfig.provider,
      emailFrom: this.currentConfig.emailFrom,
      smtp: {
        host: this.currentConfig.smtp.host,
        port: this.currentConfig.smtp.port,
        secure: this.currentConfig.smtp.secure,
        user: this.currentConfig.smtp.user,
        hasPass: Boolean(this.currentConfig.smtp.pass),
      },
      resend: {
        hasApiKey: Boolean(this.currentConfig.resend.apiKey),
      },
    };
  }

  public updateConfig(newConfig: Partial<MailerConfig>) {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      smtp: {
        ...this.currentConfig.smtp,
        ...(newConfig.smtp || {}),
      },
      resend: {
        ...this.currentConfig.resend,
        ...(newConfig.resend || {}),
      },
    };
    this.initTransporter();
  }

  private initTransporter() {
    if (this.currentConfig.provider === 'smtp' && this.currentConfig.smtp.user) {
      this.transporter = nodemailer.createTransport({
        host: this.currentConfig.smtp.host,
        port: this.currentConfig.smtp.port,
        secure: this.currentConfig.smtp.secure,
        auth: {
          user: this.currentConfig.smtp.user,
          pass: this.currentConfig.smtp.pass,
        },
      });
    } else {
      this.transporter = null;
    }
  }

  async testConnection(testRecipient: string, tempConfig?: Partial<MailerConfig>): Promise<{ success: boolean; message: string; details?: any }> {
    const cfg = tempConfig ? { ...this.currentConfig, ...tempConfig, smtp: { ...this.currentConfig.smtp, ...(tempConfig.smtp || {}) } } : this.currentConfig;
    const from = cfg.emailFrom || 'OpenNotify <noreply@opennotify.local>';

    if (cfg.provider === 'dev') {
      const devMsg = devInbox.addEmail({
        to: testRecipient,
        from,
        subject: '⚡ OpenNotify SMTP Test Email',
        html: `<div style="font-family:sans-serif;padding:24px;border:1px solid #e5e5ea;border-radius:12px;"><h2>Test Email Successful!</h2><p>This was captured in your local Virtual Dev Mailbox.</p></div>`,
      });
      return { success: true, message: 'Test email captured in Virtual Dev Mailbox', details: { messageId: devMsg.id } };
    }

    if (cfg.provider === 'smtp') {
      if (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass) {
        return { success: false, message: 'SMTP Host, User, and Password are required.' };
      }

      const tempTransporter = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: Number(cfg.smtp.port),
        secure: Boolean(cfg.smtp.secure),
        auth: {
          user: cfg.smtp.user,
          pass: cfg.smtp.pass,
        },
      });

      try {
        // Verify connection first
        await tempTransporter.verify();

        // Send test email
        const info = await tempTransporter.sendMail({
          from,
          to: testRecipient,
          subject: '⚡ OpenNotify Live SMTP Test Confirmation',
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:16px;border:1px solid #e5e5ea;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
              <div style="width:40px;height:40px;line-height:40px;text-align:center;background:#30d158;color:#fff;border-radius:10px;font-weight:700;font-size:20px;margin-bottom:16px;">✓</div>
              <h2 style="color:#1c1c1e;font-size:20px;margin:0 0 8px 0;">SMTP Connection Verified!</h2>
              <p style="color:#636366;font-size:14px;line-height:1.5;margin:0 0 20px 0;">
                Your OpenNotify email sender has been successfully configured and authenticated with <strong>${cfg.smtp.host}</strong>.
              </p>
              <div style="background:#f2f2f7;border-radius:10px;padding:14px;font-size:13px;color:#3a3a3c;">
                <strong>Sender:</strong> ${from}<br/>
                <strong>Recipient:</strong> ${testRecipient}<br/>
                <strong>Timestamp:</strong> ${new Date().toUTCString()}
              </div>
            </div>
          `,
        });

        return { success: true, message: `Live email successfully sent to ${testRecipient}!`, details: { messageId: info.messageId } };
      } catch (err: any) {
        return { success: false, message: `SMTP Error: ${err.message}`, details: err };
      }
    }

    if (cfg.provider === 'resend') {
      if (!cfg.resend.apiKey) {
        return { success: false, message: 'Resend API Key is required.' };
      }
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.resend.apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: [testRecipient],
            subject: '⚡ OpenNotify Resend Live Test',
            html: '<p>OpenNotify Resend configuration verified successfully!</p>',
          }),
        });
        const data = (await res.json()) as any;
        if (!res.ok) throw new Error(data.message || 'Resend error');
        return { success: true, message: `Live email sent via Resend to ${testRecipient}!`, details: data };
      } catch (err: any) {
        return { success: false, message: `Resend Error: ${err.message}` };
      }
    }

    return { success: false, message: 'Unknown provider' };
  }

  async sendMail(options: SendMailOptions): Promise<MailerResult> {
    const from = options.from || this.currentConfig.emailFrom;
    const provider = this.currentConfig.provider;

    // 1. Dev Mode
    if (provider === 'dev' || !this.transporter) {
      const devMsg = devInbox.addEmail({
        to: options.to,
        from,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log(`\n📨 [DEV INBOX] New Email Captured:`);
      console.log(`   To: ${options.to}`);
      console.log(`   Subject: ${options.subject}`);
      if (devMsg.previewOtp) console.log(`   🔑 Verification OTP: ${devMsg.previewOtp}`);
      if (devMsg.previewMagicLink) console.log(`   🔗 Magic Link: ${devMsg.previewMagicLink}`);

      return {
        success: true,
        messageId: devMsg.id,
        provider: 'dev-inbox',
      };
    }

    // 2. Resend API
    if (provider === 'resend' && this.currentConfig.resend.apiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.currentConfig.resend.apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
          }),
        });

        const data = (await res.json()) as any;
        if (!res.ok) {
          throw new Error(data.message || 'Resend API error');
        }

        return {
          success: true,
          messageId: data.id,
          provider: 'resend',
        };
      } catch (err: any) {
        console.error('Resend delivery failed:', err.message);
        return {
          success: false,
          provider: 'resend',
          error: err.message,
        };
      }
    }

    // 3. SMTP
    try {
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp',
      };
    } catch (err: any) {
      console.error('SMTP delivery error:', err.message);
      return {
        success: false,
        provider: 'smtp',
        error: err.message,
      };
    }
  }
}

export const mailerService = new MailerService();
