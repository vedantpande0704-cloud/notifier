import { DatabaseAdapter, User } from '../db/database.js';
import { TokenSecurity } from './tokens.js';
import { NotifyService } from '../notify/notify.service.js';
import { authRateLimiter, requestCooldownLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export interface AuthResult {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
}

export class AuthService {
  private db: DatabaseAdapter;
  private notify: NotifyService;

  constructor(db: DatabaseAdapter, notify: NotifyService) {
    this.db = db;
    this.notify = notify;
  }

  /**
   * Request a 6-digit OTP code sent via email
   */
  async sendOtp(email: string, appName: string = 'OpenNotify', metadata?: Record<string, any>): Promise<AuthResult> {
    const normEmail = email.toLowerCase().trim();

    // 1. Check rate limit on requests
    const cooldown = requestCooldownLimiter.check(`cooldown:${normEmail}`);
    if (!cooldown.allowed) {
      return {
        success: false,
        message: 'Too many requests. Please wait a moment before requesting another code.',
        retryAfterSeconds: cooldown.retryAfterSeconds,
      };
    }

    // 2. Generate OTP and secure hash
    const rawOtp = TokenSecurity.generateNumericOtp(config.auth.otpLength);
    const tokenHash = TokenSecurity.hashToken(rawOtp);
    const expiresAt = new Date(Date.now() + config.auth.otpExpiresInMinutes * 60 * 1000).toISOString();

    // 3. Save hashed token in database
    await this.db.saveVerificationToken({
      identifier: normEmail,
      token_hash: tokenHash,
      token_type: 'otp',
      attempts: 0,
      max_attempts: config.auth.maxOtpAttempts,
      expires_at: expiresAt,
      metadata,
    });

    requestCooldownLimiter.recordAttempt(`cooldown:${normEmail}`);

    // 4. Send email notification
    await this.notify.send({
      to: normEmail,
      templateId: 'auth_otp',
      variables: {
        code: rawOtp,
        app_name: appName,
      },
      metadata: { auth_type: 'otp' },
    });

    return {
      success: true,
      message: `A verification code has been sent to ${normEmail}`,
    };
  }

  /**
   * Request a 6-digit OTP code sent via SMS to mobile number
   */
  async sendSmsOtp(phone: string, appName: string = 'OpenNotify', metadata?: Record<string, any>): Promise<AuthResult> {
    const normPhone = phone.replace(/[^0-9+]/g, '');
    if (normPhone.length < 8) {
      return { success: false, message: 'Please provide a valid international phone number e.g. +15550199' };
    }

    const cooldown = requestCooldownLimiter.check(`cooldown:sms:${normPhone}`);
    if (!cooldown.allowed) {
      return {
        success: false,
        message: 'Please wait a moment before requesting another SMS code.',
        retryAfterSeconds: cooldown.retryAfterSeconds,
      };
    }

    const rawOtp = TokenSecurity.generateNumericOtp(config.auth.otpLength);
    const tokenHash = TokenSecurity.hashToken(rawOtp);
    const expiresAt = new Date(Date.now() + config.auth.otpExpiresInMinutes * 60 * 1000).toISOString();

    await this.db.saveVerificationToken({
      identifier: normPhone,
      token_hash: tokenHash,
      token_type: 'sms_otp',
      attempts: 0,
      max_attempts: config.auth.maxOtpAttempts,
      expires_at: expiresAt,
      metadata,
    });

    requestCooldownLimiter.recordAttempt(`cooldown:sms:${normPhone}`);

    // Send SMS via Notification service
    const smsRes = await this.notify.sendSms({
      to: normPhone,
      templateId: 'sms_auth_otp',
      variables: {
        code: rawOtp,
        app_name: appName,
      },
      metadata: { auth_type: 'sms_otp' },
    });

    if (!smsRes.success) {
      return {
        success: false,
        message: `Failed to deliver SMS: ${smsRes.error || 'Provider error'}`,
      };
    }

    return {
      success: true,
      message: `A 6-digit verification code was sent via SMS to ${normPhone}`,
    };
  }

  /**
   * Verify the 6-digit SMS OTP and issue session token
   */
  async verifySmsOtp(phone: string, rawCode: string): Promise<AuthResult> {
    const normPhone = phone.replace(/[^0-9+]/g, '');
    const rateCheckKey = `verify:sms:${normPhone}`;

    const rateCheck = authRateLimiter.check(rateCheckKey);
    if (!rateCheck.allowed) {
      return {
        success: false,
        message: 'Too many failed attempts. Please try again in 15 minutes.',
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      };
    }

    const activeToken = await this.db.findActiveToken(normPhone, 'sms_otp');
    if (!activeToken) {
      return {
        success: false,
        message: 'Invalid or expired SMS code. Please request a new code.',
      };
    }

    const attempts = await this.db.incrementTokenAttempts(activeToken.id);
    authRateLimiter.recordAttempt(rateCheckKey);

    const isValid = TokenSecurity.verifyTokenHash(rawCode.trim(), activeToken.token_hash);
    if (!isValid) {
      const remaining = Math.max(0, activeToken.max_attempts - attempts);
      if (remaining === 0) {
        await this.db.markTokenUsed(activeToken.id);
      }
      return {
        success: false,
        message: `Incorrect code. ${remaining} attempts remaining.`,
        remainingAttempts: remaining,
      };
    }

    await this.db.markTokenUsed(activeToken.id);
    authRateLimiter.reset(rateCheckKey);

    const user = await this.db.createUser({ phone: normPhone, metadata: activeToken.metadata });
    const sessionToken = TokenSecurity.createSessionJwt(user);

    return {
      success: true,
      message: 'Mobile verification successful',
      user,
      token: sessionToken,
    };
  }

  /**
   * Verify the 6-digit OTP and return a JWT session token
   */
  async verifyOtp(email: string, rawCode: string): Promise<AuthResult> {
    const normEmail = email.toLowerCase().trim();
    const rateCheckKey = `verify:${normEmail}`;

    // 1. Rate limiter check to prevent brute-force attacks
    const rateCheck = authRateLimiter.check(rateCheckKey);
    if (!rateCheck.allowed) {
      return {
        success: false,
        message: 'Account temporarily locked due to multiple failed attempts. Please try again later.',
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      };
    }

    // 2. Lookup active token in database
    const activeToken = await this.db.findActiveToken(normEmail, 'otp');
    if (!activeToken) {
      return {
        success: false,
        message: 'Invalid or expired verification code. Please request a new one.',
      };
    }

    // 3. Record attempt
    const attempts = await this.db.incrementTokenAttempts(activeToken.id);
    authRateLimiter.recordAttempt(rateCheckKey);

    // 4. Constant-time cryptographic verification
    const isValid = TokenSecurity.verifyTokenHash(rawCode.trim(), activeToken.token_hash);

    if (!isValid) {
      const remaining = Math.max(0, activeToken.max_attempts - attempts);
      if (remaining === 0) {
        await this.db.markTokenUsed(activeToken.id);
      }
      return {
        success: false,
        message: `Incorrect code. ${remaining} attempts remaining.`,
        remainingAttempts: remaining,
      };
    }

    // 5. Successful verification: Mark token used & reset rate limiter
    await this.db.markTokenUsed(activeToken.id);
    authRateLimiter.reset(rateCheckKey);

    // 6. Get or create user
    const user = await this.db.createUser({ email: normEmail, metadata: activeToken.metadata });
    const sessionToken = TokenSecurity.createSessionJwt(user);

    return {
      success: true,
      message: 'Authentication successful',
      user,
      token: sessionToken,
    };
  }

  /**
   * Request a passwordless Magic Link sent via email
   */
  async sendMagicLink(
    email: string,
    appName: string = 'OpenNotify',
    redirectUrl?: string,
    metadata?: Record<string, any>
  ): Promise<AuthResult> {
    const normEmail = email.toLowerCase().trim();

    const cooldown = requestCooldownLimiter.check(`cooldown:${normEmail}`);
    if (!cooldown.allowed) {
      return {
        success: false,
        message: 'Please wait before requesting another sign-in link.',
        retryAfterSeconds: cooldown.retryAfterSeconds,
      };
    }

    const rawToken = TokenSecurity.generateSecureRandomToken();
    const tokenHash = TokenSecurity.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + config.auth.magicLinkExpiresInMinutes * 60 * 1000).toISOString();

    await this.db.saveVerificationToken({
      identifier: normEmail,
      token_hash: tokenHash,
      token_type: 'magic_link',
      attempts: 0,
      max_attempts: 3,
      expires_at: expiresAt,
      metadata: { ...metadata, redirectUrl },
    });

    requestCooldownLimiter.recordAttempt(`cooldown:${normEmail}`);

    const magicLinkUrl = `${config.apiBaseUrl}/api/auth/verify-magic-link?email=${encodeURIComponent(
      normEmail
    )}&token=${rawToken}${redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : ''}`;

    await this.notify.send({
      to: normEmail,
      templateId: 'auth_magic_link',
      variables: {
        magic_link_url: magicLinkUrl,
        app_name: appName,
      },
      metadata: { auth_type: 'magic_link' },
    });

    return {
      success: true,
      message: `A sign-in link has been sent to ${normEmail}`,
    };
  }

  /**
   * Verify Magic Link token
   */
  async verifyMagicLink(email: string, rawToken: string): Promise<AuthResult> {
    const normEmail = email.toLowerCase().trim();
    const activeToken = await this.db.findActiveToken(normEmail, 'magic_link');

    if (!activeToken) {
      return {
        success: false,
        message: 'This sign-in link is invalid or has already expired.',
      };
    }

    const isValid = TokenSecurity.verifyTokenHash(rawToken, activeToken.token_hash);
    if (!isValid) {
      return {
        success: false,
        message: 'Invalid sign-in token.',
      };
    }

    await this.db.markTokenUsed(activeToken.id);
    const user = await this.db.createUser({ email: normEmail, metadata: activeToken.metadata });
    const sessionToken = TokenSecurity.createSessionJwt(user);

    return {
      success: true,
      message: 'Authentication successful',
      user,
      token: sessionToken,
    };
  }

  /**
   * Verify Session JWT token
   */
  async verifySession(jwtToken: string): Promise<{ valid: boolean; user?: any }> {
    const payload = TokenSecurity.verifySessionJwt(jwtToken);
    if (!payload) return { valid: false };

    const user = await this.db.findUserByEmail(payload.email);
    return {
      valid: true,
      user: user || payload,
    };
  }
}
