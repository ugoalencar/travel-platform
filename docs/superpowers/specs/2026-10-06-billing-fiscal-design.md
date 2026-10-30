# Spec: cobrança recorrente (Asaas) e nota fiscal (NFS-e) no Travel Plataforma

**Data:** 2026-10-06 · **Status:** RASCUNHO PARA REVISÃO (nenhuma implementação iniciada)  
**ADRs:** `docs/adr/ADR-BILLING-001-cobranca-recorrente-asaas.md`, `docs/adr/ADR-FISCAL-001-emissao-nfse-via-provedor.md`  
**Diagnóstico de origem:** `.claude/2026-10-06_diagnostico-arquitetura-venda-billing-fiscal.md`

## 1. Objetivo
Permitir vender o Travel Plataforma: uma agência escolhe um plano, paga por Pix,
cartão ou boleto de forma recorrente, recebe nota fiscal, e o acesso ao sistema
acompanha o estado da assinatura. O dono do produto acompanha tudo no super
admin, inclusive as notas.

**Fora de escopo:** definir preços/planos, termos de uso, política de reembolso,
marketplace de segundo provedor, split de pagamento, cobrança dentro das agências
(contas a receber das agências com seus clientes).

## 2. Estado atual (resumo)
Existem tabelas de assinatura/fatura/pagamento/webhook e rotas de leitura; faltam
provedor, checkout, webhook, dunning, conciliação e fiscal. O cadastro cria
`agencies.plan` mas não `subscriptions`. A página de preços tem valores fixos no
código (R$ 99 / R$ 299), fora de `plans`.

## 3. Fluxos

### 3.1 Contratação (self-service)
1. Landing → "Criar conta" → cadastro de agência (`agency-signup`) cria **agência +
   `subscriber_tenant` + `subscription` em `TRIAL`** (data de fim de trial vinda do plano).
2. Antes do fim do trial (ou ao escolher o plano), o app da agência abre um
   **checkout do provedor** (link/sessão). Dados de pagamento só no provedor.
3. Webhook de confirmação ativa a assinatura (`TRIAL → ACTIVE`).

### 3.2 Cobrança recorrente
O provedor gera cada cobrança. Cada evento recebido vira fatura/pagamento locais
(`billing_invoices`/`billing_payments`) e atualiza a assinatura. Nova fatura
paga dispara a emissão fiscal (3.4).

### 3.3 Inadimplência (parâmetros configuráveis; valores a decidir comercialmente)
`ACTIVE → PAST_DUE` no vencimento sem pagamento → avisos por e-mail → carência →
`SUSPENDED` (acesso somente leitura ou bloqueio, a decidir) → `CANCELLED`. Toda
transição grava `subscription_state_changes` com motivo e ator (sistema ou
usuário de plataforma).

### 3.4 Nota fiscal
Pagamento confirmado → registro `fiscal_documents` (idempotente por fatura) →
emissão pelo provedor (`ON_PAYMENT_CONFIRMATION`) → atualização de status/número/
arquivos por webhook ou consulta → visível no super admin; falhas ficam em
`ERROR` para reprocessamento manual.

## 4. Máquina de estados da assinatura
```
TRIAL -> ACTIVE -> PAST_DUE -> SUSPENDED -> CANCELLED
  |         ^          |            |
  |         +----------+------------+   (pagamento regularizado)
  +--------------------------------> CANCELLED (trial não convertido / cancelamento)
```
Regra de ouro: **estado nunca regride por evento antigo**; eventos carregam data
do provedor e só aplicam se mais novos que a última mudança.

## 5. Dados (migrations aditivas a partir de `099`, a escrever só após aprovação)
- `billing_provider_customers`: `subscriber_tenant_id`, `provider`, `provider_customer_id` (único por tenant/provedor).
- Ajustes em `subscriptions`: `provider_name`/`provider_reference` já existem; acrescentar `provider_status` e `last_provider_event_at`.
- `fiscal_documents`: `id`, `invoice_id` (único), `status` (`PENDING`, `ISSUED`, `ERROR`, `CANCELLED`), `number`, `verification_code`, `provider_reference`, `pdf_url`, `xml_url`, `issued_at`, `error_code`, `error_message`, `attempts`, `created_at`, `updated_at`.
- `fiscal_settings` (linha única da plataforma): regime, município, código de serviço, ambiente (`SANDBOX`/`PRODUCTION`), referência de segredos. **Sem segredos no banco.**
- Todas as tabelas de plataforma **sem `agency_id`**, com RLS de plataforma e grants na role de plataforma (padrão das migrations 077/095).

## 6. API (Fastify, prefixos existentes)
| Método e rota | Papel | Função |
|---|---|---|
| `POST /billing/checkout` (tenant, OWNER/ADMIN) | tenant | Cria sessão de checkout para o plano; `agencyId` vem do contexto, nunca do corpo. |
| `POST /public/billing/webhooks/asaas` | público | Recebe evento; valida autenticação do provedor; grava idempotente; responde rápido. |
| `GET /platform/billing/providers` | plataforma | Status de conexão (NOT_CONNECTED/SANDBOX/LIVE) sem expor segredos. |
| `GET /platform/fiscal/documents` e `/:id` | plataforma | Lista/detalhe de notas. |
| `POST /platform/fiscal/documents/:id/retry` | BILLING_ADMIN+ | Reprocessa nota com erro. |
| `POST /platform/fiscal/documents/:id/cancel` | BILLING_ADMIN+ | Cancela nota (com motivo, auditado). |
| `POST /platform/fiscal/documents` | BILLING_ADMIN+ | Emissão avulsa vinculada a uma fatura. |

