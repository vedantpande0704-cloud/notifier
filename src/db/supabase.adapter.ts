import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

export class SupabaseAdapter implements DatabaseAdapter {
  private client: SupabaseClient | null = null;
  private url: string;
  private serviceKey: string;

  constructor(url: string, serviceKey: string) {
    this.url = url;
    this.serviceKey = serviceKey;
  }

  async init(): Promise<void> {
    if (!this.url || !this.serviceKey) {
      throw new Error('Supabase URL and Service Role Key must be provided for SupabaseAdapter');
    }
    this.client = createClient(this.url, this.serviceKey, {
      auth: { persistSession: false },
    });
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('SupabaseAdapter is not initialized');
    }
    return this.client;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.getClient()
      .from('notif_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) return null;
    return data as User;
  }

  async findUserByPhone(phone: string): Promise<User | null> {
    const norm = phone.replace(/[^0-9+]/g, '');
    const { data, error } = await this.getClient()
      .from('notif_users')
      .select('*')
      .eq('phone', norm)
      .single();

    if (error || !data) return null;
    return data as User;
  }

  async createUser(data: { email?: string; phone?: string; metadata?: Record<string, any> }): Promise<User> {
    const normEmail = data.email ? data.email.toLowerCase().trim() : undefined;
    const normPhone = data.phone ? data.phone.replace(/[^0-9+]/g, '') : undefined;

    if (normEmail) {
      const existing = await this.findUserByEmail(normEmail);
      if (existing) return existing;
    }
    if (normPhone) {
      const existing = await this.findUserByPhone(normPhone);
      if (existing) return existing;
    }

    const { data: created, error } = await this.getClient()
      .from('notif_users')
      .insert({
        email: normEmail,
        phone: normPhone,
        role: 'user',
        email_verified: Boolean(normEmail),
        phone_verified: Boolean(normPhone),
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase user creation failed: ${error.message}`);
    return created as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await this.getClient()
      .from('notif_users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Supabase user update failed: ${error.message}`);
    return data as User;
  }

  async saveVerificationToken(token: Omit<VerificationToken, 'id' | 'created_at'>): Promise<VerificationToken> {
    const { data, error } = await this.getClient()
      .from('notif_verification_tokens')
      .insert({
        identifier: token.identifier.toLowerCase().trim(),
        token_hash: token.token_hash,
        token_type: token.token_type,
        attempts: token.attempts,
        max_attempts: token.max_attempts,
        expires_at: token.expires_at,
        metadata: token.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase save token failed: ${error.message}`);
    return data as VerificationToken;
  }

  async findActiveToken(identifier: string, type: VerificationToken['token_type']): Promise<VerificationToken | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.getClient()
      .from('notif_verification_tokens')
      .select('*')
      .eq('identifier', identifier.toLowerCase().trim())
      .eq('token_type', type)
      .is('used_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    if (data.attempts >= data.max_attempts) return null;
    return data as VerificationToken;
  }

  async incrementTokenAttempts(id: string): Promise<number> {
    const { data: current } = await this.getClient()
      .from('notif_verification_tokens')
      .select('attempts')
      .eq('id', id)
      .single();

    const newAttempts = (current?.attempts || 0) + 1;

    await this.getClient()
      .from('notif_verification_tokens')
      .update({ attempts: newAttempts })
      .eq('id', id);

    return newAttempts;
  }

  async markTokenUsed(id: string): Promise<void> {
    await this.getClient()
      .from('notif_verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id);
  }

  async logDelivery(log: Omit<DeliveryLog, 'id' | 'created_at'>): Promise<DeliveryLog> {
    const { data, error } = await this.getClient()
      .from('notif_delivery_logs')
      .insert({
        recipient: log.recipient,
        channel: log.channel,
        template_name: log.template_name,
        subject: log.subject,
        body: log.body,
        status: log.status,
        provider: log.provider,
        error_message: log.error_message,
        metadata: log.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase log delivery failed: ${error.message}`);
    return data as DeliveryLog;
  }

  async getDeliveryLogs(limit: number = 50, channel?: 'email' | 'sms' | 'whatsapp'): Promise<DeliveryLog[]> {
    let query = this.getClient()
      .from('notif_delivery_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as DeliveryLog[];
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    const { data, error } = await this.getClient()
      .from('notif_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as NotificationTemplate;
  }

  async listTemplates(channel?: 'email' | 'sms' | 'whatsapp'): Promise<NotificationTemplate[]> {
    let query = this.getClient()
      .from('notif_templates')
      .select('*')
      .order('name');

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as NotificationTemplate[];
  }

  async saveTemplate(template: NotificationTemplate): Promise<void> {
    await this.getClient()
      .from('notif_templates')
      .upsert({
        ...template,
        updated_at: new Date().toISOString(),
      });
  }

  async getWhatsAppTemplate(id: string): Promise<WhatsAppTemplate | null> {
    const { data, error } = await this.getClient()
      .from('notif_whatsapp_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as WhatsAppTemplate;
  }

  async listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
    const { data, error } = await this.getClient()
      .from('notif_whatsapp_templates')
      .select('*')
      .order('name');

    if (error || !data) return [];
    return data as WhatsAppTemplate[];
  }

  async saveWhatsAppTemplate(template: WhatsAppTemplate): Promise<void> {
    await this.getClient()
      .from('notif_whatsapp_templates')
      .upsert({
        ...template,
        updated_at: new Date().toISOString(),
      });
  }

  async deleteWhatsAppTemplate(id: string): Promise<boolean> {
    const { error } = await this.getClient()
      .from('notif_whatsapp_templates')
      .delete()
      .eq('id', id);

    return !error;
  }

  async listWhatsAppRules(): Promise<WhatsAppAutomationRule[]> {
    const { data, error } = await this.getClient()
      .from('notif_whatsapp_rules')
      .select('*')
      .order('name');

    if (error || !data) return [];
    return data as WhatsAppAutomationRule[];
  }

  async saveWhatsAppRule(rule: WhatsAppAutomationRule): Promise<void> {
    await this.getClient()
      .from('notif_whatsapp_rules')
      .upsert({
        ...rule,
        updated_at: new Date().toISOString(),
      });
  }

  async deleteWhatsAppRule(id: string): Promise<boolean> {
    const { error } = await this.getClient()
      .from('notif_whatsapp_rules')
      .delete()
      .eq('id', id);

    return !error;
  }

  async logWhatsAppMessage(msg: Omit<WhatsAppMessageLog, 'id' | 'created_at'>): Promise<WhatsAppMessageLog> {
    const { data, error } = await this.getClient()
      .from('notif_whatsapp_messages')
      .insert({
        ...msg,
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase log WhatsApp message failed: ${error.message}`);
    return data as WhatsAppMessageLog;
  }

  async getWhatsAppMessages(filterPhone?: string, limit: number = 50): Promise<WhatsAppMessageLog[]> {
    let query = this.getClient()
      .from('notif_whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filterPhone) {
      const norm = filterPhone.replace(/[^0-9+]/g, '');
      query = query.or(`from.eq.${norm},to.eq.${norm}`);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as WhatsAppMessageLog[];
  }

  async getStats(): Promise<{
    totalUsers: number;
    totalSent: number;
    totalSmsSent: number;
    totalWhatsAppSent: number;
    activeTokens: number;
  }> {
    const client = this.getClient();
    const now = new Date().toISOString();

    const [usersRes, logsRes, smsLogsRes, waLogsRes, tokensRes] = await Promise.all([
      client.from('notif_users').select('id', { count: 'exact', head: true }),
      client.from('notif_delivery_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent').eq('channel', 'email'),
      client.from('notif_delivery_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent').eq('channel', 'sms'),
      client.from('notif_delivery_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent').eq('channel', 'whatsapp'),
      client.from('notif_verification_tokens').select('id', { count: 'exact', head: true }).is('used_at', null).gt('expires_at', now),
    ]);

    return {
      totalUsers: usersRes.count || 0,
      totalSent: logsRes.count || 0,
      totalSmsSent: smsLogsRes.count || 0,
      totalWhatsAppSent: waLogsRes.count || 0,
      activeTokens: tokensRes.count || 0,
    };
  }
}
