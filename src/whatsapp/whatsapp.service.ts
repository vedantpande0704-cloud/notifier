import { config } from '../config.js';
import { devWhatsApp, DevWhatsAppMessage } from './dev-whatsapp.js';
import { WhatsAppButton } from '../db/database.js';

export interface SendWhatsAppOptions {
  to: string;
  body: string;
  headerText?: string;
  footerText?: string;
  buttons?: WhatsAppButton[];
  templateId?: string;
  from?: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface WhatsAppConfig {
  provider: 'dev' | 'meta' | 'twilio';
  fromNumber: string;
  meta: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
  };
  twilio: {
    fromNumber: string;
  };
}

export interface InboundWhatsAppMessage {
  from: string;
  to: string;
  type: 'text' | 'button_reply';
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
  rawPayload?: any;
}

export class WhatsAppService {
  private currentConfig: WhatsAppConfig;

  constructor() {
    this.currentConfig = {
      provider: config.whatsappProvider,
      fromNumber: config.whatsappFromNumber,
      meta: { ...config.metaWhatsApp },
      twilio: { ...config.twilioWhatsApp },
    };
  }

  public getConfig(): Omit<WhatsAppConfig, 'meta'> & { meta: { phoneNumberId: string; hasAccessToken: boolean; verifyToken: string } } {
    return {
      provider: this.currentConfig.provider,
      fromNumber: this.currentConfig.fromNumber,
      meta: {
        phoneNumberId: this.currentConfig.meta.phoneNumberId,
        hasAccessToken: Boolean(this.currentConfig.meta.accessToken),
        verifyToken: this.currentConfig.meta.verifyToken,
      },
      twilio: {
        fromNumber: this.currentConfig.twilio.fromNumber,
      },
    };
  }

