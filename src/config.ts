import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  
  jwtSecret: process.env.JWT_SECRET || 'dev_opennotify_jwt_secret_token_key_change_me_in_prod',
  corsOrigins: process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : ['*'],

  mailProvider: (process.env.MAIL_PROVIDER || 'dev') as 'dev' | 'smtp' | 'resend',
  emailFrom: process.env.EMAIL_FROM || 'OpenNotify <auth@opennotify.local>',
  
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
  },

  smsProvider: (process.env.SMS_PROVIDER || 'dev') as 'dev' | 'twilio' | 'custom',
  smsFromNumber: process.env.SMS_FROM_NUMBER || '+18005550199',
  smsSenderName: process.env.SMS_SENDER_NAME || 'OpenNotify',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
  },

  whatsappProvider: (process.env.WHATSAPP_PROVIDER || 'dev') as 'dev' | 'meta' | 'twilio',
  whatsappFromNumber: process.env.WHATSAPP_FROM_NUMBER || '+18005550199',
  metaWhatsApp: {
    phoneNumberId: process.env.META_WA_PHONE_NUMBER_ID || '',
    accessToken: process.env.META_WA_ACCESS_TOKEN || '',
    verifyToken: process.env.META_WA_VERIFY_TOKEN || 'opennotify_meta_webhook_secret',
  },
  twilioWhatsApp: {
    fromNumber: process.env.TWILIO_WA_NUMBER || 'whatsapp:+14155238886',
  },

  db: {
    type: (process.env.DATABASE_TYPE || 'sqlite') as 'sqlite' | 'supabase',
    sqlitePath: process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'opennotify.json'),
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  auth: {
    otpLength: 6,
    otpExpiresInMinutes: 10,
    magicLinkExpiresInMinutes: 15,
    maxOtpAttempts: 5,
    rateLimitCooldownSeconds: 60,
  }
};
