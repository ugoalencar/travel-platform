# Revisão e correção — Reset de senha temporária e troca obrigatória (Travel Lite)

- **Data/hora:** 2026-10-02 11:20
- **Prompt:** `.claude/NEXT-PROMPT-RESET-SENHA-TEMPORARIA-REVIEW-INTEGRATION.md`
- **Onde:** checkout principal `D:\travel-platform`, branch `main` com alterações não commitadas (as mesmas que já estavam no workspace quando a tarefa chegou). **Nenhum commit, push ou PR foi feito.**
- **Contexto:** este item resolve diretamente o achado **ALTO-02** ("Travel Lite sem recuperação de senha") da auditoria de segurança de 2026-10-02.

## 1. O que já existia (implementação a revisar)

Backend (`services/api-lite`): `POST /users/:id/reset-password` (admin gera senha temporária), `POST /auth/change-required-password` (troca obrigatória), detecção de `passwordChangeRequired` via auditoria append-only, `generateTemporaryPassword()` (scrypt, 24 caracteres aleatórios), rate limit novo (`LiteLoginAbuseProtector`), CSP e CORS com allowlist, sessão do frontend migrada de `localStorage` para `sessionStorage`. Frontend (`apps/travel-lite`): tela "Criar nova senha" no login, botão "Redefinir senha" em Configurações, painel de senha temporária de uso único.

## 2. Divergência de contrato encontrada e corrigida

Confirmado exatamente como o prompt descreveu: o frontend chamava `POST /auth/change-password`, mas o backend só implementava `POST /auth/change-required-password`. Além disso, havia uma **segunda divergência não citada no prompt**: mesmo corrigindo a URL, as formas de resposta não combinavam — o frontend esperava `{ sessionToken, user }` (login completo) e o backend devolvia apenas `{ ok: true }` (sem sessão), porque o desenho do backend é em duas etapas (trocar a senha, depois logar de novo), igual ao padrão já usado no Full para MFA.

**Decisão final de contrato:** mantive a recomendação do prompt — `POST /auth/change-required-password` é o nome oficial — e **não mudei o formato de resposta do backend** (ele já tinha testes de integração passando com Postgres real, provando que o desenho em duas etapas funciona). Corrigi o **frontend** para, depois de `{ ok: true }`, chamar `login()` de novo com a senha nova, reaproveitando o fluxo de login já testado em vez de duplicar a lógica de criação de sessão. Isso segue a política de redução de código do `AGENTS.md` (reusar abstração existente antes de criar outra) e evita manter duas rotinas de "criar sessão" divergentes.

## 3. Bugs encontrados e corrigidos

| # | Bug | Arquivo | Correção |
|---|---|---|---|
| 1 | Frontend chamava `/auth/change-password` (404 no backend real) | `apps/travel-lite/src/auth.tsx` | Chama `/auth/change-required-password`; campos `challengeToken`/`sessionToken` (nunca usados pelo backend) foram removidos do tipo e do payload |
| 2 | Depois da troca, o frontend tentava salvar `response.sessionToken`/`response.user`, que não existem na resposta real (`{ ok: true }`) — quebraria com `undefined` | `apps/travel-lite/src/auth.tsx` | `completeRequiredPasswordChange` agora chama `login(slug, email, newPassword)` após a confirmação, obtendo uma sessão real pelo caminho já testado |
| 3 | **`POST /users/:id/reset-password` permitia que um admin redefinisse a própria senha** sem nenhum aviso, revogando a própria sessão no meio do uso — inconsistente com o padrão já existente no mesmo arquivo (`id === context.userId` é bloqueado em troca de perfil/status e em troca de permissões, mas não estava aqui) | `services/api-lite/src/routes/users.ts` | Adicionado `if (id === context.userId) throw new ForbiddenError('You cannot reset your own password')`, igual ao padrão das outras rotas do arquivo |
| 4 | Duas mensagens de erro novas ficaram em inglês (`Password change is not required`, `You cannot reset your own password`), fora do padrão pt-BR do resto do arquivo | `services/api-lite/src/errors.ts` | Adicionadas ao mapa de tradução exato já existente |
| 5 | O teste do frontend (`App.test.tsx`) mockava a URL errada (`/auth/change-password`) e por isso "passava" sem nunca testar o contrato real | `apps/travel-lite/src/App.test.tsx` | Reescrito para simular o comportamento real do backend (duas chamadas a `/auth/login`, uma com a senha temporária e outra com a nova) e checar a URL/corpo corretos |

A mensagem `Field newPassword must be at least 8 characters` **não precisou de tradução nova**: já existe uma regra genérica em `translateFieldMessage` (`must be at least N characters` → `deve ter pelo menos N caracteres`) que a cobre.

## 4. Pontos de revisão obrigatórios — resultado