  public updateConfig(newConfig: Partial<WhatsAppConfig>) {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      meta: {
        ...this.currentConfig.meta,
        ...(newConfig.meta || {}),
      },
      twilio: {
        ...this.currentConfig.twilio,
        ...(newConfig.twilio || {}),
      },
    };
  }

  async sendWhatsApp(options: SendWhatsAppOptions): Promise<WhatsAppResult> {
    const from = options.from || this.currentConfig.fromNumber;
    const provider = this.currentConfig.provider;
    const normTo = options.to.replace(/[^0-9+]/g, '');

    // 1. Dev Mode WhatsApp Simulator
    if (provider === 'dev') {
      const devMsg = devWhatsApp.addMessage({
        from,
        to: normTo,
        direction: 'outbound',
        type: options.buttons && options.buttons.length > 0 ? 'interactive' : 'text',
        headerText: options.headerText,
        body: options.body,
        footerText: options.footerText,
        buttons: options.buttons,
      });

      console.log(`\n💬 [DEV WHATSAPP SIMULATOR] Outbound Message Dispatched:`);
      console.log(`   To: ${normTo}`);
      console.log(`   From: ${from}`);
      if (options.headerText) console.log(`   Header: ${options.headerText}`);
      console.log(`   Body: ${options.body}`);
      if (options.footerText) console.log(`   Footer: ${options.footerText}`);
      if (options.buttons && options.buttons.length > 0) {
        console.log(`   🔘 Interactive Buttons: ${options.buttons.map((b) => `[${b.title}] (ID: ${b.id})`).join('  ')}`);
      }

      return {
        success: true,
        messageId: devMsg.id,
        provider: 'dev-whatsapp',
      };
    }

    // 2. Official Meta WhatsApp Cloud API (Graph API v18.0)
    if (provider === 'meta' && this.currentConfig.meta.phoneNumberId && this.currentConfig.meta.accessToken) {
      try {
        const { phoneNumberId, accessToken } = this.currentConfig.meta;
        const metaUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

        // Format destination phone (Meta requires digits without '+')
        const recipientPhone = normTo.replace(/^\+/, '');

        let requestBody: any = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
        };

        if (options.buttons && options.buttons.length > 0) {
          // Interactive Quick Reply Button format
          const formattedButtons = options.buttons.slice(0, 3).map((btn) => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title.substring(0, 20), // Meta 20 chars limit for button titles
            },
          }));

          requestBody.type = 'interactive';
          requestBody.interactive = {
            type: 'button',
            body: { text: options.body },
            action: {
              buttons: formattedButtons,
            },
          };

          if (options.headerText) {
            requestBody.interactive.header = {
              type: 'text',
              text: options.headerText,
            };
          }

          if (options.footerText) {
            requestBody.interactive.footer = {
              text: options.footerText,
            };
          }
        } else {
          // Plain Text message
          requestBody.type = 'text';
          requestBody.text = {
            preview_url: false,
            body: options.body,
          };
        }

        const res = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });

        const data = (await res.json()) as any;
        if (!res.ok) {
          throw new Error(data.error?.message || `Meta Cloud API error ${res.status}`);
        }

        const messageId = data.messages?.[0]?.id || `wamid.${Date.now()}`;
        return {
          success: true,
          messageId,
          provider: 'meta-cloud',
        };
      } catch (err: any) {
        console.error('Meta WhatsApp Cloud API delivery failed:', err.message);
        return {
          success: false,
          provider: 'meta-cloud',
          error: err.message,
        };
      }
    }

    // 3. Twilio for WhatsApp REST API
    if (provider === 'twilio' && config.twilio.accountSid && config.twilio.authToken) {
      try {
        const { accountSid, authToken } = config.twilio;
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        const waTo = normTo.startsWith('whatsapp:') ? normTo : `whatsapp:${normTo}`;
        const waFrom = this.currentConfig.twilio.fromNumber.startsWith('whatsapp:')
          ? this.currentConfig.twilio.fromNumber
          : `whatsapp:${this.currentConfig.twilio.fromNumber}`;

        let fullBody = options.body;
        if (options.buttons && options.buttons.length > 0) {
          fullBody += '\n\nOptions:\n' + options.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
        }

        const params = new URLSearchParams();
        params.append('To', waTo);
        params.append('From', waFrom);
        params.append('Body', fullBody);

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
          throw new Error(data.message || `Twilio WhatsApp error code ${data.code}`);
        }

        return {
          success: true,
          messageId: data.sid,
          provider: 'twilio-whatsapp',
        };
      } catch (err: any) {
        console.error('Twilio WhatsApp delivery failed:', err.message);
        return {
          success: false,
          provider: 'twilio-whatsapp',
          error: err.message,
        };
      }
    }

    return {
      success: false,
      provider: this.currentConfig.provider,
      error: 'WhatsApp provider credentials are missing or unconfigured.',
    };
  }

  /**
   * Parses standard Meta WhatsApp Cloud Webhook payload
   */
  parseMetaWebhookPayload(body: any): InboundWhatsAppMessage | null {
    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) return null;

      const from = `+${message.from}`;
      const to = value.metadata?.display_phone_number || this.currentConfig.fromNumber;

      if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
        return {
          from,
          to,
          type: 'button_reply',
          buttonId: message.interactive.button_reply.id,
          buttonTitle: message.interactive.button_reply.title,
          rawPayload: message,
        };
      }

      if (message.type === 'text') {
        return {
          from,
          to,
          type: 'text',
          text: message.text.body,
          rawPayload: message,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async testConnection(testRecipient: string, tempConfig?: Partial<WhatsAppConfig>): Promise<{ success: boolean; message: string; details?: any }> {
    const cfg = tempConfig
      ? {
          ...this.currentConfig,
          ...tempConfig,
          meta: { ...this.currentConfig.meta, ...(tempConfig.meta || {}) },
          twilio: { ...this.currentConfig.twilio, ...(tempConfig.twilio || {}) },
        }
      : this.currentConfig;

    if (cfg.provider === 'dev') {
      const devMsg = devWhatsApp.addMessage({
        from: cfg.fromNumber,
        to: testRecipient,
        direction: 'outbound',
        type: 'interactive',
        headerText: '⚡ OpenNotify WhatsApp Test',
        body: 'Welcome to OpenNotify interactive WhatsApp! Please select an action below to test clickable buttons.',
        footerText: 'Test interactive simulator',
        buttons: [
          { id: 'btn_test_yes', title: '✅ Yes, Test Passed', actionType: 'reply' },
          { id: 'btn_test_no', title: '❌ No, Issue Found', actionType: 'reply' },
        ],
      });
      return { success: true, message: 'Interactive WhatsApp test captured in Virtual Dev Simulator', details: { messageId: devMsg.id } };
    }

    if (cfg.provider === 'meta') {
      if (!cfg.meta.phoneNumberId || !cfg.meta.accessToken) {
        return { success: false, message: 'Meta Phone Number ID and Access Token are required.' };
      }

      const res = await this.sendWhatsApp({
        to: testRecipient,
        headerText: '⚡ OpenNotify Live Test',
        body: 'Your Meta WhatsApp Cloud API gateway is connected successfully!',
        buttons: [{ id: 'btn_meta_ok', title: '🎉 Looks Great!', actionType: 'reply' }],
      });

      if (!res.success) {
        return { success: false, message: `Meta Error: ${res.error}` };
      }
      return { success: true, message: `Live interactive WhatsApp message sent to ${testRecipient}!`, details: res };
    }

    if (cfg.provider === 'twilio') {
      const res = await this.sendWhatsApp({
        to: testRecipient,
        body: '⚡ OpenNotify: Your Twilio WhatsApp gateway is connected!',
      });
      if (!res.success) {
        return { success: false, message: `Twilio Error: ${res.error}` };
      }
      return { success: true, message: `Live WhatsApp message sent via Twilio to ${testRecipient}!`, details: res };
    }

    return { success: false, message: 'Unknown WhatsApp provider' };
  }
}

export const whatsappService = new WhatsAppService();
