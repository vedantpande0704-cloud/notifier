import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import { JsonFileAdapter } from './db/sqlite.adapter.js';
import { SupabaseAdapter } from './db/supabase.adapter.js';
import { DatabaseAdapter } from './db/database.js';
import { NotifyService } from './notify/notify.service.js';
import { AuthService } from './auth/auth.service.js';
import { devInbox } from './mailer/dev-inbox.js';
import { mailerService } from './mailer/mailer.js';
import { devPhone } from './sms/dev-phone.js';
import { smsService } from './sms/sms.service.js';
import { devWhatsApp } from './whatsapp/dev-whatsapp.js';
import { whatsappService } from './whatsapp/whatsapp.service.js';
import { WhatsAppFlowEngine } from './whatsapp/whatsapp-flow.engine.js';

const app = express();

// Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
  })
);

// Email validation helper
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim()) && email.length <= 254;
}

// Serve static assets (Studio UI, Embeddable SDK, Widget)
app.use(express.static(path.join(process.cwd(), 'public')));

// Database selection
let db: DatabaseAdapter;
if (config.db.type === 'supabase' && config.supabase.url && config.supabase.serviceRoleKey) {
  console.log('⚡ Initializing Supabase PostgreSQL Adapter...');
  db = new SupabaseAdapter(config.supabase.url, config.supabase.serviceRoleKey);
} else {
  console.log(`📁 Initializing Zero-Config Storage (${config.db.sqlitePath})...`);
  db = new JsonFileAdapter(config.db.sqlitePath);
}

// Services
let notifyService: NotifyService;
let authService: AuthService;
let flowEngine: WhatsAppFlowEngine;

