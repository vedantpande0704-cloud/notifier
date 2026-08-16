-- ==============================================================================
-- OpenNotify — Supabase Schema & Security Migration Script
-- Copy & paste this entire script into your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Users Table (Can sync with or augment standard Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.notif_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Verification Tokens Table (Stores Hashed Email OTPs, SMS OTPs, and Magic Link Tokens)
CREATE TABLE IF NOT EXISTS public.notif_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier TEXT NOT NULL, -- Email address or Mobile phone number
    token_hash TEXT NOT NULL,
    token_type TEXT NOT NULL CHECK (token_type IN ('otp', 'sms_otp', 'magic_link', 'email_verify', 'password_reset')),
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for instant lookup of active tokens
CREATE INDEX IF NOT EXISTS idx_notif_tokens_lookup 
ON public.notif_verification_tokens (identifier, token_type, expires_at) 
WHERE used_at IS NULL;

-- 4. Notification & Email / SMS Delivery Logs
CREATE TABLE IF NOT EXISTS public.notif_delivery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient TEXT NOT NULL, -- Email or Phone number
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    template_name TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'queued')),
    provider TEXT DEFAULT 'dev',
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_delivery_recipient 
ON public.notif_delivery_logs (recipient, created_at DESC);

-- 5. Dynamic Notification Templates (Customizable in-house)
CREATE TABLE IF NOT EXISTS public.notif_templates (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    is_system BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default notification templates
INSERT INTO public.notif_templates (id, name, subject, html_body, variables, is_system)
VALUES 
(
    'auth_otp', 
    'Authentication OTP Code', 
    'Your Verification Code is {{code}}', 
    '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:540px;margin:0 auto;padding:40px 20px;background:#ffffff;border-radius:16px;border:1px solid #e5e5ea;"><h2 style="color:#1c1c1e;font-size:22px;margin-bottom:8px;">Sign in to {{app_name}}</h2><p style="color:#636366;font-size:15px;line-height:1.5;">Use the single-use verification code below to complete your authentication. This code expires in 10 minutes.</p><div style="margin:28px 0;background:#f2f2f7;border-radius:12px;padding:18px;text-align:center;"><span style="font-family:SFMono-Regular,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#0071e3;">{{code}}</span></div><p style="color:#8e8e93;font-size:13px;">If you did not request this code, you can safely ignore this email.</p></div>',
    '["code", "app_name"]'::jsonb,
    TRUE
),
(
    'auth_magic_link', 
    'Magic Link Sign In', 
    'Sign in to {{app_name}}', 
    '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:540px;margin:0 auto;padding:40px 20px;background:#ffffff;border-radius:16px;border:1px solid #e5e5ea;"><h2 style="color:#1c1c1e;font-size:22px;margin-bottom:8px;">Sign in to {{app_name}}</h2><p style="color:#636366;font-size:15px;line-height:1.5;">Click the button below to securely authenticate. This link is valid for 15 minutes and can only be used once.</p><div style="margin:30px 0;text-align:center;"><a href="{{magic_link_url}}" style="background:#0071e3;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">Sign In to Your Account</a></div><p style="color:#8e8e93;font-size:13px;word-break:break-all;">Or copy and paste this URL into your browser:<br/><a href="{{magic_link_url}}" style="color:#0071e3;">{{magic_link_url}}</a></p></div>',
    '["magic_link_url", "app_name"]'::jsonb,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.notif_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notif_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notif_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notif_templates ENABLE ROW LEVEL SECURITY;

-- Allow read-only access to templates for authenticated clients
CREATE POLICY "Allow public read access to templates" 
ON public.notif_templates FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Allow full access to service role on users" 
ON public.notif_users USING (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role');

CREATE POLICY "Allow full access to service role on tokens" 
ON public.notif_verification_tokens USING (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role');

CREATE POLICY "Allow full access to service role on logs" 
ON public.notif_delivery_logs USING (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role');