Validação de entrada com schema em todas as rotas; limitar o corpo do webhook;
rate limit `WEBHOOK_EXTERNAL`. O `status` e campos internos nunca vêm de rota pública.

## 7. Webhook: algoritmo
1. Verificar autenticação do provedor (mecanismo exato **a confirmar no sandbox**).
2. Inserir em `billing_webhook_events` com `UNIQUE(provider, provider_event_id)`;
   duplicata → 200 sem reprocessar.
3. Responder 200 imediatamente; processar em worker/tarefa.
4. No processamento, **consultar o pagamento/assinatura na API do provedor** e só
   então aplicar a transição (idempotente, ordenada por data).
5. Falha → `processing_error`, `retry_count`, `next_retry_at` (backoff); alerta
   no super admin quando houver eventos acima do limite.
6. Rotina diária de **conciliação**: compara pagamentos do provedor com o banco e
   corrige divergências.

## 8. Acesso (entitlements)
`ACTIVE`/`TRIAL` → plano completo; `PAST_DUE` → aviso; `SUSPENDED` → restrição
definida pelo produto; `CANCELLED` → sem acesso. Fail-closed se o estado for
desconhecido. Reaproveita o modelo de `entitlements`/`plan capabilities` existente.

## 9. Super admin (`apps/platform-admin`)
- **Faturamento → Notas fiscais** (mock aprovado em conversa): cartões de status
  (cobrança, emissor fiscal, certificado, notas com erro), tabela (nº, agência,
  competência, valor, status), detalhe com PDF/XML, reprocessar, cancelar, emitir avulsa.
- **Conexões**: mostrar `NOT_CONNECTED`/`SANDBOX`/`LIVE` por provedor.
- Corrigir antes: mapeamento de status que colapsa `PARTIAL`/`CANCELLED`/`DRAFT`
  em "Aberto" e `PENDING`/`PROCESSING` em "Falhou".
- Acrescentar testes (hoje o app não tem nenhum).

## 10. Segurança
- Papéis: apenas `BILLING_ADMIN`, `PLATFORM_ADMIN`, `PLATFORM_OWNER` veem/alteram fiscal; MFA obrigatório nesses papéis.
- Segredos só em gestor de segredos; nunca em log, erro, teste ou doc.
- Sem PAN/CVV; sem dados pessoais desnecessários nos logs (LGPD).
- Auditoria (`platform_audit_logs`) para emitir, cancelar, reprocessar, alterar configuração.
- **Achado a corrigir junto:** `POST /public/leads` aceita `status` e `source` do chamador e não valida o corpo; deve ter schema, limites, lista fechada de `source`, rate limit/captcha e não aceitar `status`. Também responde `{"lead":null}` ao criar (leitura via listagem completa).

## 11. Testes
- **Unitários:** máquina de estados, idempotência de webhook, ordenação de eventos, mapeamento de status.
- **Contrato** com `LocalBillingProvider`/`LocalFiscalProvider` (mesmos testes valem para o Asaas).
- **Banco** (`npm run test:db`): RLS de plataforma, unicidade de evento e de documento fiscal.
- **Segurança** (`npm run test:security`): papéis, ausência de segredo em resposta, webhook sem autenticação rejeitado.
- **Sandbox do provedor** (manual/automatizado fora do CI): ciclo completo cobrança → webhook → nota.

## 12. Entrega em fases (cada fase com portões: lint, typecheck, test, test:db, build)
1. **Fundação:** correções de status, testes do super admin, `LocalBillingProvider`/`LocalFiscalProvider`, migration, rota de webhook com idempotência (sem provedor real).
2. **Asaas sandbox:** `AsaasBillingProvider`, checkout, assinatura, conciliação, estados e entitlements.
3. **Fiscal:** `fiscal_settings`, `fiscal_documents`, `AsaasFiscalProvider` em sandbox, tela "Notas fiscais".
4. **Endurecimento:** dunning, alertas, `leads` público, documentação OpenAPI.
5. **Go-live controlado:** chaves de produção via segredos, primeiro cliente real, monitoramento de webhooks e notas.

## 13. Pré-requisitos fora do código (formalização)
CNPJ e regime tributário; inscrição municipal e código de serviço (com o contador);
certificado digital se o município exigir; conta e habilitação fiscal no Asaas;
termos de uso, privacidade (LGPD), cancelamento e reembolso; e-mail transacional;
Postgres/Redis de produção; decisão de preços/planos como fonte única em `plans`.

## 14. Perguntas em aberto
1. Valores e periodicidade dos planos; existe trial? Quantos dias?
2. Política de inadimplência (carência e o que significa "suspenso").
3. A empresa vendedora é MEI, Simples ou lucro presumido? Município de emissão?
4. Haverá cobrança anual com desconto e cupons (`coupons` já existe)?
5. Webhook do Asaas: mecanismo de autenticação e eventos (confirmar no sandbox).