async function bootstrap() {
  await db.init();
  notifyService = new NotifyService(db);
  authService = new AuthService(db, notifyService);
  flowEngine = new WhatsAppFlowEngine(db);

  // -------------------------------------------------------------
  // Health & Stats Endpoints
  // -------------------------------------------------------------
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      dbType: config.db.type,
      mailProvider: config.mailProvider,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const stats = await db.getStats();
      res.json({
        success: true,
        stats: {
          ...stats,
          mailProvider: config.mailProvider,
          dbType: config.db.type,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Auth API Routes
  // -------------------------------------------------------------
  app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
    const { email, appName, metadata } = req.body;
    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, message: 'A valid email address is required (e.g. name@domain.com)' });
      return;
    }

    const result = await authService.sendOtp(email, appName, metadata);
    if (!result.success && result.retryAfterSeconds) {
      res.status(429).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
    const { email, code } = req.body;
    if (!isValidEmail(email) || !code || typeof code !== 'string') {
      res.status(400).json({ success: false, message: 'Valid email and 6-digit OTP code are required' });
      return;
    }

    const result = await authService.verifyOtp(email, code);
    if (!result.success) {
      if (result.retryAfterSeconds) {
        res.status(429).json(result);
        return;
      }
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/send-magic-link', async (req: Request, res: Response) => {
    const { email, appName, redirectUrl, metadata } = req.body;
    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, message: 'A valid email address is required' });
      return;
    }

    const result = await authService.sendMagicLink(email, appName, redirectUrl, metadata);
    if (!result.success && result.retryAfterSeconds) {
      res.status(429).json(result);
      return;
    }
    res.json(result);
  });

  app.get('/api/auth/verify-magic-link', async (req: Request, res: Response) => {
    const { email, token, redirect } = req.query;
    if (!email || !token || typeof email !== 'string' || typeof token !== 'string') {
      res.status(400).send('<h3>Invalid or expired magic link parameters</h3>');
      return;
    }

    const result = await authService.verifyMagicLink(email, token);
    if (!result.success) {
      res.status(400).send(`<h3>Authentication Failed: ${result.message}</h3>`);
      return;
    }

    // If client requested redirect with session token
    if (redirect && typeof redirect === 'string') {
      const redirectUrl = new URL(redirect);
      redirectUrl.searchParams.set('token', result.token || '');
      res.redirect(redirectUrl.toString());
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authenticated</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; color: #fff; margin: 0; }
          .card { background: #1c1c1e; padding: 40px; border-radius: 20px; border: 1px solid #2c2c2e; text-align: center; max-width: 400px; }
          .btn { display: inline-block; margin-top: 20px; background: #0071e3; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ You're Authenticated!</h2>
          <p style="color: #8e8e93;">Welcome back, ${result.user?.email}</p>
          <a href="/" class="btn">Return to Studio</a>
        </div>
      </body>
      </html>
    `);
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Missing Bearer token' });
      return;
    }

    const jwtToken = authHeader.split(' ')[1];
    const session = await authService.verifySession(jwtToken);
    if (!session.valid) {
      res.status(401).json({ success: false, message: 'Invalid or expired session' });
      return;
    }

    res.json({ success: true, user: session.user });
  });

  // -------------------------------------------------------------
  // SMS Authentication API Routes
  // -------------------------------------------------------------
  app.post('/api/auth/sms/send-otp', async (req: Request, res: Response) => {
    const { phone, appName, metadata } = req.body;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ success: false, message: 'Valid phone number is required e.g. +15550199' });
      return;
    }

    const result = await authService.sendSmsOtp(phone, appName, metadata);
    if (!result.success && result.retryAfterSeconds) {
      res.status(429).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/sms/verify-otp', async (req: Request, res: Response) => {
    const { phone, code } = req.body;
    if (!phone || !code || typeof code !== 'string') {
      res.status(400).json({ success: false, message: 'Phone number and 6-digit SMS OTP are required' });
      return;
    }

    const result = await authService.verifySmsOtp(phone, code);
    if (!result.success) {
      if (result.retryAfterSeconds) {
        res.status(429).json(result);
        return;
      }
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  // -------------------------------------------------------------
  // Notification Dispatch API Routes
  // -------------------------------------------------------------
  app.post('/api/notify/send', async (req: Request, res: Response) => {
    const { to, templateId, subject, html, variables, metadata } = req.body;
    if (!to) {
      res.status(400).json({ success: false, message: 'Recipient "to" email is required' });
      return;
    }

    const result = await notifyService.send({
      to,
      templateId,
      subject,
      html,
      variables,
      metadata,
    });

    res.json(result);
  });

  app.get('/api/notify/logs', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const logs = await notifyService.getLogs(limit);
    res.json({ success: true, logs });
  });

  app.get('/api/notify/templates', async (req: Request, res: Response) => {
    const templates = await notifyService.listTemplates();
    res.json({ success: true, templates });
  });

  app.post('/api/notify/templates', async (req: Request, res: Response) => {
    const { id, channel = 'email', name, subject, body, html_body, variables, is_system } = req.body;
    const templateBody = body || html_body;
    if (!id || !name || !templateBody) {
      res.status(400).json({ success: false, message: 'id, name, and body are required' });
      return;
    }

    await notifyService.saveTemplate({
      id,
      channel: channel || 'email',
      name,
      subject,
      body: templateBody,
      variables: variables || [],
      is_system: is_system || false,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Template saved successfully' });
  });

  // -------------------------------------------------------------
  // Mailer Configuration & Live Test Endpoints
  // -------------------------------------------------------------
  app.get('/api/config/mailer', (req: Request, res: Response) => {
    res.json({ success: true, config: mailerService.getConfig() });
  });

  app.post('/api/config/mailer', (req: Request, res: Response) => {
    const { provider, emailFrom, smtp, resend } = req.body;
    mailerService.updateConfig({
      provider,
      emailFrom,
      smtp,
      resend,
    });
    res.json({ success: true, message: 'Mailer configuration updated successfully', config: mailerService.getConfig() });
  });

  app.post('/api/config/mailer/test', async (req: Request, res: Response) => {
    const { recipient, config: testCfg } = req.body;
    if (!recipient) {
      res.status(400).json({ success: false, message: 'Recipient email is required for test' });
      return;
    }

    const testRes = await mailerService.testConnection(recipient, testCfg);
    if (!testRes.success) {
      res.status(400).json(testRes);
      return;
    }
    res.json(testRes);
  });

  // -------------------------------------------------------------
  // SMS Configuration & Live Test Endpoints
  // -------------------------------------------------------------
  app.get('/api/config/sms', (req: Request, res: Response) => {
    res.json({ success: true, config: smsService.getConfig() });
  });

  app.post('/api/config/sms', (req: Request, res: Response) => {
    const { provider, fromNumber, senderName, twilio } = req.body;
    smsService.updateConfig({
      provider,
      fromNumber,
      senderName,
      twilio,
    });
    res.json({ success: true, message: 'SMS configuration updated successfully', config: smsService.getConfig() });
  });

  app.post('/api/config/sms/test', async (req: Request, res: Response) => {
    const { recipient, config: testCfg } = req.body;
    if (!recipient) {
      res.status(400).json({ success: false, message: 'Recipient phone number is required for test' });
      return;
    }

    const testRes = await smsService.testConnection(recipient, testCfg);
    if (!testRes.success) {
      res.status(400).json(testRes);
      return;
    }
    res.json(testRes);
  });

  // -------------------------------------------------------------
  // Dev Virtual Phone & Mailbox API Routes
  // -------------------------------------------------------------
  app.get('/api/dev/phone', (req: Request, res: Response) => {
    res.json({ success: true, messages: devPhone.getMessages() });
  });

  app.delete('/api/dev/phone', (req: Request, res: Response) => {
    devPhone.clear();
    res.json({ success: true, message: 'Virtual dev phone simulator cleared' });
  });

  app.get('/api/dev/inbox', (req: Request, res: Response) => {
    res.json({ success: true, emails: devInbox.getEmails() });
  });

  app.delete('/api/dev/inbox', (req: Request, res: Response) => {
    devInbox.clear();
    res.json({ success: true, message: 'Virtual dev mailbox cleared' });
  });

  // -------------------------------------------------------------
  // WhatsApp Automation, Templates & Webhook API Routes
  // -------------------------------------------------------------
  
  // 1. Meta WhatsApp Webhook Verification Handshake
  app.get('/api/webhooks/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = config.metaWhatsApp.verifyToken;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ [META WEBHOOK VERIFIED] Handshake successful!');
      res.status(200).send(challenge);
      return;
    }

    res.status(403).json({ error: 'Verification token mismatch' });
  });

  // 2. Inbound WhatsApp Message / Button Click Webhook Handler
  app.post('/api/webhooks/whatsapp', async (req: Request, res: Response) => {
    try {
      const inbound = whatsappService.parseMetaWebhookPayload(req.body);
      if (inbound) {
        await flowEngine.processInbound(inbound);
      }
      res.status(200).send('EVENT_RECEIVED');
    } catch (err: any) {
      console.error('Error handling WhatsApp webhook:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Send WhatsApp Direct / Interactive Template
  app.post('/api/whatsapp/send', async (req: Request, res: Response) => {
    const { to, templateId, body, headerText, footerText, variables, metadata } = req.body;
    if (!to || typeof to !== 'string') {
      res.status(400).json({ success: false, message: 'Valid recipient phone number is required (e.g. +18005550199)' });
      return;
    }

    const result = await notifyService.sendWhatsApp({
      to,
      templateId,
      body,
      headerText,
      footerText,
      variables,
      metadata,
    });

    res.json(result);
  });

  // 4. WhatsApp Interactive Templates CRUD
  app.get('/api/whatsapp/templates', async (req: Request, res: Response) => {
    const templates = await db.listWhatsAppTemplates();
    res.json({ success: true, templates });
  });

  app.post('/api/whatsapp/templates', async (req: Request, res: Response) => {
    const { id, name, category, headerText, body, footerText, buttons, variables, is_system } = req.body;
    if (!id || !name || !body) {
      res.status(400).json({ success: false, message: 'id, name, and body are required for WhatsApp template' });
      return;
    }

    await db.saveWhatsAppTemplate({
      id: id.trim().toLowerCase().replace(/\s+/g, '_'),
      name,
      category: category || 'utility',
      headerText,
      body,
      footerText,
      buttons: Array.isArray(buttons) ? buttons : [],
      variables: Array.isArray(variables) ? variables : [],
      is_system: is_system || false,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'WhatsApp template saved successfully' });
  });

  app.delete('/api/whatsapp/templates/:id', async (req: Request, res: Response) => {
    const templateId = String(req.params.id);
    const deleted = await db.deleteWhatsAppTemplate(templateId);
    res.json({ success: deleted, message: deleted ? 'Template deleted' : 'Template not found' });
  });

  // 5. WhatsApp Automation Rules CRUD
  app.get('/api/whatsapp/rules', async (req: Request, res: Response) => {
    const rules = await db.listWhatsAppRules();
    res.json({ success: true, rules });
  });

  app.post('/api/whatsapp/rules', async (req: Request, res: Response) => {
    const { id, name, triggerType, triggerValue, responseType, responseText, responseTemplateId, buttons, enabled } = req.body;
    if (!id || !name || !triggerType || !triggerValue) {
      res.status(400).json({ success: false, message: 'id, name, triggerType, and triggerValue are required' });
      return;
    }

    await db.saveWhatsAppRule({
      id: id.trim().toLowerCase().replace(/\s+/g, '_'),
      name,
      triggerType,
      triggerValue,
      responseType: responseType || 'text',
      responseText,
      responseTemplateId,
      buttons: Array.isArray(buttons) ? buttons : [],
      enabled: enabled !== undefined ? enabled : true,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'WhatsApp automation rule saved successfully' });
  });

  app.delete('/api/whatsapp/rules/:id', async (req: Request, res: Response) => {
    const ruleId = String(req.params.id);
    const deleted = await db.deleteWhatsAppRule(ruleId);
    res.json({ success: deleted, message: deleted ? 'Rule deleted' : 'Rule not found' });
  });

  // 6. WhatsApp Conversation Messages History
  app.get('/api/whatsapp/messages', async (req: Request, res: Response) => {
    const phone = req.query.phone ? String(req.query.phone) : undefined;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const messages = await db.getWhatsAppMessages(phone, limit);
    res.json({ success: true, messages });
  });

  // 7. Dev Simulator: Inbound Customer Action Simulation (Text or Button Click)
  app.post('/api/whatsapp/dev/simulate', async (req: Request, res: Response) => {
    const { from, to = '+18005550199', type = 'text', text, buttonId, buttonTitle, variables } = req.body;
    if (!from) {
      res.status(400).json({ success: false, message: 'Customer phone number (from) is required' });
      return;
    }

    const result = await flowEngine.processInbound(
      {
        from,
        to,
        type: type === 'button_reply' ? 'button_reply' : 'text',
        text,
        buttonId,
        buttonTitle,
      },
      variables || {}
    );

    res.json({ success: true, result });
  });

  // 8. Virtual Dev WhatsApp API Routes
  app.get('/api/dev/whatsapp', (req: Request, res: Response) => {
    const phone = req.query.phone ? String(req.query.phone) : undefined;
    res.json({ success: true, messages: devWhatsApp.getMessages(phone) });
  });

  app.delete('/api/dev/whatsapp', (req: Request, res: Response) => {
    devWhatsApp.clear();
    res.json({ success: true, message: 'Virtual dev WhatsApp simulator cleared' });
  });

  // 9. WhatsApp Gateway Configuration & Live Test
  app.get('/api/config/whatsapp', (req: Request, res: Response) => {
    res.json({ success: true, config: whatsappService.getConfig() });
  });

  app.post('/api/config/whatsapp', (req: Request, res: Response) => {
    const { provider, fromNumber, meta, twilio } = req.body;
    whatsappService.updateConfig({
      provider,
      fromNumber,
      meta,
      twilio,
    });
    res.json({ success: true, message: 'WhatsApp configuration updated successfully', config: whatsappService.getConfig() });
  });

  app.post('/api/config/whatsapp/test', async (req: Request, res: Response) => {
    const { recipient, config: testCfg } = req.body;
    if (!recipient) {
      res.status(400).json({ success: false, message: 'Recipient phone number is required for test' });
      return;
    }

    const testRes = await whatsappService.testConnection(recipient, testCfg);
    if (!testRes.success) {
      res.status(400).json(testRes);
      return;
    }
    res.json(testRes);
  });

  // Start HTTP Server
  app.listen(config.port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 OpenNotify Server & Studio Running on:`);
    console.log(`   👉 UI Dashboard:  http://localhost:${config.port}`);
    console.log(`   👉 API Endpoint:  http://localhost:${config.port}/api`);
    console.log(`   👉 Mail Provider: ${config.mailProvider.toUpperCase()}`);
    console.log(`   👉 Database Mode: ${config.db.type.toUpperCase()}`);
    console.log(`======================================================\n`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
