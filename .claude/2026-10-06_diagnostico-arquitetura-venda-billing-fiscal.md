# Diagnóstico sênior: pronto para vender? Arquitetura de cobrança recorrente e nota fiscal

Data: 2026-10-06 · Escopo: somente leitura (nenhum arquivo do sistema alterado, nada instalado, nenhuma migration, nenhum commit)

## 1. Resumo executivo
- **Código de produto está maduro; a camada comercial não está.** Existem tabelas de assinatura, fatura, pagamento e webhook (migrations 027–030, 097–098) e telas de super admin, mas **não existe nenhum provedor de cobrança, nenhum endpoint de webhook e nenhuma emissão de nota fiscal**. O desenho (`docs/saas/SAAS_CONTROL_PLANE_ARCHITECTURE.md`, 2026-08-30) prevê `BillingProvider` com stubs de Stripe/Mercado Pago, mas o código dessa abstração não foi encontrado em `services/api/src`.
- **Nota fiscal:** não há documentação, tabela, rota nem tela de NFS-e. O que existe em "Faturamento" é lista de faturas/pagamentos e métricas.
- **Prazo regulatório próximo:** NFS-e de padrão nacional obrigatória para ME/EPP do Simples a partir de **1º/11/2026** (emissão pelo Portal Nacional ou por API); para os demais prestadores, desde 1º/01/2026. Confirmar com contador.
- **Infra de produção:** Travel Lite tem go-live preparado no Render (`travellite.travelplataforma.com.br`) mas banco online dedicado, e-mail (Resend) e migrations remotas ainda dependem de decisão/execução. A Full (`api.travelplataforma.com.br`) existe, com release `v1.0.0-rc1` marcada `BLOCKED_EXTERNAL` (Postgres, Redis, segredos).

## 2. Inventário do estado atual
| Área | Estado |
|---|---|
| Repositório | `main` @ `5a70db4`; muito trabalho não commitado (landing redesenhada, logo, vídeos em `brag-output/`, `.claude/`, scripts do Lite). Várias branches/worktrees `feature/mega-*`, `audit/*`, `codex/*` fora do `main`. |
| PRs abertos (GitHub) | #27 `feat(ui): visual reconstruction` (645 arquivos, +82.668/-3.447, **Quality Gates falhando**); #20 Offer & Growth architecture contract (docs, gates ok); #19 Staging readiness remediation (base `feature/financial-foundation`, mergeável). Todos parados desde ago–set/2026. "Mermaid Diagram Sync Assistant" com `ACTION_REQUIRED` em todos. |
| Apps | `agency`, `customer` (+ portal do cliente "Minha Viagem"), `platform-admin` (super admin), `marketing` (landing), `travel-lite` + `services/api` (Full) e `services/api-lite`. |
| Super admin (platform-admin) | Páginas: Agências, Planos, Assinaturas, Faturamento, Leads, Landing CMS, Banners, FAQ, Parceiros, Indicações, Comissões, Créditos, Suporte, Incidentes, Feature flags, Auditoria, Segurança etc. **Sem testes automatizados** (0 arquivos de teste) e 2 avisos de lint. |
| Billing (banco) | `subscriptions`, `subscription_state_changes`, `billing_invoices` (com `tax_amount`, sem campos fiscais), `billing_payments`, `billing_webhook_events` (idempotência por `provider_event_id`) e `billing_webhook_audit`. |
| Billing (API) | Só leitura/gestão: `/platform/subscriptions`, `/platform/invoices`, `/platform/payments`, `/platform/financial`. **Sem** checkout, criação de assinatura no provedor, webhook, retentativa/dunning, cancelamento, conciliação. |
| Landing (marketing) | Redesenhada, logo Bússola, nome "Travel Plataforma"; lint/typecheck/12 testes/build ok. Formulários "Solicitar acesso" e "Teste grátis" dependem da API (`/public/leads`). `PricingPage` com **preços fixos no código (R$ 99 / R$ 299)**, fora da tabela `plans`. |
| Cadastro de agência | `agency-signup.ts` cria `agencies` com coluna `plan`; **não cria assinatura/trial em `subscriptions`** (a ligação entre cadastro e cobrança não existe). |
| Deploy | Render + domínio `travelplataforma.com.br`; Vercel configurado nos 4 frontends (`vercel.json`). Documentação de go-live do Lite pronta. |

