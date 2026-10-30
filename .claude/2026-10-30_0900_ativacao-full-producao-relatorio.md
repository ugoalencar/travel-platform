# Ativação operacional do Travel Platform Full — Relatório parcial

Data/hora: 2026-10-30 (manhã, GMT-3)
Status: **PARCIAL — bloqueado por e-mail (Resend) e por ausência de credencial de banco nesta sessão**

## Revalidação (feita)

| Item | Resultado |
| --- | --- |
| https://app.travelplataforma.com.br | HTTP 200; `/api/health` = ok |
| https://admin.travelplataforma.com.br | HTTP 200; `/api/health` = ok |
| https://cliente.travelplataforma.com.br | HTTP 200; `/api/health` = ok |
| https://travelplataforma.com.br | HTTP 200 |
| API (alias travel-platform-api-ugoalencars-projects.vercel.app) | `/readiness` = ready |
| Deployment Production da API | `dpl_9miHuWaHEnXo1MAApqXtUFHsUiJ8` READY (commit 67ff9f9) |
| Migrations no source | 118 arquivos (001..118), coerente com "banco na versão 118" informado |

## Ajuste feito: proteção SSO da API

- Antes: SSO desabilitado em **todos** os ambientes (inclusive previews, que compartilham `DATABASE_URL`/`PLATFORM_DATABASE_URL` com Production).
- Agora: `ssoProtection.deploymentType = "preview"` — previews voltam a exigir login Vercel; Production continua acessível aos proxies.
- Revalidado após a mudança: os três proxies e `/readiness` seguem OK.
- Autenticação, RBAC e RLS da aplicação não foram alterados.

## Bloqueios (exatos)

1. **E-mail**: `RESEND_API_KEY` e `EMAIL_FROM` continuam ausentes na Vercel Production (projeto `travel-platform-api`). Com `NODE_ENV=production` o provedor fica fail-closed (`UnconfiguredEmailProvider`), então convites e resets não saem. **Ação do proprietário:** cadastrar essas duas variáveis diretamente na Vercel (Production) e redeployar a API. Opcional: `EMAIL_REPLY_TO`.
2. **Acesso ao banco**: nesta sessão não há connection string disponível (variáveis da Vercel são `sensitive` e ilegíveis; não li arquivos `.env` reais, conforme AGENTS.md). Não foi possível confirmar por consulta a versão 118 aplicada nem a ausência de tenants/usuários. O MCP Supabase conectado só enxerga outro projeto ("Tumpero"), não o Full.

## Análise de identidade (alencarugo@gmail.com)

- Super Admin vive em `platform_users` (migration 025, e-mail `UNIQUE`, sem `agency_id`); usuários de agência vivem em `users`, únicos por `(agency, e-mail)`.
- Tabelas separadas ⇒ o mesmo e-mail como OWNER do Demo **não mescla identidades nem cruza privilégios** por schema. Conta Super Admin/MFA não foi tocada. Falta apenas confirmar em runtime após o e-mail estar ativo.

## Não executado (dependente dos bloqueios)

- Tenant Gadotti (ADMIN Patricia + 4 AGENT) e tenant Demo vazio (OWNER alencarugo@gmail.com).
- Convites e reset do Super Admin.
- Smoke autenticado e teste de isolamento entre tenants.
- Nada de Lite foi alterado; sem seeds, sem migrations, sem DNS, sem commit/push.

## Próximos passos assim que o e-mail estiver ativo

1. Fornecer connection string de plataforma (`travel_app_platform`) por meio seguro (variável local de sessão, sem colar no chat) ou executar via fluxo admin da API.
2. Criar tenant Gadotti (dados do CNPJ em `docs/GadottiPati/`) + 5 convites; criar Demo + convite OWNER; reset Super Admin.
3. Smoke de login/aceite de convite/isolamento e relatório final.
