# ADR-BILLING-001: Cobrança recorrente das assinaturas via Asaas

**Status:** PROPOSTA (decisão do provedor tomada pelo dono do produto em 2026-10-06; detalhes de implementação dependem de revisão)  
**Data:** 2026-10-06  
**Decisor:** Dono do produto + Arquiteto SaaS  
**Relacionados:** `docs/saas/SAAS_CONTROL_PLANE_ARCHITECTURE.md`, migrations 027–030, `ADR-FISCAL-001`

---

## Contexto

O Travel Platform cobra agências assinantes (planos mensais/anuais). Hoje existem
as tabelas `subscriptions`, `billing_invoices`, `billing_payments`,
`billing_webhook_events` e `billing_webhook_audit`, e rotas de leitura/gestão em
`/platform/*`, mas **não há provedor de pagamento, checkout, endpoint de webhook,
retentativa de cobrança nem conciliação**. O cadastro de agência
(`agency-signup.ts`) grava a coluna `agencies.plan` e não cria `subscriptions`.

O mercado é o Brasil: o assinante espera pagar por **Pix, cartão e boleto**,
com recorrência. O desenho de 2026-08-30 previa a interface `BillingProvider`
com stubs de Stripe e Mercado Pago, nunca implementada.

## Decisão

1. **Provedor principal: Asaas.** Confirmado na documentação oficial: assinaturas
   com boleto, Pix e cartão de crédito, Pix Automático, webhooks e emissão
   automática de NFS-e para assinaturas.
2. **Manter a abstração `BillingProvider`**, com duas implementações:
   `AsaasBillingProvider` e `LocalBillingProvider` (testes e demo offline). Trocar
   de provedor no futuro não pode exigir mudança de domínio.
3. **O provedor é a fonte da verdade do dinheiro; o nosso banco é a fonte da
   verdade do acesso.** Estado de pagamento vem do provedor; direito de uso
   (entitlements) é derivado do estado da assinatura no nosso banco.
4. **Webhook é notificação, não verdade.** Ao receber um evento, o handler grava o
   evento de forma idempotente e **consulta o pagamento na API do provedor** antes
   de mudar qualquer estado.
5. **Nenhum dado de cartão passa ou é guardado por nós.** Tokenização/checkout no
   provedor.
6. **Migração aditiva** (próximo número livre, a partir de `099`): nunca editar
   migrations aplicadas.

## Consequências

**Positivas**
- Cobertura de Pix, cartão e boleto com uma integração; NFS-e no mesmo provedor
  (ver `ADR-FISCAL-001`).
- Acesso por plano permanece sob nosso controle e testável sem o provedor.

**Negativas / riscos**
- Dependência de um provedor brasileiro; mitigada pela interface.
- Detalhes do webhook (autenticação, nomes e ordem de eventos, política de
  retentativa) **não foram confirmados** na documentação consultada e devem ser
  validados no **sandbox** antes da implementação.
- Taxas, limites e prazo de repasse precisam ser conferidos em contrato (fora do
  escopo técnico).

## Alternativas consideradas

| Alternativa | Motivo de não ser a principal |
|---|---|
| Stripe | Já citada no desenho; não confirmei Pix Automático/boleto recorrente. Pode voltar como segundo provedor pela mesma interface. |
| Mercado Pago | Não avaliado nesta rodada. |
| Cobrança manual (boleto/Pix avulso) | Não escala nem automatiza suspensão por inadimplência. |

## Fora do escopo desta decisão
Definição de preços e planos (decisão comercial separada), termos de uso e
política de cancelamento/reembolso (jurídico), emissão fiscal (`ADR-FISCAL-001`).
