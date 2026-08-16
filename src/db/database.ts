export interface User {
  id: string;
  email?: string;
  phone?: string;
  full_name?: string;
  avatar_url?: string;
  role: string;
  email_verified: boolean;
  phone_verified?: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface VerificationToken {
  id: string;
  identifier: string; // email or phone number
  token_hash: string;
  token_type: 'otp' | 'sms_otp' | 'magic_link' | 'email_verify' | 'password_reset';
  attempts: number;
  max_attempts: number;
  expires_at: string;
  used_at?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface DeliveryLog {
  id: string;
  recipient: string; // email address or phone number
  channel: 'email' | 'sms' | 'whatsapp';
  template_name: string;
  subject?: string;
  body?: string;
  status: 'sent' | 'delivered' | 'failed' | 'queued';
  provider: string;
  error_message?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  name: string;
  subject?: string;
  body: string;
  variables: string[];
  is_system: boolean;
  updated_at: string;
}

export interface WhatsAppButton {
  id: string; // e.g. "btn_yes", "btn_no"
  title: string; // e.g. "Yes, Confirm"
  actionType: 'reply' | 'url' | 'trigger_flow';
  replyText?: string; // Text to reply with if clicked
  nextTemplateId?: string; // Next interactive template to send
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'utility' | 'marketing' | 'authentication' | 'custom';
  headerText?: string;
  body: string; // Supports {{variables}}
  footerText?: string;
  buttons: WhatsAppButton[];
  variables: string[];
  is_system: boolean;
  updated_at: string;
}

export interface WhatsAppAutomationRule {
  id: string;
  name: string;
  triggerType: 'keyword' | 'button_click' | 'fallback';
  triggerValue: string; // keyword like "help" or button id like "btn_yes"
  responseType: 'text' | 'template' | 'flow';
  responseText?: string;
  responseTemplateId?: string;
  buttons?: WhatsAppButton[];
  enabled: boolean;
  updated_at: string;
}

export interface WhatsAppMessageLog {
  id: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'interactive' | 'interactive_response' | 'template';
  headerText?: string;
  body: string;
  footerText?: string;
  buttons?: WhatsAppButton[];
  selectedButton?: { id: string; title: string };
  status: 'received' | 'sent' | 'delivered' | 'read' | 'failed';
  provider: string;
  created_at: string;
}

export interface DatabaseAdapter {
  init(): Promise<void>;
  
  // User operations
  findUserByEmail(email: string): Promise<User | null>;
  findUserByPhone(phone: string): Promise<User | null>;
  createUser(data: { email?: string; phone?: string; metadata?: Record<string, any> }): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Token operations
  saveVerificationToken(token: Omit<VerificationToken, 'id' | 'created_at'>): Promise<VerificationToken>;
  findActiveToken(identifier: string, type: VerificationToken['token_type']): Promise<VerificationToken | null>;
  incrementTokenAttempts(id: string): Promise<number>;
  markTokenUsed(id: string): Promise<void>;
  
  // Delivery logs
  logDelivery(log: Omit<DeliveryLog, 'id' | 'created_at'>): Promise<DeliveryLog>;
  getDeliveryLogs(limit?: number, channel?: 'email' | 'sms' | 'whatsapp'): Promise<DeliveryLog[]>;

  // Templates
  getTemplate(id: string): Promise<NotificationTemplate | null>;
  listTemplates(channel?: 'email' | 'sms' | 'whatsapp'): Promise<NotificationTemplate[]>;
  saveTemplate(template: NotificationTemplate): Promise<void>;

  // WhatsApp Interactive Templates & Automation
  getWhatsAppTemplate(id: string): Promise<WhatsAppTemplate | null>;
  listWhatsAppTemplates(): Promise<WhatsAppTemplate[]>;
  saveWhatsAppTemplate(template: WhatsAppTemplate): Promise<void>;
  deleteWhatsAppTemplate(id: string): Promise<boolean>;

  // WhatsApp Automation Rules
  listWhatsAppRules(): Promise<WhatsAppAutomationRule[]>;
  saveWhatsAppRule(rule: WhatsAppAutomationRule): Promise<void>;
  deleteWhatsAppRule(id: string): Promise<boolean>;

  // WhatsApp Messages
  logWhatsAppMessage(msg: Omit<WhatsAppMessageLog, 'id' | 'created_at'>): Promise<WhatsAppMessageLog>;
  getWhatsAppMessages(filterPhone?: string, limit?: number): Promise<WhatsAppMessageLog[]>;

  // Stats
  getStats(): Promise<{ totalUsers: number; totalSent: number; totalSmsSent: number; totalWhatsAppSent: number; activeTokens: number }>;
}
