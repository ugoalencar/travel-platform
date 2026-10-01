# Travel Lite — Plano e capacidades (plan capabilities)

Documento de definição (PX1-06). Nenhum código de gating existe hoje — este
documento descreve o estado atual, a matriz pretendida e onde o gating
viveria, para embasar a decisão de produto/arquitetura. A parte arquitetural
(onde armazenar o plano) exige ADR em `docs/adr/` **antes** da implementação;
nenhum ADR foi aberto nesta macrofase.

## 1. Estado atual

- A Travel Lite **não tem modelo de plano**. Não existe coluna de plano,
  tabela de assinatura ou limite de uso em `services/api-lite`.
- O único mecanismo de restrição hoje é **RBAC por usuário**
  (`docs/travel-lite/ACCESS-CONTROL.md`): perfis MASTER/ADMIN/MANAGER/SELLER/
  VIEWER com permissões padrão + exceções `GRANT`/`REVOKE`, aplicadas em
  `requirePermission`/`scopeFor` nas rotas da API.
- O escopo de produto prevê plano limitado: `Plano FREE — limitado a 50
  clientes, 10 viagens` (`docs/00-product/scope.md`) e `Plano (FREE inicial)`
  (`docs/00-product/mvp.md`).

## 2. Terminologia

- **Viagem** (escopo Full da plataforma) ↔ **venda** no Lite: a entidade
  equivalente no Lite é `sales` (ciclo rascunho → confirmada → parcelas →
  comissão). Contagens de "viagens/mês" do plano devem ser lidas sobre
  `sales`. *Definição final de "viagem" no contexto de plano: decisão humana
  (produto).*

## 3. Matriz de capacidades por plano

Inicialmente só FREE está preenchido; coluna "pago futuro" é placeholder.

| Capacidade | FREE | Pago futuro |
|---|---|---|
| Clientes | 50 | a definir |
| Vendedores | a definir (ex.: 3) | a definir |
| Usuários/login | a definir (ex.: 2) | a definir |
| Vendas por mês | 10 | a definir |
| Importações de planilha | a definir (ex.: 1/mês) | a definir |
| Relatórios | básicos (aba Vendas) | completos |
| Integrações / outbox | preparação apenas (`integration_outbox`), sem sync | com sincronização |

*Números marcados "a definir" são decisão de produto antes de qualquer
implementação.*

## 4. Onde o gating viveria no Lite

- **Server-side em `services/api-lite`**, nas rotas de criação — nunca só na
  UI. Exemplo: `POST /customers` → quando `total >= limite`, responder `403`
  com erro `UPGRADE_REQUIRED` (mensagem pt-BR: "Limite do plano FREE atingido.
  Faça upgrade para continuar.").
- Leitura do limite em escopo de tenant (RLS/`agencyId` derivado da sessão,
  nunca de input do cliente).
- **Onde mora o campo de plano:** coluna em `tenants` vs tabela nova
  `tenant_plans` — *a decidir em ADR* (afeta migração própria
  `infrastructure/migrations-travel-lite/`, nunca 001..096 da plataforma).
- Falha fail-closed: sem plano identificável → tratar como FREE (mais
  restritivo), não como ilimitado.

## 5. Uso na UI

- Banner de uso ("12/50 clientes") em Cadastros/Clientes quando perto do
  limite.
- Mensagem de upgrade ao receber `403 UPGRADE_REQUIRED`.
- Coerência com futura tela "Seu plano" (mesma fonte de contagem: a API).

## 6. Relação com a plataforma

- `integration_outbox` já está preparada (`docs/travel-lite/INTEGRATION-MAPPING.md`).
- Planos reais (plans/subscriptions) vivem no platform-admin da plataforma
  Full (`docs/AI_CONTEXT.md`). Até existir sincronização, o Lite deve ser
  tratado como **subconjunto espelhado**: o plano efetivo é o do
  platform-admin quando houver, com FREE local como fallback.
- Nenhuma leitura direta das tabelas da plataforma Full a partir do Lite.

## 7. Portabilidade

- Export CSV de cadastros (PX1-12) é pré-requisito de upgrade: o usuário
  precisa poder levar seus dados antes de sair do FREE.

## 8. Não-objetivos

- Billing, cobrança, gateway de pagamento, marketplace, faturamento fiscal.
  Planos são gating de capacidade, não monetização nesta fase.

## Pendências antes de implementar (PX2)

1. Aprovar matriz (números "a definir") — produto.
2. ADR: armazenamento do plano (`tenants` vs `tenant_plans`), espelhamento do
   platform-admin e formato do erro `UPGRADE_REQUIRED`.
3. Testes de limite exato (403), admin acima do limite bloqueado e UI
   exibindo o estado.
