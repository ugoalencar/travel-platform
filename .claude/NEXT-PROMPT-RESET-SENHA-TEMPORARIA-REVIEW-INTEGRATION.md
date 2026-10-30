# Próximo prompt para Claude — Reset de senha temporária e troca obrigatória

Você está em `D:\travel-platform`.

## Contexto

O Codex deveria ter usado o fluxo Claude, mas acabou acionando subagentes internos. Eles já deixaram uma implementação inicial no workspace. Sua tarefa agora é **revisar, corrigir e consolidar** essa implementação antes de tratarmos como pronta.

Leia antes de agir:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `QUALITY-GATES.md`
- `SCRIPTS.md`

Não leia `.env` real. Não rode comandos destrutivos. Não faça commit/push.

## Objetivo de produto

Implementar no Travel Lite:

1. Cada usuário tem e-mail cadastrado para recuperação.
2. O admin da empresa pode redefinir a senha de outro usuário.
3. O backend gera uma senha temporária aleatória forte.
4. O backend salva apenas hash, nunca senha em texto puro.
5. A senha temporária é exibida uma única vez para o admin.
6. Ao entrar com a senha temporária, o usuário é obrigado a criar uma nova senha antes de acessar o sistema.
7. Sessões antigas do usuário resetado são revogadas.
8. Auditoria registra quem resetou e qual usuário foi resetado, sem expor senha/token.

## Alterações já existentes para revisar

Backend:

- `services/api-lite/src/audit-log.ts`
- `services/api-lite/src/password.ts`
- `services/api-lite/src/routes/auth.ts`
- `services/api-lite/src/routes/users.ts`
- `services/api-lite/tests/auth.test.ts`

Frontend:

- `apps/travel-lite/src/auth.tsx`
- `apps/travel-lite/src/pages/LoginPage.tsx`
- `apps/travel-lite/src/pages/SettingsPage.tsx`
- `apps/travel-lite/src/App.test.tsx`

## Atenção: divergência de contrato encontrada

O frontend está chamando:

- `POST /auth/change-password`

Mas o backend implementou:

- `POST /auth/change-required-password`

Corrija essa divergência escolhendo um único contrato. Recomendo usar o nome mais explícito `POST /auth/change-required-password`, a menos que encontre padrão local melhor.

## Pontos de revisão obrigatórios

1. Verifique se a implementação realmente impede navegação normal antes da troca obrigatória.
2. Verifique se não há senha temporária em log, auditoria, sessionStorage/localStorage ou resposta persistente.
3. Verifique se o reset administrativo não permite resetar a si mesmo sem cuidado ou resetar usuário acima do próprio papel.
4. Verifique se e-mail de usuário permanece obrigatório e único por tenant.
5. Revise a decisão atual de modelo: o backend está usando auditoria append-only para inferir `passwordChangeRequired`, comparando `USER_PASSWORD_RESET` e `USER_REQUIRED_PASSWORD_CHANGED`.
   - Se considerar frágil, proponha e implemente coluna explícita em schema/migrations Travel Lite.
   - Se aceitar, garanta testes suficientes.
6. Garanta que todas as mensagens visíveis estejam em português.
7. Garanta que os endpoints estejam protegidos por rate limit quando aplicável.
8. Atualize testes quebrados por mudanças de contrato.

## Gates mínimos esperados

Rode pelo menos:

```powershell
..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
..\..\node_modules\.bin\vitest.cmd run tests\auth.test.ts
..\..\node_modules\.bin\eslint.cmd src/**/*.ts tests/**/*.test.ts
```

em `services/api-lite`.

E em `apps/travel-lite`:

```powershell
..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
..\..\node_modules\.bin\vitest.cmd run src\App.test.tsx
..\..\node_modules\.bin\eslint.cmd "src/**/*.ts" "src/**/*.tsx"
```

Se Docker estiver disponível, rode também o smoke local do Travel Lite após build/restart.

## Entrega esperada

Crie um relatório em `.claude/` com nome:

`YYYY-MM-DD_RESET-SENHA-TEMPORARIA-REVIEW-REPORT.md`

O relatório deve conter:

- arquivos alterados
- bugs encontrados
- decisão final de contrato dos endpoints
- decisão final de modelo de dados
- testes/gates rodados e resultados
- pendências reais, se houver

