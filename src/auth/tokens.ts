import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../db/database.js';

export class TokenSecurity {
  /**
   * Hashes a secret code / token with SHA-256 for secure storage in database
   */
  static hashToken(token: string): string {
    return crypto.createHmac('sha256', config.jwtSecret).update(token).digest('hex');
  }

  /**
   * Constant-time comparison between user input and stored hash
   */
  static verifyTokenHash(rawToken: string, storedHash: string): boolean {
    const computedHash = this.hashToken(rawToken);
    try {
      const a = Buffer.from(computedHash, 'hex');
      const b = Buffer.from(storedHash, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Generates a numeric OTP (e.g. 6 digits)
   */
  static generateNumericOtp(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return crypto.randomInt(min, max + 1).toString();
  }

  /**
   * Generates high-entropy cryptographic token for magic links
   */
  static generateSecureRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Signs a secure JWT session token for authenticated users
   */
  static createSessionJwt(user: User, expiresIn: string = '7d'): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        iss: 'open-notify-auth',
      },
      config.jwtSecret,
      { expiresIn } as jwt.SignOptions
    );
  }

  /**
   * Verifies and decodes a JWT session token
   */
  static verifySessionJwt(token: string): any {
    try {
      return jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return null;
    }
  }
}
