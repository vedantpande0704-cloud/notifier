import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DatabaseAdapter,
  User,
  VerificationToken,
  DeliveryLog,
  NotificationTemplate,
  WhatsAppTemplate,
  WhatsAppAutomationRule,
  WhatsAppMessageLog,
} from './database.js';

interface Schema {
  users: User[];
  tokens: VerificationToken[];
  deliveryLogs: DeliveryLog[];
  templates: NotificationTemplate[];
  whatsAppTemplates: WhatsAppTemplate[];
  whatsAppRules: WhatsAppAutomationRule[];
  whatsAppMessages: WhatsAppMessageLog[];
}

export class JsonFileAdapter implements DatabaseAdapter {
  private filePath: string;
  private data: Schema = {
    users: [],
    tokens: [],
    deliveryLogs: [],
    templates: [],
    whatsAppTemplates: [],
    whatsAppRules: [],
    whatsAppMessages: [],
  };

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.templates) this.data.templates = [];
        if (!this.data.whatsAppTemplates) this.data.whatsAppTemplates = [];
        if (!this.data.whatsAppRules) this.data.whatsAppRules = [];
        if (!this.data.whatsAppMessages) this.data.whatsAppMessages = [];

        // Migrate and backfill default templates
        const defaultTemplates = this.getDefaultTemplates();
        for (const def of defaultTemplates) {
          const existing = this.data.templates.find((t) => t.id === def.id);
          if (!existing) {
            this.data.templates.push(def);
          } else {
            if (!(existing as any).body && (existing as any).html_body) {
              existing.body = (existing as any).html_body;
            }
            if (!existing.channel) {
              existing.channel = def.channel;
            }
          }
        }

        // Backfill WhatsApp default templates & rules if empty
        const defaultWaTemplates = this.getDefaultWhatsAppTemplates();
        for (const def of defaultWaTemplates) {
          if (!this.data.whatsAppTemplates.some((t) => t.id === def.id)) {
            this.data.whatsAppTemplates.push(def);
          }
        }

        const defaultWaRules = this.getDefaultWhatsAppRules();
        for (const def of defaultWaRules) {
          if (!this.data.whatsAppRules.some((r) => r.id === def.id)) {
            this.data.whatsAppRules.push(def);
          }
        }

        this.save();
      } catch (err) {
        console.warn('Failed to parse existing DB file, initializing new store.');
        this.initDefaultTemplates();
        this.save();
      }
    } else {
      this.initDefaultTemplates();
      this.save();
    }
  }

  private getDefaultTemplates(): NotificationTemplate[] {
    return [
      {
        id: 'auth_otp',
        channel: 'email',
        name: 'Authentication OTP Code',
        subject: 'Your Verification Code is {{code}}',
        body: `<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#ffffff;border-radius:20px;border:1px solid #e5e5ea;box-shadow:0 4px 20px rgba(0,0,0,0.04);">
  <div style="margin-bottom:24px;">
    <div style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;background:#0071e3;color:#ffffff;border-radius:10px;font-weight:700;font-size:18px;">ON</div>
  </div>
  <h2 style="color:#1d1d1f;font-size:22px;font-weight:600;margin:0 0 10px 0;letter-spacing:-0.4px;">Sign in to {{app_name}}</h2>
  <p style="color:#86868b;font-size:15px;line-height:1.5;margin:0 0 24px 0;">Use this 6-digit verification code to complete your login. It will expire in 10 minutes.</p>
  <div style="background:#f5f5f7;border-radius:14px;padding:20px;text-align:center;margin-bottom:24px;">
    <span style="font-family:SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#0071e3;">{{code}}</span>
  </div>
  <p style="color:#86868b;font-size:13px;line-height:1.4;margin:0;">If you didn't request this code, you can safely ignore this email.</p>
</div>`,
        variables: ['code', 'app_name'],
        is_system: true,
        updated_at: new Date().toISOString()
      },
      {
        id: 'auth_magic_link',
        channel: 'email',
        name: 'Magic Link Sign In',
        subject: 'Sign in to {{app_name}}',
        body: `<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#ffffff;border-radius:20px;border:1px solid #e5e5ea;box-shadow:0 4px 20px rgba(0,0,0,0.04);">
  <div style="margin-bottom:24px;">
    <div style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;background:#0071e3;color:#ffffff;border-radius:10px;font-weight:700;font-size:18px;">ON</div>
  </div>
  <h2 style="color:#1d1d1f;font-size:22px;font-weight:600;margin:0 0 10px 0;letter-spacing:-0.4px;">Sign in to {{app_name}}</h2>
  <p style="color:#86868b;font-size:15px;line-height:1.5;margin:0 0 28px 0;">Click the button below to securely authenticate. This link will expire in 15 minutes.</p>
  <div style="margin-bottom:28px;text-align:center;">
    <a href="{{magic_link_url}}" style="background:#0071e3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;display:inline-block;box-shadow:0 4px 12px rgba(0,113,227,0.25);">Sign In to Account</a>
  </div>
  <p style="color:#86868b;font-size:13px;line-height:1.5;margin:0;word-break:break-all;">Or copy and paste this link:<br/><a href="{{magic_link_url}}" style="color:#0071e3;">{{magic_link_url}}</a></p>
</div>`,
        variables: ['magic_link_url', 'app_name'],
        is_system: true,
        updated_at: new Date().toISOString()
      },
      {
        id: 'welcome',
        channel: 'email',
        name: 'Welcome to Platform',
        subject: 'Welcome to {{app_name}}, {{user_name}}!',
        body: `<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#ffffff;border-radius:20px;border:1px solid #e5e5ea;">
  <h2 style="color:#1d1d1f;font-size:22px;font-weight:600;margin-bottom:12px;">Welcome aboard, {{user_name}}! 🎉</h2>
  <p style="color:#636366;font-size:15px;line-height:1.6;">Your account with <strong>{{app_name}}</strong> is now active. You have full access to our platform.</p>
  <div style="margin:28px 0;">
    <a href="{{dashboard_url}}" style="background:#0071e3;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block;">Go to Your Dashboard</a>
  </div>
</div>`,
        variables: ['user_name', 'app_name', 'dashboard_url'],
        is_system: false,
        updated_at: new Date().toISOString()
      },
      {
        id: 'sms_auth_otp',
        channel: 'sms',
        name: 'SMS Auth Code',
        body: '{{app_name}}: Your login verification code is {{code}}. Valid for 10 minutes. Do not share this code.',
        variables: ['code', 'app_name'],
        is_system: true,
        updated_at: new Date().toISOString()
      },
      {
        id: 'sms_order_confirmed',
        channel: 'sms',
        name: 'Order Confirmation',
        body: '🎉 Thank you for your purchase from {{app_name}}! Order #{{order_id}} for {{amount}} is confirmed. Track at {{tracking_url}}',
        variables: ['app_name', 'order_id', 'amount', 'tracking_url'],
        is_system: false,
        updated_at: new Date().toISOString()
      },
      {
        id: 'sms_welcome',
        channel: 'sms',
        name: 'SMS Welcome',
        body: 'Welcome to {{app_name}}, {{user_name}}! Your account has been verified successfully. 🚀',
        variables: ['app_name', 'user_name'],
        is_system: false,
        updated_at: new Date().toISOString()
      }
    ];
  }

  private getDefaultWhatsAppTemplates(): WhatsAppTemplate[] {
    return [
      {
        id: 'wa_order_confirm',
        name: 'Order Confirmation with Action Buttons',
        category: 'utility',
        headerText: '📦 Order Confirmation',
        body: 'Hi {{customer_name}}, thank you for your order #{{order_id}} for {{amount}}! Please confirm your delivery address or manage your order below.',
        footerText: '⚡ OpenNotify Interactive WhatsApp Engine',
        buttons: [
          { id: 'btn_confirm', title: '✅ Confirm Order', actionType: 'reply', replyText: 'Thank you! Your order #{{order_id}} has been confirmed for immediate dispatch. 🚚' },
          { id: 'btn_reschedule', title: '📅 Reschedule', actionType: 'reply', replyText: 'Please reply with your preferred delivery date (e.g. Tomorrow 2 PM).' },
          { id: 'btn_cancel', title: '❌ Cancel Order', actionType: 'reply', replyText: 'Your order cancellation request has been received. Our team will process your refund shortly.' },
        ],
        variables: ['customer_name', 'order_id', 'amount'],
        is_system: true,
        updated_at: new Date().toISOString(),
      },
      {
        id: 'wa_support_menu',
        name: 'Customer Support Interactive Menu',
        category: 'utility',
        headerText: '🤝 How can we help you today?',
        body: 'Welcome to {{company_name}} automated support! Please select an option below so we can assist you instantly.',
        footerText: 'Reply STOP to unsubscribe',
        buttons: [
          { id: 'btn_order_status', title: '📦 Check Status', actionType: 'reply', replyText: 'Your latest package is out for delivery with courier tracking ID #TRK-98421.' },
          { id: 'btn_billing', title: '💳 Billing & Invoices', actionType: 'reply', replyText: 'You can download your latest invoice at https://opennotify.local/invoices' },
          { id: 'btn_human_agent', title: '👤 Speak to Agent', actionType: 'reply', replyText: 'Connecting you with a live human support specialist. Expected wait time: 2 mins.' },
        ],
        variables: ['company_name'],
        is_system: true,
        updated_at: new Date().toISOString(),
      },
      {
        id: 'wa_feedback',
        name: 'Customer Satisfaction Survey',
        category: 'marketing',
        headerText: '✨ How was your experience?',
        body: 'Hi {{customer_name}}, we would love to get your quick feedback on your recent service with {{company_name}}!',
        footerText: 'Takes only 2 seconds',
        buttons: [
          { id: 'btn_rate_good', title: '⭐ Excellent!', actionType: 'reply', replyText: '🎉 Thank you so much for the 5-star feedback! We appreciate your support.' },
          { id: 'btn_rate_poor', title: '👎 Needs Improvement', actionType: 'reply', replyText: 'We are sorry to hear that. A customer care manager will reach out to make things right.' },
        ],
        variables: ['customer_name', 'company_name'],
        is_system: true,
        updated_at: new Date().toISOString(),
      },
    ];
  }

  private getDefaultWhatsAppRules(): WhatsAppAutomationRule[] {
    return [
      {
        id: 'rule_keyword_menu',
        name: 'Main Menu Trigger (Hi/Help/Menu)',
        triggerType: 'keyword',
        triggerValue: 'menu|hi|hello|help|start',
        responseType: 'template',
        responseTemplateId: 'wa_support_menu',
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      {
        id: 'rule_keyword_order',
        name: 'Order Lookup Trigger (Order/Track)',
        triggerType: 'keyword',
        triggerValue: 'order|track|shipping',
        responseType: 'template',
        responseTemplateId: 'wa_order_confirm',
        enabled: true,
        updated_at: new Date().toISOString(),
      },
    ];
  }

  private initDefaultTemplates() {
    this.data.templates = this.getDefaultTemplates();
    this.data.whatsAppTemplates = this.getDefaultWhatsAppTemplates();
    this.data.whatsAppRules = this.getDefaultWhatsAppRules();
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write database file:', e);
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const norm = email.toLowerCase().trim();
    const user = this.data.users.find(u => u.email && u.email.toLowerCase() === norm);
    return user || null;
  }

  async findUserByPhone(phone: string): Promise<User | null> {
    const norm = phone.replace(/[^0-9+]/g, '');
    const user = this.data.users.find(u => u.phone && u.phone.replace(/[^0-9+]/g, '') === norm);
    return user || null;
  }

  async createUser(data: { email?: string; phone?: string; metadata?: Record<string, any> }): Promise<User> {
    const normEmail = data.email ? data.email.toLowerCase().trim() : undefined;
    const normPhone = data.phone ? data.phone.replace(/[^0-9+]/g, '') : undefined;

    if (normEmail) {
      const existing = await this.findUserByEmail(normEmail);
      if (existing) {
        if (normPhone && !existing.phone) {
          existing.phone = normPhone;
          existing.phone_verified = true;
          this.save();
        }
        return existing;
      }
    }

    if (normPhone) {
      const existing = await this.findUserByPhone(normPhone);
      if (existing) return existing;
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      email: normEmail,
      phone: normPhone,
      role: 'user',
      email_verified: Boolean(normEmail),
      phone_verified: Boolean(normPhone),
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.users[idx];
  }

  async saveVerificationToken(token: Omit<VerificationToken, 'id' | 'created_at'>): Promise<VerificationToken> {
    const newToken: VerificationToken = {
      ...token,
      id: crypto.randomUUID(),
      identifier: token.identifier.trim().toLowerCase(),
      created_at: new Date().toISOString()
    };
    this.data.tokens.push(newToken);
    this.save();
    return newToken;
  }

  async findActiveToken(identifier: string, type: VerificationToken['token_type']): Promise<VerificationToken | null> {
    const norm = identifier.trim().toLowerCase();
    const now = new Date().toISOString();
    
    const token = this.data.tokens
      .filter(t => t.identifier === norm && t.token_type === type && !t.used_at && t.expires_at > now && t.attempts < t.max_attempts)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    return token || null;
  }

  async incrementTokenAttempts(id: string): Promise<number> {
    const token = this.data.tokens.find(t => t.id === id);
    if (!token) return 0;
    token.attempts += 1;
    this.save();
    return token.attempts;
  }

  async markTokenUsed(id: string): Promise<void> {
    const token = this.data.tokens.find(t => t.id === id);
    if (token) {
      token.used_at = new Date().toISOString();
      this.save();
    }
  }

  async logDelivery(log: Omit<DeliveryLog, 'id' | 'created_at'>): Promise<DeliveryLog> {
    const newLog: DeliveryLog = {
      ...log,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    this.data.deliveryLogs.unshift(newLog);
    if (this.data.deliveryLogs.length > 500) {
      this.data.deliveryLogs.pop();
    }
    this.save();
    return newLog;
  }

  async getDeliveryLogs(limit: number = 50, channel?: 'email' | 'sms' | 'whatsapp'): Promise<DeliveryLog[]> {
    let logs = this.data.deliveryLogs;
    if (channel) {
      logs = logs.filter(l => l.channel === channel);
    }
    return logs.slice(0, limit);
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    return this.data.templates.find(t => t.id === id) || null;
  }

  async listTemplates(channel?: 'email' | 'sms' | 'whatsapp'): Promise<NotificationTemplate[]> {
    if (channel) {
      return this.data.templates.filter(t => t.channel === channel);
    }
    return this.data.templates;
  }

  async saveTemplate(template: NotificationTemplate): Promise<void> {
    const idx = this.data.templates.findIndex(t => t.id === template.id);
    if (idx >= 0) {
      this.data.templates[idx] = { ...template, updated_at: new Date().toISOString() };
    } else {
      this.data.templates.push({ ...template, updated_at: new Date().toISOString() });
    }
    this.save();
  }

  async getWhatsAppTemplate(id: string): Promise<WhatsAppTemplate | null> {
    return this.data.whatsAppTemplates.find((t) => t.id === id) || null;
  }

  async listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
    return this.data.whatsAppTemplates;
  }

  async saveWhatsAppTemplate(template: WhatsAppTemplate): Promise<void> {
    const idx = this.data.whatsAppTemplates.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      this.data.whatsAppTemplates[idx] = { ...template, updated_at: new Date().toISOString() };
    } else {
      this.data.whatsAppTemplates.push({ ...template, updated_at: new Date().toISOString() });
    }
    this.save();
  }

  async deleteWhatsAppTemplate(id: string): Promise<boolean> {
    const initLen = this.data.whatsAppTemplates.length;
    this.data.whatsAppTemplates = this.data.whatsAppTemplates.filter((t) => t.id !== id);
    this.save();
    return this.data.whatsAppTemplates.length < initLen;
  }

  async listWhatsAppRules(): Promise<WhatsAppAutomationRule[]> {
    return this.data.whatsAppRules;
  }

  async saveWhatsAppRule(rule: WhatsAppAutomationRule): Promise<void> {
    const idx = this.data.whatsAppRules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      this.data.whatsAppRules[idx] = { ...rule, updated_at: new Date().toISOString() };
    } else {
      this.data.whatsAppRules.push({ ...rule, updated_at: new Date().toISOString() });
    }
    this.save();
  }

  async deleteWhatsAppRule(id: string): Promise<boolean> {
    const initLen = this.data.whatsAppRules.length;
    this.data.whatsAppRules = this.data.whatsAppRules.filter((r) => r.id !== id);
    this.save();
    return this.data.whatsAppRules.length < initLen;
  }

  async logWhatsAppMessage(msg: Omit<WhatsAppMessageLog, 'id' | 'created_at'>): Promise<WhatsAppMessageLog> {
    const newMsg: WhatsAppMessageLog = {
      ...msg,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.data.whatsAppMessages.unshift(newMsg);
    if (this.data.whatsAppMessages.length > 500) {
      this.data.whatsAppMessages.pop();
    }
    this.save();
    return newMsg;
  }

  async getWhatsAppMessages(filterPhone?: string, limit: number = 50): Promise<WhatsAppMessageLog[]> {
    let list = this.data.whatsAppMessages;
    if (filterPhone) {
      const norm = filterPhone.replace(/[^0-9+]/g, '');
      list = list.filter((m) => m.from === norm || m.to === norm);
    }
    return list.slice(0, limit);
  }

  async getStats(): Promise<{ totalUsers: number; totalSent: number; totalSmsSent: number; totalWhatsAppSent: number; activeTokens: number }> {
    const now = new Date().toISOString();
    const activeTokens = this.data.tokens.filter(t => !t.used_at && t.expires_at > now).length;
    const totalSent = this.data.deliveryLogs.filter(l => l.channel === 'email' && (l.status === 'sent' || l.status === 'delivered')).length;
    const totalSmsSent = this.data.deliveryLogs.filter(l => l.channel === 'sms' && (l.status === 'sent' || l.status === 'delivered')).length;
    const totalWhatsAppSent = this.data.deliveryLogs.filter((l) => l.channel === 'whatsapp' && (l.status === 'sent' || l.status === 'delivered')).length;
    return {
      totalUsers: this.data.users.length,
      totalSent,
      totalSmsSent,
      totalWhatsAppSent,
      activeTokens
    };
  }
}
