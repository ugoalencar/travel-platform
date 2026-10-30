# Próximo prompt para Claude — Travel Lite: Esqueci minha senha

Você está em `D:\travel-platform`.

## Contexto

Já foi implementado no Travel Lite:

- reset administrativo em `POST /users/:id/reset-password`;
- senha temporária forte;
- troca obrigatória no primeiro acesso via `POST /auth/change-required-password`;
- login bloqueia sessão normal quando `passwordChangeRequired=true`.

Falta implementar o fluxo público **"Esqueci minha senha"** para o próprio usuário recuperar acesso pelo e-mail cadastrado.

Leia antes de agir:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `QUALITY-GATES.md`
- `SCRIPTS.md`
- `.claude/2026-10-02_RESET-SENHA-TEMPORARIA-REVIEW-REPORT.md`

Não leia `.env` real. Não acesse produção/staging. Não rode comandos destrutivos. Não faça commit/push.

## Objetivo de produto

Implementar no Travel Lite:

1. Link/botão **Esqueci minha senha** na tela de login.
2. Tela/formulário para informar:
   - agência/slug;
   - e-mail cadastrado.
3. Resposta sempre genérica:
   - "Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado."
   - Não revelar se agência/e-mail existe.
4. Backend gera token temporário de uso único, com expiração curta (recomendado: 30 minutos).
5. Backend salva apenas hash do token.
6. Endpoint para definir nova senha com token:
   - valida token;
   - valida expiração;
   - valida uso único;
   - grava hash da nova senha;
   - marca token usado;
   - revoga sessões antigas do usuário;
   - registra auditoria.
7. Frontend tem tela **Definir nova senha** acessível por link com token.
8. Depois da senha alterada, usuário volta para login.

## Importante sobre envio de e-mail

Verifique se o Travel Lite já tem infraestrutura de e-mail/outbox reutilizável.

Se não houver envio real configurado no Lite:

- implemente o fluxo de token e a estrutura para envio;
- em ambiente local/dev, registre no log/outbox seguro sem expor em resposta HTTP;
- documente exatamente a pendência para produção: provedor SMTP/Resend/etc. e variáveis necessárias.

Não exponha token em resposta da API pública, exceto se existir um modo **explicitamente dev/test** e coberto por teste sem `NODE_ENV=production`.

## Sugestão de endpoints

Escolha nomes coerentes com o padrão local. Recomendo:

- `POST /auth/forgot-password`
  - body: `{ slug, email }`
  - resposta sempre genérica

- `POST /auth/reset-password`
  - body: `{ token, newPassword }`
  - resposta: sucesso genérico ou erro seguro se token inválido/expirado

Frontend:

- rota `/forgot-password`
- rota `/reset-password?token=...`

## Segurança obrigatória

1. Rate limit forte nos endpoints públicos.
2. Não permitir enumeração de e-mail/agência por mensagem, status code ou tempo óbvio.
3. Token deve ser aleatório forte e armazenado somente como hash.
4. Token deve expirar e ser uso único.
5. Ao resetar senha, revogar sessões antigas.
6. Auditoria:
   - `PASSWORD_RESET_REQUESTED`
   - `PASSWORD_RESET_COMPLETED`
   - sem token, senha, segredo ou dados sensíveis.
7. Todas as mensagens visíveis em português.
8. Testes devem cobrir sucesso, token expirado/usado/inválido e anti-enumeração.

## Arquivos prováveis

Backend:

- `services/api-lite/src/routes/auth.ts`
- `services/api-lite/src/password.ts`
- `services/api-lite/src/audit-log.ts`
- `services/api-lite/tests/auth.test.ts`
- migrations/schema Travel Lite, se for necessária tabela de tokens.

Frontend:

- `apps/travel-lite/src/pages/LoginPage.tsx`
- `apps/travel-lite/src/auth.tsx`
- `apps/travel-lite/src/App.tsx`
- `apps/travel-lite/src/App.test.tsx`

## Decisão de dados esperada

Se ainda não existir tabela, criar uma tabela específica para tokens de reset no schema Travel Lite, por exemplo:

- `password_reset_tokens`
  - `id`
  - `tenant_id`
  - `user_id`
  - `token_hash`
  - `expires_at`
  - `used_at`
  - `requested_ip`
  - `created_at`

Respeitar RLS/grants do Travel Lite. Não editar migrations aplicadas incorretamente; siga o padrão atual do projeto para migrations Travel Lite.

## Gates mínimos

Em `services/api-lite`:

```powershell
..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
..\..\node_modules\.bin\vitest.cmd run tests\auth.test.ts
..\..\node_modules\.bin\eslint.cmd src/**/*.ts tests/**/*.test.ts
```

Em `apps/travel-lite`:

```powershell
..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
..\..\node_modules\.bin\vitest.cmd run src\App.test.tsx
..\..\node_modules\.bin\eslint.cmd "src/**/*.ts" "src/**/*.tsx"
```

Se possível, rebuild/smoke do Docker local após concluir.

## Relatório obrigatório

Crie em `.claude/`:

`YYYY-MM-DD_ESQUECI-MINHA-SENHA-LITE-REPORT.md`

Inclua:

- arquivos alterados;
- endpoints finais;
- modelo de dados final;
- como o e-mail/link será enviado em local/dev e produção;
- testes/gates rodados;
- pendências reais.

