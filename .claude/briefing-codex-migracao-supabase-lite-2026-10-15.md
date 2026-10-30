# Briefing para o Codex — Migrar o banco do Travel Lite (Render -> Supabase)

Cole este documento inteiro no Codex. Ele é autossuficiente. Leia também `AGENTS.md` e `docs/AI_CONTEXT.md` do repositório.

## Objetivo
Migrar o PostgreSQL do Travel Lite (Render, plano Free, **expira em 2026-11-01**) para um projeto Supabase novo e exclusivo do Lite, trocar o `DATABASE_URL` do serviço Render `travel-lite` e deixar tudo validado e rodando. O banco do Render só é desligado por decisão do usuário, depois.

## Estado atual (verificado em 2026-10-13)
- Serviço Render `travel-lite`: id `srv-davu7grtqb8s73dqqpt0` (Docker, Free, Oregon). Está na branch `feat/gadotti-online-provision` (commit `5906c69`), autoDeploy desligado. **Nunca altere o serviço `travel-platform` (`srv-dao8bpjtqb8s73eafr9g`) nem a branch `main`.**
- Banco de origem: Render Postgres `travel-lite-db` (`dpg-davu8mrncjis73fpdjng-a`), banco `travel_lite`, papel `travel_lite_runtime` (sem BYPASSRLS). Migrations aplicadas: 001 a 007 (`infrastructure/migrations-travel-lite/`).
- Dados reais: tenant `gadotti` (B&B GADOTTI VIAGENS LTDA): 5 usuários, 7 vendedores, 1 cliente, 57 vendas, auditoria. Existe também o tenant `demo`.
- Provisionamento da Gadotti **já aplicado** em 2026-10-13: senhas temporárias ativas, troca obrigatória no primeiro login, 8 overrides de permissão, marcador `GADOTTI_PROVISION_COMPLETED`. Não reaplicar nem trocar senhas.
- Domínio: `https://travellite.travelplataforma.com.br/gadotti` (API sob `/api`).

## Regras
- Projeto Supabase **novo, só do Lite**, na conta indicada pelo usuário. Não use o projeto existente `travel-platform` nem outros. Confirme custo/plano com o usuário antes de criar algo pago.
- Não imprima nem grave em log/relatório/Git: senhas, hashes, connection strings, chaves, e-mails de clientes. Segredos só em variáveis do Render e no Bitwarden.
- RLS é FORCE em quase todas as tabelas; o tenant vem de `set_tenant_context` por transação. O papel de runtime **não pode** ter BYPASSRLS/superuser. Use conexão direta ou pooler em **modo transação** (o `set_config(..., true)` vale dentro da transação).
- Migrations aplicadas são imutáveis. Se algo precisar mudar, crie migration nova numerada (008+). Não rode `prisma`.
- Não instale dependências sem autorização. Não faça push na `main`; use branch própria e PR.
- Nenhuma operação destrutiva no banco do Render (somente leitura/dump).

## Passos
1. **Pré-checagem:** confirmar o projeto Supabase de destino (região, versão do Postgres >= 17, plano) e a identidade do banco de origem. Registrar contagens por tabela e tenant (usuários, vendedores, clientes, vendas, recebíveis, auditoria, `user_permissions`).
2. **Backup:** `pg_dump` completo do Render (formato custom, com `--no-owner --no-privileges`), guardado fora do Git, com checksum. Verificar que o dump restaura em um Postgres descartável antes de tocar o destino.
3. **Destino:** criar o papel de runtime sem BYPASSRLS (`travel_lite_runtime`), aplicar as migrations 001–007 na ordem (ajustando só o necessário para o Supabase, via migration nova se preciso), criar a tabela `migrations` com o mesmo conteúdo da origem (o provisionador valida `migrations` 001–007 e `current_database() = travel_lite` — ver `scripts/travel-lite-gadotti-online.lib.cjs`; se o nome do banco no Supabase for `postgres`, o provisionador **não deve ser reexecutado**; ele é run-once e já foi aplicado).
4. **Restauração:** restaurar dados (inclusive `audit_logs`, `user_permissions`, `auth_sessions`, `tenant_branding`, sequências por tenant). Conferir que as contagens batem exatamente com o passo 1.
5. **Verificação de isolamento:** com o papel de runtime, confirmar que sem contexto de tenant as tabelas com RLS retornam 0 linhas, que o contexto `gadotti` não enxerga `demo` e vice-versa, e que `rolbypassrls`/`rolsuper` são falsos.
6. **Rehearsal local:** rodar a suíte `services/api-lite` contra o Supabase **não**; rodar `npm run test -w @travel-platform/api-lite` no Postgres descartável como regressão (2 falhas preexistentes e alheias: `catalog` e `customers`, regex em inglês vs. mensagem em pt-BR).
7. **Troca:** definir `DATABASE_URL` do serviço `travel-lite` (Render, API/painel) com a URL do Supabase, `sslmode` conforme exigido, pool pequeno. Deploy manual. Acompanhar logs e `/health`.
8. **Validação online:** login das 5 contas com as senhas temporárias deve responder 200 com `passwordChangeRequired=true` e **sem emitir sessão** (não trocar senhas). Conferir contagens no destino pós-deploy. Verificar dashboard vazio e `/users` 403 para vendedora (testes já cobrem localmente).
9. **Rollback:** se qualquer verificação falhar, restaurar o `DATABASE_URL` antigo no Render e redeploy; o banco do Render continua intacto até decisão do usuário.
10. **Fechamento:** documentar em `docs/travel-lite/` (runbook de migração, sem segredos), registrar relatório pt-BR em `.claude/` com data/hora, e listar pendências (desligar o Render DB só com autorização, rotacionar chaves usadas, merge/PR da branch `feat/gadotti-online-provision`).

## Critério de pronto
Contagens idênticas origem x destino, isolamento de tenant comprovado, `/health` 200, cinco logins online respondendo troca obrigatória, serviço `travel-lite` usando o Supabase, rollback documentado, nenhum segredo em logs/Git.

## Pendências já conhecidas (fora do escopo)
- A `main` ainda não tem a auditoria de vendas nem `scripts/travel-lite-entrypoint.cjs`; o serviço segue na branch da feature até o merge. PR não aberto (link: https://github.com/ugoalencar/travel-platform/pull/new/feat/gadotti-online-provision).
- Venda própria expõe custo/margem/comissão ao vendedor dono (decisão de produto).
- Bitwarden: conferir as 3 entradas rotacionadas (Patricia, Nykaya, Letícia).
