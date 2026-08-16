import { WhatsAppButton, WhatsAppMessageLog } from '../db/database.js';

export interface DevWhatsAppMessage {
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
  timestamp: string;
}

class DevWhatsAppSimulator {
  private messages: DevWhatsAppMessage[] = [];

  addMessage(msg: Omit<DevWhatsAppMessage, 'id' | 'timestamp'>): DevWhatsAppMessage {
    const devMsg: DevWhatsAppMessage = {
      ...msg,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };

    this.messages.unshift(devMsg);
    if (this.messages.length > 200) {
      this.messages.pop();
    }

    return devMsg;
  }

  getMessages(filterPhone?: string): DevWhatsAppMessage[] {
    if (filterPhone) {
      const norm = filterPhone.replace(/[^0-9+]/g, '');
      return this.messages.filter((m) => m.from === norm || m.to === norm);
    }
    return this.messages;
  }

  clear() {
    this.messages = [];
  }
}

export const devWhatsApp = new DevWhatsAppSimulator();
