import { DatabaseAdapter, DeliveryLog, NotificationTemplate } from '../db/database.js';
import { mailerService } from '../mailer/mailer.js';

export interface SendNotificationPayload {
  to: string;
  channel?: 'email' | 'sms' | 'whatsapp';
  templateId?: string;
  subject?: string;
  html?: string;
  body?: string;
  headerText?: string;
  footerText?: string;
  variables?: Record<string, string | number>;
  metadata?: Record<string, any>;
}

export class NotifyService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /**
   * Replaces dynamic mustache-style variables e.g. {{user_name}} in subject & body
   */
  private renderTemplateString(text: string, vars: Record<string, any> = {}): string {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  async send(payload: SendNotificationPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }> {
    const channel = payload.channel || (payload.to.includes('@') ? 'email' : 'sms');

    if (channel === 'whatsapp') {
      return this.sendWhatsApp(payload);
    }

    if (channel === 'sms') {
      return this.sendSms(payload);
    }

    // Email dispatch
    let subject = payload.subject || 'Notification';
    let html = payload.html || payload.body || '';
    let templateName = payload.templateId || 'custom_direct';

    if (payload.templateId) {
      const template = await this.db.getTemplate(payload.templateId);
      if (template) {
        templateName = template.name;
        subject = this.renderTemplateString(template.subject || subject, payload.variables || {});
        html = this.renderTemplateString(template.body, payload.variables || {});
      }
    } else if (html && payload.variables) {
      html = this.renderTemplateString(html, payload.variables);
      if (subject) {
        subject = this.renderTemplateString(subject, payload.variables);
      }
    }

    const mailRes = await mailerService.sendMail({
      to: payload.to,
      subject,
      html,
    });

    const status: DeliveryLog['status'] = mailRes.success ? 'sent' : 'failed';

    await this.db.logDelivery({
      recipient: payload.to,
      channel: 'email',
      template_name: templateName,
      subject,
      status,
      provider: mailRes.provider,
      error_message: mailRes.error,
      metadata: payload.metadata || {},
    });

    return mailRes;
  }

  async sendSms(payload: SendNotificationPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }> {
    let body = payload.body || payload.html || '';
    let templateName = payload.templateId || 'custom_sms';

    if (payload.templateId) {
      const template = await this.db.getTemplate(payload.templateId);
      if (template) {
        templateName = template.name;
        body = this.renderTemplateString(template.body, payload.variables || {});
      } else if (payload.templateId === 'sms_auth_otp') {
        templateName = 'SMS Auth Code';
        body = this.renderTemplateString('{{app_name}}: Your login verification code is {{code}}. Valid for 10 minutes.', payload.variables || {});
      }
    } else if (body && payload.variables) {
      body = this.renderTemplateString(body, payload.variables);
    }

    const { smsService } = await import('../sms/sms.service.js');
    const smsRes = await smsService.sendSms({
      to: payload.to,
      body,
    });

    const status: DeliveryLog['status'] = smsRes.success ? 'sent' : 'failed';

    await this.db.logDelivery({
      recipient: payload.to,
      channel: 'sms',
      template_name: templateName,
      body,
      status,
      provider: smsRes.provider,
      error_message: smsRes.error,
      metadata: payload.metadata || {},
    });

    return smsRes;
  }

  async sendWhatsApp(payload: SendNotificationPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }> {
    let body = payload.body || payload.html || '';
    let headerText = payload.headerText;
    let footerText = payload.footerText;
    let templateName = payload.templateId || 'custom_whatsapp';
    let buttons = undefined;

    if (payload.templateId) {
      const waTemplate = await this.db.getWhatsAppTemplate(payload.templateId);
      if (waTemplate) {
        templateName = waTemplate.name;
        body = this.renderTemplateString(waTemplate.body, payload.variables || {});
        if (waTemplate.headerText) headerText = this.renderTemplateString(waTemplate.headerText, payload.variables || {});
        if (waTemplate.footerText) footerText = this.renderTemplateString(waTemplate.footerText, payload.variables || {});
        buttons = waTemplate.buttons;
      }
    } else if (body && payload.variables) {
      body = this.renderTemplateString(body, payload.variables);
      if (headerText) headerText = this.renderTemplateString(headerText, payload.variables);
      if (footerText) footerText = this.renderTemplateString(footerText, payload.variables);
    }

    const { whatsappService } = await import('../whatsapp/whatsapp.service.js');
    const waRes = await whatsappService.sendWhatsApp({
      to: payload.to,
      headerText,
      body,
      footerText,
      buttons,
    });

    const status: DeliveryLog['status'] = waRes.success ? 'sent' : 'failed';

    await this.db.logDelivery({
      recipient: payload.to,
      channel: 'whatsapp',
      template_name: templateName,
      body,
      status,
      provider: waRes.provider,
      error_message: waRes.error,
      metadata: payload.metadata || {},
    });

    return waRes;
  }

  async getLogs(limit: number = 50): Promise<DeliveryLog[]> {
    return this.db.getDeliveryLogs(limit);
  }

  async listTemplates(): Promise<NotificationTemplate[]> {
    return this.db.listTemplates();
  }

  async saveTemplate(template: NotificationTemplate): Promise<void> {
    return this.db.saveTemplate(template);
  }
}
