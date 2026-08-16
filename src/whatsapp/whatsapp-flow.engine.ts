import { DatabaseAdapter, WhatsAppTemplate, WhatsAppAutomationRule, WhatsAppButton } from '../db/database.js';
import { whatsappService, InboundWhatsAppMessage } from './whatsapp.service.js';
import { devWhatsApp } from './dev-whatsapp.js';

export interface FlowExecutionResult {
  handled: boolean;
  actionTaken: 'button_branch' | 'keyword_rule' | 'template_dispatched' | 'text_reply' | 'fallback';
  responseSent?: string;
  templateId?: string;
  matchedRuleId?: string;
  buttonsSent?: WhatsAppButton[];
}

export class WhatsAppFlowEngine {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /**
   * Replaces mustache variables like {{customer_name}}
   */
  private renderVariables(text: string, vars: Record<string, any> = {}): string {
    let result = text;
    for (const [k, v] of Object.entries(vars)) {
      const reg = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
      result = result.replace(reg, String(v));
    }
    return result;
  }

  /**
   * Processes an incoming WhatsApp message or button click
   */
  async processInbound(inbound: InboundWhatsAppMessage, variables: Record<string, any> = {}): Promise<FlowExecutionResult> {
    const from = inbound.from.replace(/[^0-9+]/g, '');
    const to = inbound.to.replace(/[^0-9+]/g, '');

    // 1. Log inbound message in database
    await this.db.logWhatsAppMessage({
      from,
      to,
      direction: 'inbound',
      type: inbound.type === 'button_reply' ? 'interactive_response' : 'text',
      body: inbound.type === 'button_reply' ? `[Selected Button: ${inbound.buttonTitle || inbound.buttonId}]` : inbound.text || '',
      selectedButton: inbound.buttonId ? { id: inbound.buttonId, title: inbound.buttonTitle || inbound.buttonId } : undefined,
      status: 'received',
      provider: 'webhook',
    });

    // Also record in Dev WhatsApp simulator for live Studio UI chat sync
    devWhatsApp.addMessage({
      from,
      to,
      direction: 'inbound',
      type: inbound.type === 'button_reply' ? 'interactive_response' : 'text',
      body: inbound.type === 'button_reply' ? `[Selected Button: ${inbound.buttonTitle || inbound.buttonId}]` : inbound.text || '',
      selectedButton: inbound.buttonId ? { id: inbound.buttonId, title: inbound.buttonTitle || inbound.buttonId } : undefined,
    });

    console.log(`\n📥 [WHATSAPP INBOUND EVENT] From: ${from} | Type: ${inbound.type}`);
    if (inbound.type === 'button_reply') {
      console.log(`   🔘 Clicked Button ID: ${inbound.buttonId} (${inbound.buttonTitle})`);
    } else {
      console.log(`   💬 Inbound Text: ${inbound.text}`);
    }

    // -------------------------------------------------------------
    // BRANCH 1: User Clicked an Interactive Quick Reply Button
    // -------------------------------------------------------------
    if (inbound.type === 'button_reply' && inbound.buttonId) {
      const buttonId = inbound.buttonId;

      // Look across all saved interactive templates for button actions
      const templates = await this.db.listWhatsAppTemplates();
      for (const tpl of templates) {
        const matchedBtn = tpl.buttons.find((b) => b.id === buttonId);
        if (matchedBtn) {
          // If the button has a direct reply text configured
          if (matchedBtn.replyText) {
            const reply = this.renderVariables(matchedBtn.replyText, variables);
            await whatsappService.sendWhatsApp({
              to: from,
              body: reply,
            });

            await this.db.logWhatsAppMessage({
              from: to,
              to: from,
              direction: 'outbound',
              type: 'text',
              body: reply,
              status: 'sent',
              provider: 'flow-engine',
            });

            return {
              handled: true,
              actionTaken: 'button_branch',
              responseSent: reply,
            };
          }

          // If the button triggers a follow-up sub-template
          if (matchedBtn.nextTemplateId) {
            const nextTpl = await this.db.getWhatsAppTemplate(matchedBtn.nextTemplateId);
            if (nextTpl) {
              const body = this.renderVariables(nextTpl.body, variables);
              const header = nextTpl.headerText ? this.renderVariables(nextTpl.headerText, variables) : undefined;
              const footer = nextTpl.footerText ? this.renderVariables(nextTpl.footerText, variables) : undefined;

              await whatsappService.sendWhatsApp({
                to: from,
                headerText: header,
                body,
                footerText: footer,
                buttons: nextTpl.buttons,
              });

              await this.db.logWhatsAppMessage({
                from: to,
                to: from,
                direction: 'outbound',
                type: 'interactive',
                headerText: header,
                body,
                footerText: footer,
                buttons: nextTpl.buttons,
                status: 'sent',
                provider: 'flow-engine',
              });

              return {
                handled: true,
                actionTaken: 'template_dispatched',
                templateId: nextTpl.id,
                responseSent: body,
                buttonsSent: nextTpl.buttons,
              };
            }
          }
        }
      }

      // Check rules configured for button clicks
      const rules = await this.db.listWhatsAppRules();
      const clickRule = rules.find((r) => r.enabled && r.triggerType === 'button_click' && r.triggerValue === buttonId);
      if (clickRule) {
        if (clickRule.responseType === 'template' && clickRule.responseTemplateId) {
          const tpl = await this.db.getWhatsAppTemplate(clickRule.responseTemplateId);
          if (tpl) {
            const body = this.renderVariables(tpl.body, variables);
            await whatsappService.sendWhatsApp({
              to: from,
              headerText: tpl.headerText ? this.renderVariables(tpl.headerText, variables) : undefined,
              body,
              footerText: tpl.footerText ? this.renderVariables(tpl.footerText, variables) : undefined,
              buttons: tpl.buttons,
            });

            return {
              handled: true,
              actionTaken: 'template_dispatched',
              matchedRuleId: clickRule.id,
              templateId: tpl.id,
              responseSent: body,
              buttonsSent: tpl.buttons,
            };
          }
        }

        if (clickRule.responseText) {
          const reply = this.renderVariables(clickRule.responseText, variables);
          await whatsappService.sendWhatsApp({
            to: from,
            body: reply,
          });

          return {
            handled: true,
            actionTaken: 'button_branch',
            matchedRuleId: clickRule.id,
            responseSent: reply,
          };
        }
      }

      // Fallback acknowledgement for unknown button ID
      const fallbackReply = `You selected: ${inbound.buttonTitle || buttonId}. Thank you!`;
      await whatsappService.sendWhatsApp({
        to: from,
        body: fallbackReply,
      });

      return {
        handled: true,
        actionTaken: 'fallback',
        responseSent: fallbackReply,
      };
    }

    // -------------------------------------------------------------
    // BRANCH 2: Customer Sent a Plain Text Message (Keyword Trigger)
    // -------------------------------------------------------------
    const userText = (inbound.text || '').toLowerCase().trim();
    const rules = await this.db.listWhatsAppRules();

    for (const rule of rules.filter((r) => r.enabled && r.triggerType === 'keyword')) {
      const regex = new RegExp(`(^|\\b)(${rule.triggerValue})(\\b|$)`, 'i');
      if (regex.test(userText)) {
        if (rule.responseType === 'template' && rule.responseTemplateId) {
          const tpl = await this.db.getWhatsAppTemplate(rule.responseTemplateId);
          if (tpl) {
            const body = this.renderVariables(tpl.body, variables);
            const header = tpl.headerText ? this.renderVariables(tpl.headerText, variables) : undefined;
            const footer = tpl.footerText ? this.renderVariables(tpl.footerText, variables) : undefined;

            await whatsappService.sendWhatsApp({
              to: from,
              headerText: header,
              body,
              footerText: footer,
              buttons: tpl.buttons,
            });

            await this.db.logWhatsAppMessage({
              from: to,
              to: from,
              direction: 'outbound',
              type: tpl.buttons && tpl.buttons.length > 0 ? 'interactive' : 'text',
              headerText: header,
              body,
              footerText: footer,
              buttons: tpl.buttons,
              status: 'sent',
              provider: 'flow-engine',
            });

            return {
              handled: true,
              actionTaken: 'template_dispatched',
              matchedRuleId: rule.id,
              templateId: tpl.id,
              responseSent: body,
              buttonsSent: tpl.buttons,
            };
          }
        }

        if (rule.responseText) {
          const reply = this.renderVariables(rule.responseText, variables);
          await whatsappService.sendWhatsApp({
            to: from,
            body: reply,
            buttons: rule.buttons,
          });

          await this.db.logWhatsAppMessage({
            from: to,
            to: from,
            direction: 'outbound',
            type: rule.buttons && rule.buttons.length > 0 ? 'interactive' : 'text',
            body: reply,
            buttons: rule.buttons,
            status: 'sent',
            provider: 'flow-engine',
          });

          return {
            handled: true,
            actionTaken: 'keyword_rule',
            matchedRuleId: rule.id,
            responseSent: reply,
            buttonsSent: rule.buttons,
          };
        }
      }
    }

    // Default Fallback: Prompt user with main menu
    const defaultMenu = await this.db.getWhatsAppTemplate('wa_support_menu');
    if (defaultMenu) {
      const body = this.renderVariables(defaultMenu.body, { company_name: 'OpenNotify' });
      await whatsappService.sendWhatsApp({
        to: from,
        headerText: defaultMenu.headerText,
        body,
        footerText: defaultMenu.footerText,
        buttons: defaultMenu.buttons,
      });

      return {
        handled: true,
        actionTaken: 'fallback',
        templateId: defaultMenu.id,
        responseSent: body,
        buttonsSent: defaultMenu.buttons,
      };
    }

    const simpleFallback = "Thanks for your message! Type 'menu' or 'help' to see available options.";
    await whatsappService.sendWhatsApp({
      to: from,
      body: simpleFallback,
    });

    return {
      handled: true,
      actionTaken: 'fallback',
      responseSent: simpleFallback,
    };
  }
}
