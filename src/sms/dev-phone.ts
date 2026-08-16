export interface DevSms {
  id: string;
  to: string;
  from: string;
  body: string;
  timestamp: string;
  previewOtp?: string;
}

class DevPhoneService {
  private messages: DevSms[] = [];

  addMessage(sms: Omit<DevSms, 'id' | 'timestamp'>): DevSms {
    // Extract OTP if present
    const otpMatch = sms.body.match(/\b([0-9]{6})\b/);

    const devSms: DevSms = {
      ...sms,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      previewOtp: otpMatch ? otpMatch[1] : undefined,
    };

    this.messages.unshift(devSms);
    if (this.messages.length > 100) {
      this.messages.pop();
    }
    return devSms;
  }

  getMessages(): DevSms[] {
    return this.messages;
  }

  clear(): void {
    this.messages = [];
  }
}

export const devPhone = new DevPhoneService();
