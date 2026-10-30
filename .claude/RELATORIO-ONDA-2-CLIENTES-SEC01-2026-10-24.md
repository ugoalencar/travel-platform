# Relatório Onda 2 — SEC-01 (permissões individuais) e Frente 2 (configuração do cadastro de cliente) — 2026-10-24

Ordem seguida: SEC-01 → Frente 2; **Full primeiro**, validado, depois Lite (DEC-007). Sem commit nem push. Migrations só como arquivos novos, aplicadas apenas em bancos descartáveis locais. Não toquei demo (4010 / 55436), 55438, Supabase, Render, Vercel ou Gadotti. Alterações em aberto de outras frentes foram preservadas (edições pontuais, listadas abaixo).

## 1. Resultado

| Entrega | Full | Lite |
|---|---|---|
| SEC-01 backend (catálogo, resolvedor, overrides, rotas, auditoria, migration) | feito | já existia GRANT/REVOKE por usuário; só acrescentada a permissão `customers.fields_manage` e documentada a precedência |
| SEC-01 UI | "Permissões individuais" no modal do membro (Configurações → Equipe) | — (Lite já tem tela de permissões) |
| Frente 2 backend (registro de campos, tabela, API, validação no servidor, auditoria) | feito (migration 104) | feito (migration 013) |
| Frente 2 UI | aba "Cadastro de cliente" em Configurações + formulário de cliente segue a configuração | seção "Cadastro de cliente" em Cadastros (só com `customers.fields_manage`) + formulário de cliente segue a configuração |

## 2. Arquivos

**Novos — Full:** `infrastructure/migrations/103_user_permission_overrides.sql`, `104_customer_field_settings.sql`; `services/api/src/permissions/{permission-catalog,resolver}.ts`, `user-permission-overrides.ts`, `routes/permission-overrides.ts`, `customer-field-settings.ts`; `apps/agency/src/components/settings/{PermissionOverridesEditor,CustomerFieldSettingsTab}.tsx`; `docs/adr/ADR-009-permissoes-individuais-por-usuario.md`.
**Novos — Lite:** `infrastructure/migrations-travel-lite/013_customer_field_settings.sql`, `services/api-lite/src/customer-field-settings.ts`, `apps/travel-lite/src/pages/CustomerFieldsSection.tsx`.
**Testes novos:** `services/api/tests/{permission-resolver,customer-field-settings}.test.ts`; `tests/integration/database/{user-permission-overrides,customer-field-settings}.integration.test.ts`; `services/api-lite/tests/customer-field-settings.test.ts`; `apps/agency/src/components/settings/{PermissionOverridesEditor,PermissionOverridesEditorLoad,CustomerFieldSettingsTab}.test.tsx`, `apps/agency/src/pages/CustomersRequiredExtras.test.tsx`; `apps/travel-lite/src/{CustomerFieldsSection,CustomersFieldRules}.test.tsx`.
**Editados (arquivos que também têm alterações de outras frentes; só linhas pontuais):** `services/api/src/{app,audit-log,area-grants}.ts`, `services/api/src/routes/customers.ts`; `apps/agency/src/lib/api.ts` (novo `api.put`, `getCustomerFieldSettings`/`saveCustomerFieldSettings`, `address` em `CreateCustomerInput`), `pages/{SettingsPage,CustomersPage}.tsx`, `pages/CustomersPage.test.tsx`; `services/api-lite/src/{access,audit-log}.ts`, `routes/customers.ts`; `apps/travel-lite/src/pages/{CatalogPage,CustomersPage}.tsx`; `tests/integration/database/{002_prepare_local_roles.sql,database.integration.test.ts}` (tabelas/grants novos); `services/api/tests/{financial-http,customer-routes,customer-e2e}.test.ts` (lista de migrations: 103/104); `docs/travel-lite/ACCESS-CONTROL.md`.

## 3. Como funciona (resumo)

**SEC-01 (Full).** Precedência **restrição (por papel ou REVOKE do usuário) > concessão (GRANT) > papel**. OWNER/ADMIN nunca recebem override nem restrição, mas ainda precisam do piso da rota. Catálogo fechado em código; chave fora dele é negada. Só leituras são delegáveis (GRANT) e só a AGENT; `customers:fields_manage` e `catalog:manage` são só de administrador e não delegáveis (Q4 do ADR-008). Anti-escalada: só ADMIN/OWNER editam; nunca o próprio usuário; o ator só concede o que possui; alvo OWNER/ADMIN → 403; alvo de outra agência → 404 sem vazar existência; substituição atômica com `FOR UPDATE`. Auditoria obrigatória por chave alterada (`USER_PERMISSION_OVERRIDES_CHANGED`, com motivo). Efeito real: a ponte `requireRoleOrAreaGrant` (14 rotas financeiras) consulta o resolvedor; o legado `agent_area_grants` continua valendo, mas restrição/REVOKE o vence. REVOKE só é aceito para chaves com `enforced=true` (hoje as 9 financeiras) — o servidor não promete bloqueio que não aplica.

**Frente 2.** Registro de campos em código (chaves portáteis em snake_case); sem linha = habilitado e opcional; `name` fixo. Servidor: criação valida obrigatórios (422 `FIELD_REQUIRED`); **qualquer** escrita em campo desabilitado é 422 `FIELD_DISABLED` (mesmo em branco, para não apagar dado); edição valida só os campos presentes (cliente antigo continua editável); desabilitar não apaga dado. Configurar exige ADMIN+ e `customers:fields_manage`. Auditoria obrigatória, um evento por campo alterado. Lite ⊆ Full testado (chaves e rótulos).

## 4. Testes: quais falhavam antes