## 3. Lacunas para vender (por prioridade)
**P0, bloqueia cobrar o primeiro cliente**
1. Provedor de pagamento recorrente conectado (cartão, Pix, boleto) + criação de cliente/assinatura/checkout.
2. Webhooks assinados e idempotentes alimentando faturas, pagamentos e estado da assinatura.
3. Ligação cadastro → assinatura/trial → *entitlements* (acesso por plano) e bloqueio por inadimplência.
4. Emissão de NFS-e (padrão nacional) disparada pelo pagamento confirmado + tela no super admin.
5. Formalização da empresa vendedora: CNPJ ativo, regime tributário, inscrição municipal, CNAE/código de serviço, certificado digital A1 (quando exigido), conta no provedor.
6. Preços e planos com fonte única (`plans`), não texto fixo na landing.
7. Termos de uso, política de privacidade (LGPD), política de cancelamento/reembolso.
8. Infra de produção: Postgres e Redis, segredos, e-mail transacional, backup.

**P1, logo depois**
- Dunning (retentativas, e-mails de cobrança, suspensão graduada), conciliação diária provedor ↔ banco, reembolso e cancelamento.
- Testes do super admin e do fluxo de cobrança (sandbox do provedor), observabilidade de webhook (alerta de falha).
- Higiene de PRs/branches: decidir o destino de #27, #20, #19 e das branches `mega-*`; commitar o trabalho pendente em branches próprias.
- Mapeamento de status lossy em `listInvoices`/`listPayments` (PARTIAL/CANCELLED/DRAFT viram "OPEN"; PENDING/PROCESSING/CANCELLED viram "FAILED") — corrigir antes de a tela fiscal depender disso.

## 4. Arquitetura-alvo (proposta, ainda sem ADR aprovado)
```
Landing -> cadastro/checkout -> BillingProvider (adapter) -> provedor (Pix/cartão/boleto)
                                      |  webhook assinado
                                      v
              /public|platform/billing/webhooks  (valida assinatura, grava em billing_webhook_events, idempotente)
                                      v
     worker de eventos -> billing_payments / billing_invoices / subscriptions (+ subscription_state_changes)
                                      v
              pagamento confirmado -> fila fiscal -> FiscalProvider (adapter) -> NFS-e (padrão nacional)
                                      v
           fiscal_documents (número, chave, XML, PDF, status, erro) -> super admin "Notas fiscais"
```
- **Módulo de cobrança:** interface `BillingProvider` (createCustomer, createSubscription, cancel, updatePaymentMethod, getInvoice, verifyWebhook, handleEvent); `LocalBillingProvider` para testes; um provedor real. Máquina de estados da assinatura (TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED) com `subscription_state_changes` como trilha.
- **Webhooks:** endpoint público com rate limit `WEBHOOK_EXTERNAL`, validação de assinatura, gravação idempotente antes de processar, retentativa (`next_retry_at`), auditoria (`billing_webhook_audit`).
- **Entitlements:** estado da assinatura → `entitlements` do tenant; fail-closed.
- **Módulo fiscal:** interface `FiscalProvider` (emitirNfse, consultar, cancelar, baixar PDF/XML); tabela nova `fiscal_documents` (1:1 com fatura paga; chave de idempotência por fatura); credenciais/certificado só em gestor de segredos.
- **Super admin:** aba "Notas fiscais" em Faturamento (mock mostrado na conversa), status de conexão dos provedores, reprocessar erro, emitir avulsa, cancelar; ações auditadas e restritas ao papel `BILLING_ADMIN`.
- **Segurança:** tabelas de plataforma sem `agency_id` com RLS de plataforma, MFA nos papéis de cobrança, nada de PAN/cartão no nosso banco (tokenização no provedor), segredos fora do código, logs sem dados pessoais.
- **Documentação a produzir (após decisões):** `ADR-BILLING-001` (provedor e modelo), `ADR-FISCAL-001` (emissão), `DEC` de preços/planos, spec em `docs/05-api/` e `docs/04-database/` (migration 099+ aditiva, nunca editar migrations aplicadas).

