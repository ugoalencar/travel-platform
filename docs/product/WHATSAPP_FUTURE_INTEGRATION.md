# WhatsApp — Integração Futura (Fase 2+)

**Versão:** 1.0
**Data:** 2026-09-21
**Status:** Arquitetura documentada, não implementada

---

## Visão Geral

Esta documentaçãodescreve a arquitetura planejada para futura integração com WhatsApp Business API, após validação do piloto com deep links.

---

## Fase 1 (Atual)

- Deep links via `https://wa.me/{telefone}?text={mensagem}`
- Compartilhamento manual pelo usuário
- Validação e normalização de telefone
- Message builder com templates em português

---

## Fase 2 (Futuro)

### MessagingProvider Interface

```typescript
export interface MessagingProvider {
  sendMessage(to: string, message: string): Promise<MessageResult>;
  sendTemplate(to: string, templateId: string, params: Record<string, string>): Promise<MessageResult>;
  getStatus(messageId: string): Promise<MessageStatus>;
  processWebhook(payload: unknown): Promise<WebhookEvent>;
}
```

### WhatsAppBusinessProvider

Implementação concreta usando WhatsApp Cloud API:

```typescript
export class WhatsAppBusinessProvider implements MessagingProvider {
  async sendMessage(to: string, message: string): Promise<MessageResult> {
    // POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
  }

  async sendTemplate(to: string, templateId: string, params: Record<string, string>): Promise<MessageResult> {
    // POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
    // { type: "template", template: { name: templateId, ... } }
  }

  async getStatus(messageId: string): Promise<MessageStatus> {
    // GET https://graph.facebook.com/v18.0/{message_id}
  }

  async processWebhook(payload: unknown): Promise<WebhookEvent> {
    // Process webhook from WhatsApp
  }
}
```

### Requisitos

1. **Conta Meta Business** verificada
2. **Número de telefone** registrado no WhatsApp Business
3. **Template messages** aprovados pelo Meta
4. **Webhook endpoint** para receber status de entrega
5. **Rate limiting** respeitado (mensagem por segundo)

### Fluxo

1. Agência configura mensagem no Communication Center
2. Sistema envia via WhatsAppBusinessProvider
3. Webhook recebe status (entregue, lido, etc.)
4. Evento registrado em engagements/customer_interactions

---

## Considerações

- **Custos**: WhatsApp Business API cobra por mensagem after 24h de conversa
- **Templates**: Mensagens de template precisam de aprovação do Meta
- **Opt-in**: Clientes devem consentir em receber mensagens
- **LGPD**: Consentimento obrigatório antes de envio automatizado
- **Rate limits**: Respeitar limites do WhatsApp Business API
