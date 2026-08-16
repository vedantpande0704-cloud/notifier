import { config } from '../config.js';
import { devPhone, DevSms } from './dev-phone.js';

export interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface SmsConfig {
  provider: 'dev' | 'twilio' | 'custom';
  fromNumber: string;
  senderName: string;
  twilio: {
    accountSid: string;
    authToken: string;
  };
}

export class SmsService {
  private currentConfig: SmsConfig;

  constructor() {
    this.currentConfig = {
      provider: config.smsProvider,
      fromNumber: config.smsFromNumber,
      senderName: config.smsSenderName,
      twilio: { ...config.twilio },
    };
  }

  public getConfig(): Omit<SmsConfig, 'twilio'> & { twilio: { accountSid: string; hasAuthToken: boolean } } {
    return {
      provider: this.currentConfig.provider,
      fromNumber: this.currentConfig.fromNumber,
      senderName: this.currentConfig.senderName,
      twilio: {
        accountSid: this.currentConfig.twilio.accountSid,
        hasAuthToken: Boolean(this.currentConfig.twilio.authToken),
      },
    };
  }

  public updateConfig(newConfig: Partial<SmsConfig>) {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      twilio: {
        ...this.currentConfig.twilio,
        ...(newConfig.twilio || {}),
      },
    };
  }

  async sendSms(options: SendSmsOptions): Promise<SmsResult> {
    const from = options.from || this.currentConfig.fromNumber || this.currentConfig.senderName;
    const provider = this.currentConfig.provider;

    // 1. Dev Mode Phone Simulator
    if (provider === 'dev') {
      const devMsg = devPhone.addMessage({
        to: options.to,
        from,
        body: options.body,
      });

      console.log(`\n📱 [DEV PHONE SIMULATOR] New SMS Captured:`);
      console.log(`   To: ${options.to}`);
      console.log(`   From: ${from}`);
      console.log(`   Message: ${options.body}`);
      if (devMsg.previewOtp) console.log(`   🔑 Verification OTP: ${devMsg.previewOtp}`);

      return {
        success: true,
        messageId: devMsg.id,
        provider: 'dev-phone',
      };
    }

    // 2. Twilio REST API
    if (provider === 'twilio' && this.currentConfig.twilio.accountSid && this.currentConfig.twilio.authToken) {
      try {
        const { accountSid, authToken } = this.currentConfig.twilio;
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        const params = new URLSearchParams();
        params.append('To', options.to);
        params.append('From', from);
        params.append('Body', options.body);

        const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: authHeader,
          },
          body: params.toString(),
        });

        const data = (await res.json()) as any;
        if (!res.ok) {
          throw new Error(data.message || `Twilio error code ${data.code}`);
        }

        return {
          success: true,
          messageId: data.sid,
          provider: 'twilio',
        };
      } catch (err: any) {
        console.error('Twilio SMS delivery failed:', err.message);
        return {
          success: false,
          provider: 'twilio',
          error: err.message,
        };
      }
    }

    return {
      success: false,
      provider: this.currentConfig.provider,
      error: 'SMS provider is not fully configured or credentials are missing.',
    };
  }

  async testConnection(testRecipient: string, tempConfig?: Partial<SmsConfig>): Promise<{ success: boolean; message: string; details?: any }> {
    const cfg = tempConfig ? { ...this.currentConfig, ...tempConfig, twilio: { ...this.currentConfig.twilio, ...(tempConfig.twilio || {}) } } : this.currentConfig;
    const from = cfg.fromNumber || cfg.senderName || 'OpenNotify';

    if (cfg.provider === 'dev') {
      const devMsg = devPhone.addMessage({
        to: testRecipient,
        from,
        body: '⚡ OpenNotify: Your test SMS verification code is 849201.',
      });
      return { success: true, message: 'Test SMS captured in Virtual Dev Phone Simulator', details: { messageId: devMsg.id } };
    }

    if (cfg.provider === 'twilio') {
      if (!cfg.twilio.accountSid || !cfg.twilio.authToken || !cfg.fromNumber) {
        return { success: false, message: 'Twilio Account SID, Auth Token, and Sender Number are required.' };
      }

      const res = await this.sendSms({
        to: testRecipient,
        from: cfg.fromNumber,
        body: '⚡ OpenNotify Live SMS Verification Test. Your Twilio gateway is connected!',
      });

      if (!res.success) {
        return { success: false, message: `Twilio Error: ${res.error}` };
      }
      return { success: true, message: `Live SMS successfully dispatched via Twilio to ${testRecipient}!`, details: res };
    }

    return { success: false, message: 'Unknown SMS provider' };
  }
}

export const smsService = new SmsService();