## 5. Provedores (para decidir)
| Opção | O que se confirmou | Observação |
|---|---|---|
| Asaas | Assinaturas com boleto, Pix e cartão; Pix Automático; webhooks; API documenta emissão de NFS-e (endpoints `fiscalInfo`, `municipalServiceId/Code`, suporte a Portal Nacional). | Candidato mais aderente a Brasil + SaaS; cobertura de municípios a validar. Fontes: docs.asaas.com. |
| Stripe | Já citada no desenho (stub). | Não confirmei suporte a Pix Automático/boleto recorrente nesta pesquisa. |
| Mercado Pago | Já citado no desenho (stub). | Não pesquisado nesta rodada. |
| Emissor fiscal dedicado (ex.: Focus NFe) | Cobre NFS-e e é opção quando o provedor de cobrança não emite. | Mais um contrato e uma integração. |

## 6. Validação local da landing
- Feito: lint, typecheck, 14 testes e build do `marketing` ok; plataforma-admin lint/typecheck/build ok (0 testes). Landing no ar em `http://localhost:5175/`.
- Pendente (precisa de autorização): subir o stack de demonstração (`npm run demo`: bootstrap → migrate → seed → serviços) para validar formulários da landing contra a API e abrir o super admin com dados.

## 7. Decisões e autorizações necessárias
1. Provedor de cobrança recorrente (Asaas, Stripe ou outro).
2. Caminho da nota fiscal (pelo próprio provedor ou emissor dedicado).
3. Autorizar o stack de demonstração local (Docker + migrations em banco descartável) para validar landing e super admin.
4. Confirmar dados da empresa vendedora (CNPJ, regime, município, certificado) com o contador.
5. Autorizar criação de ADRs/spec e, depois, dependências e migration `099`.

## 8. Decisões tomadas em 2026-10-06
- Provedor de cobrança recorrente: **Asaas**. Nota fiscal: **pelo próprio provedor**. Stack de demonstração local: **autorizado**.
- Documentação criada (somente docs, sem código/migration): `docs/adr/ADR-BILLING-001-cobranca-recorrente-asaas.md`, `docs/adr/ADR-FISCAL-001-emissao-nfse-via-provedor.md`, `docs/superpowers/specs/2026-10-06-billing-fiscal-design.md`.
- Fatos confirmados na documentação oficial do Asaas: assinaturas com boleto/Pix/cartão, Pix Automático, emissão automática de NFS-e para assinaturas (`POST /v3/subscriptions/{id}/invoiceSettings`, `effectiveDatePeriod` incl. `ON_PAYMENT_CONFIRMATION`, `municipalServiceId`/`municipalServiceCode`, `GET /v3/fiscalInfo/municipalOptions`). **Não confirmados** (validar no sandbox): autenticação e eventos do webhook, URLs de sandbox/produção, política de retentativa.

## 9. Validação local executada (stack de demonstração)
Autorizado pelo usuário. `npm run demo` (docker `dev:db` → reset do schema no banco descartável `travel_platform_test` @127.0.0.1:55432 → migrations → seeds) subiu API (4000), agência (5173), super admin (5174), marketing (5175) e cliente (5176). Banco local alterado: schema recriado, senha de teste definida para a conta `admin-platform_owner@platform.test` (arquivo local ignorado pelo git `.tmp/local-platform-admin-credentials.txt`) e 2 leads de teste fictícios.
- Landing: `/`, `/pricing`, `/demo`, `/trial` respondem 200; sem conteúdo publicado no CMS (`{"landing":null}`) a página usa o texto estático (esperado).
- Formulário "Solicitar acesso" → `POST /public/leads` → grava no banco (OK). **Defeitos:** resposta `{"lead":null}` mesmo com sucesso (`getLeadById` lê a listagem inteira); endpoint público aceita `status`/`source` do chamador e não valida corpo (ver spec §10).
- Super admin: login com a conta de teste funciona; **Faturamento** mostra MRR R$ 11.980, ARR R$ 143.760, 20 assinaturas ativas, 15 faturas (9 pagas, 4 abertas, 2 vencidas) e 9 pagamentos; abas Visão Geral/Faturas/Pagamentos. **Não existe aba/área de nota fiscal.**
- Pesquisa e `curl` com acento no corpo via shell do Windows gerou um 400 espúrio (artefato de codificação do teste, não do app).
- Screenshots do painel de super admin expiraram no navegador do app (janela atrás de outra); validação feita por texto/API.
- Stack segue rodando; para encerrar: fechar o processo do `npm run demo` ou `docker rm -f travel-platform-postgres-local` (container de banco) após parar os serviços.