1. **Impede navegação antes da troca obrigatória?** Sim. `AuthProvider.login()` nunca chama `saveSession`/`setUser` quando a resposta tem `passwordChangeRequired`; `ProtectedRoute` (em `App.tsx`) redireciona para `/login` sempre que `user` é `null`. A tela "Criar nova senha" só aparece porque `LoginPage` lê `passwordChangeRequired` do contexto, não por navegação manual — não há como contornar visitando outra rota, pois nenhuma sessão foi criada.
2. **Senha temporária em log/auditoria/armazenamento persistente?** Não. A auditoria (`USER_PASSWORD_RESET`, `USER_REQUIRED_PASSWORD_CHANGED`) só grava `{ reset_by: ... }` ou `{ reason: ... }`, nunca a senha. No frontend, a senha temporária fica em estado React em memória (nunca em `localStorage`/`sessionStorage`); o painel em Configurações a mostra uma única vez, com um botão de copiar que usa a área de transferência do sistema operacional por ação explícita do usuário (não é persistência da aplicação). Confirmado também por teste de backend que compara o hash armazenado e os metadados de auditoria contra a senha em texto puro.
3. **Reset administrativo não permite resetar a si mesmo nem alguém acima do próprio papel?** O bug do autorreset foi corrigido nesta revisão (item 3 da tabela acima), com teste. A proteção contra resetar alguém de papel superior **já existia** em `lockTarget()` (`if (target.rank > actor.roleRank) throw new ForbiddenError(...)`), reaproveitada sem alteração.
4. **E-mail obrigatório e único por tenant?** Sim, sem mudança nesta rodada: a tabela `users` do Lite já tem e-mail obrigatório e único por tenant (confirmado em migrações anteriores já auditadas nesta mesma sessão de trabalho); esta tarefa não tocou nesse ponto.
5. **Modelo de dados — auditoria append-only vs. coluna explícita.** Aceitei o modelo atual (inferir `passwordChangeRequired` comparando os carimbos de tempo do último `USER_PASSWORD_RESET` e do último `USER_REQUIRED_PASSWORD_CHANGED`), e não criei uma coluna nova nem migration. Motivos: (a) o prompt pede migration só se a abordagem atual for considerada frágil; (b) a lógica é pequena, já coberta por 3 testes de integração com Postgres real (login após reset, bloqueio da sessão antiga, troca bem-sucedida e novo login), e passou nos quatro cenários depois da minha correção do contrato; (c) criar uma migration exigiria autorização explícita separada (fora do escopo desta revisão, que pede para não rodar migrations). **Risco residual documentado na seção 6.**
6. **Mensagens em português?** Revisado e corrigido (item 4 da tabela). Não restou nenhuma mensagem nova em inglês visível ao usuário.
7. **Rate limit nos endpoints?** `/auth/login` e `/auth/change-required-password` já passam pelo `LiteLoginAbuseProtector` (bloqueio por conta+IP+par, com reforço do limite global por rota em `rate-limit.ts`). `/users/:id/reset-password` está atrás de `protectedHooks` (exige sessão válida) e do limite genérico de 180 requisições/minuto por IP do `createLiteRequestRateLimitHook` — suficiente para uma ação administrativa autenticada, sem necessidade de um limite dedicado adicional.
8. **Testes quebrados por mudança de contrato atualizados?** Sim — `App.test.tsx` reescrito para refletir o contrato real (item 5 da tabela); nenhum outro teste dependia da URL antiga.

## 5. Testes e gates executados

| Comando | Resultado |
|---|---|
| `services/api-lite`: `tsc -p tsconfig.json --noEmit` | OK |
| `services/api-lite`: `vitest run tests/auth.test.ts` | **14/14** (13 preexistentes + 1 novo, com Postgres real via fixture) |
| `services/api-lite`: `eslint src/**/*.ts tests/**/*.test.ts` | 0 problemas |
| `apps/travel-lite`: `tsc -p tsconfig.json --noEmit` | OK |
| `apps/travel-lite`: `vitest run src/App.test.tsx` | **21/21** |
| `apps/travel-lite`: `eslint "src/**/*.ts" "src/**/*.tsx"` | 0 erros (4 warnings `react-refresh` pré-existentes, sem relação com esta mudança) |

**Observação sobre as ferramentas:** o `npx` estava bloqueado pelo NVM nesta máquina (mesmo bloqueio já registrado em trabalho anterior desta sessão), então usei os binários locais em `node_modules/.bin`/`node_modules/<pacote>`, exatamente como o prompt orienta como alternativa.

**Verificação por mutação:** removi de propósito o bloqueio de autorreset em `users.ts` e confirmei que o teste novo falha (`13 passed, 1 failed`); restaurado o código, os 14 testes voltam a passar. Isso confirma que o teste protege de verdade, e não é um teste decorativo.

**Smoke com Docker:** o Docker estava disponível e os contêineres `travel-lite-postgres-test`/`travel-lite-postgres`/`travel-lite-api` já estavam de pé; os testes de `auth.test.ts` rodam contra o Postgres real de teste (não um mock), o que já exercita o fluxo ponta a ponta no banco. **Não fiz** um build/restart completo do contêiner `travel-lite-api` com a imagem reconstruída — ficou como pendência (seção 6), por não ser estritamente necessário para validar a lógica (os testes de integração já usam o código-fonte atual contra o banco real).

## 6. Pendências reais

1. **Smoke de build/restart do contêiner** `travel-lite-api` não foi executado nesta rodada. Recomendo rodar antes de qualquer deploy, para confirmar que a imagem buildada também serve a nova rota e os novos headers de CSP/CORS corretamente.
2. **Modelo de dados por auditoria (ponto 5):** funciona e está testado, mas é mais frágil que uma coluna explícita (`password_change_required boolean` em `users`) para consultas em volume ou para auditorias externas que não entendam a convenção dos dois eventos. Se o produto quiser robustez adicional no futuro, a migration ficaria assim (não aplicada, só sugestão):
   ```sql
   ALTER TABLE users ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT false;
   ```
   com a rota de reset setando `true`, a de troca setando `false`, e removendo a função `passwordChangeRequired()` baseada em auditoria.
3. **Achados ALTO-01 e MÉDIO-02 da auditoria de segurança seguem pendentes** (verificação de MFA sem proteção dedicada no Full/Platform Admin; ausência de troca de senha autenticada para o próprio usuário no Full) — fora do escopo desta tarefa, que era específica do Travel Lite.
4. **Nenhuma migration foi criada ou executada** nesta revisão, conforme pedido.
5. **Sem commit, push ou PR** — as correções estão na árvore de trabalho, junto com o restante das mudanças não commitadas que já estavam no workspace.
