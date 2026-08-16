export interface DevEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  timestamp: string;
  previewOtp?: string;
  previewMagicLink?: string;
}

class DevInboxService {
  private emails: DevEmail[] = [];

  addEmail(email: Omit<DevEmail, 'id' | 'timestamp'>): DevEmail {
    // Extract OTP if present
    const otpMatch = email.html.match(/\b([0-9]{6})\b/);
    // Extract Magic link if present
    const magicLinkMatch = email.html.match(/href="([^"]*token=[^"]*)"/);

    const devEmail: DevEmail = {
      ...email,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      previewOtp: otpMatch ? otpMatch[1] : undefined,
      previewMagicLink: magicLinkMatch ? magicLinkMatch[1] : undefined
    };

    this.emails.unshift(devEmail);
    if (this.emails.length > 100) {
      this.emails.pop();
    }
    return devEmail;
  }

  getEmails(): DevEmail[] {
    return this.emails;
  }

  getEmailById(id: string): DevEmail | undefined {
    return this.emails.find(e => e.id === id);
  }

  clear(): void {
    this.emails = [];
  }
}

export const devInbox = new DevInboxService();