Escritos antes da implementação (falhavam por módulo/rota inexistente): `permission-resolver.test.ts`, `customer-field-settings.test.ts` (Full e Lite), os dois testes de integração e os testes de UI.
Após a 1ª revisão do Codex, escritos e vistos falhando antes da correção: chave fora do catálogo com piso satisfeito (resolvedor liberava), escrita em branco em campo desabilitado (era aceita), REVOKE só em chaves aplicadas, formulário rápido com obrigatório sem input.
Já passavam (lacuna de cobertura): rollback de auditoria (gatilho que derruba o INSERT de `audit_logs`), duas substituições simultâneas, concessão legada em `my-permissions`.

Regressões que **eu causei e corrigi**: testes com lista própria de migrations quebraram (500) porque as rotas agora leem 103/104: `financial-http`, `customer-routes`, `customer-e2e` ganharam a migration na lista. Nenhuma exceção "fail open" foi aberta para isso.

## 5. Gates (todos rodados em contêiner/porta próprios, derrubados ao fim)

| Gate | Resultado |
|---|---|
| `services/api` typecheck / build | OK |
| `services/api` lint dos arquivos tocados | OK (o lint do workspace inteiro tem erros pré-existentes de outra frente) |
| `services/api` testes focados (resolvedor, campos, CSV, CEP, financial-http, sec-a, restrições, 9 arquivos de cliente/trip/wish/sec-g) | passando (250 + 258) |
| `npm run test:db` (4 arquivos: schema/RLS + CSV + SEC-01 + Frente 2), contêiner `travel-full-w2-testdb` / 55626 | 69 testes passando |
| `apps/agency` lint / typecheck / suíte completa / build | OK, 31 arquivos, 219 testes |
| `services/api-lite` lint / typecheck / suíte completa (55600) / build | OK, 34 arquivos, 354 testes |
| `apps/travel-lite` lint / typecheck / suíte completa / build | OK, 19 arquivos, 180 testes |
| Suíte completa do Full API | **não rodada de forma isolada; a cargo da integração final** (ver regra do coordenador) |

## 6. Revisão do Codex (somente leitura, `gpt-6.1-sol`) — duas rodadas

Quem fez o quê: **toda a implementação, os testes e os gates foram meus; o Codex apenas revisou** (não pedi implementação de arquivos).

Rodada 1 — 6 bloqueantes, todos corrigidos: (1) REVOKE aceito mas sem efeito em rotas → `enforced` por chave, REVOKE só onde o servidor aplica; (2) campos obrigatórios impossíveis de preencher no formulário rápido → o formulário renderiza inputs para obrigatórios sem campo próprio (endereço obrigatório = "cidade"); (3) chave desconhecida liberada pelo piso → negada; (4) PATCH apagava campo desabilitado em branco → 422; (5) auditoria truncada → um evento por chave, com motivo; (6) editor com falha de carga permitia salvar `[]` → botão desabilitado. Não bloqueantes: `my-permissions` ignorava concessão legada (corrigido); faltavam testes de rollback de auditoria e concorrência (adicionados).
Rodada 2 — 5 achados, todos corrigidos: (1) SALES_* marcados como aplicados sem estar → `enforced=false`; (2) Lite permitia delegar `customers.fields_manage` a não-administrador → PUT agora exige ADMIN/MASTER (divergência com o Full removida, com teste); (3) auditoria: remoção sem motivo, motivo truncado, mudança só de motivo ignorada → motivo limitado a 120 caracteres, mudança de motivo persiste e é auditada, remoções levam o motivo antigo; (4) editor oferecia "Bloquear" para chaves não aplicadas → só oferece se `enforced`; (5) Lite exigia preencher obrigatório ausente ao editar cliente antigo → edição envia só o que mudou.
**Não houve terceira rodada**: as correções da rodada 2 foram verificadas por testes e gates, não por nova revisão do Codex.

## 7. Decisões adotadas por padrão (usuário ausente)

- Erros de validação do SEC-01 saem **400**, não 422 (para não editar `errors.ts`, em uso por outra frente). Violações de configuração de campos usam 422 (`FormFieldError` já existente).
- `catalog.manage` existe no catálogo do Full (não delegável) mas **não foi criada no Lite**: nenhuma rota usa; a Onda B decide.
- Só leituras delegáveis (as 12 áreas do legado); nenhuma mutação.
- Motivo (`reason`) de overrides limitado a 120 caracteres (limite do sanitizador de auditoria).
- Endereço obrigatório no formulário rápido do Full = campo "cidade" (`address.city`); a edição completa continua na ficha do cliente.
- Importação e migração Lite→Full: **não** alteradas (A2 da especificação segue pendente de decisão humana); a validação vale para o POST/PATCH `/customers`.
- Campo desabilitado: recusa qualquer escrita (inclusive em branco/null). Clientes antigos com dado em campo agora desabilitado continuam legíveis.

## 8. O que não foi verificado / pendências

- Suíte completa do Full API (acima).
- Nenhuma tela foi aberta em navegador real; UI só em jsdom.
- Inventário de rotas × chave do catálogo (S0 do desenho) não feito: a restrição/REVOKE só vale onde o resolvedor é chamado (rotas financeiras da ponte). Vendas, clientes (`customers:read` só em `/customers/lookup`), funcionários e trips seguem só com piso de papel/restrição por papel já existente.
- Importações (`/imports`) e portal/parceiros não passam pela validação de campos configurados.
- A migration Lite→Full não ganhou conversor de overrides (`liteKey` do catálogo é só a ponte); relatório de "override não mapeado" fica para o executor de migração.
- Migrations 103/104/013 foram aplicadas somente em bancos descartáveis; nada em ambiente online.
- `services/api/tests/invitations-permission-restrictions.test.ts` aparece modificado no checkout por outra frente (não editei).
