interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  blockedUntil?: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private maxAttempts: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(maxAttempts: number = 5, windowMinutes: number = 10, blockMinutes: number = 15) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMinutes * 60 * 1000;
    this.blockDurationMs = blockMinutes * 60 * 1000;

    // Periodic cleanup of stale entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  check(key: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry) {
      return { allowed: true, remainingAttempts: this.maxAttempts };
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    // Reset if window passed
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.store.delete(key);
      return { allowed: true, remainingAttempts: this.maxAttempts };
    }

    const remaining = Math.max(0, this.maxAttempts - entry.attempts);
    const allowed = entry.attempts < this.maxAttempts;
    const retryAfterSeconds = allowed
      ? undefined
      : Math.max(1, Math.ceil((entry.firstAttemptAt + this.windowMs - now) / 1000));

    return {
      allowed,
      remainingAttempts: remaining,
      retryAfterSeconds,
    };
  }

  recordAttempt(key: string): boolean {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      entry = {
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      };
      this.store.set(key, entry);
      return true;
    }

    entry.attempts += 1;
    entry.lastAttemptAt = now;

    if (entry.attempts >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockDurationMs;
      return false;
    }

    return true;
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.blockedUntil && entry.blockedUntil < now && now - entry.firstAttemptAt > this.windowMs) {
        this.store.delete(key);
      } else if (!entry.blockedUntil && now - entry.firstAttemptAt > this.windowMs) {
        this.store.delete(key);
      }
    }
  }
}

export const authRateLimiter = new RateLimiter(5, 10, 15);
export const requestCooldownLimiter = new RateLimiter(3, 1, 1);
