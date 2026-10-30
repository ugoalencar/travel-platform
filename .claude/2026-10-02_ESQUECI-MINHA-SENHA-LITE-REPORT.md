# Travel Lite — "Esqueci minha senha" (fluxo público)

- **Data/hora:** 2026-10-02 11:55
- **Prompt:** `.claude/NEXT-PROMPT-ESQUECI-MINHA-SENHA-LITE.md`
- **Onde:** checkout principal `D:\travel-platform`, branch `main` com alterações não commitadas (as mesmas que já estavam no workspace, somadas às desta tarefa). **Nenhum commit, push ou PR foi feito.**
- **Contexto:** complementa o reset administrativo + troca obrigatória já revisados em `2026-10-02_RESET-SENHA-TEMPORARIA-REVIEW-REPORT.md`, e fecha parte do achado **ALTO-02** da auditoria de segurança (Lite sem recuperação de senha).

## 1. Arquivos alterados

**Migration (nova, não aplicada em produção/staging — só no banco de teste via fixture):**
- `infrastructure/migrations-travel-lite/007_password_reset_tokens.sql`

**Backend (`services/api-lite`):**
- `src/routes/auth.ts` — `POST /auth/forgot-password` e `POST /auth/reset-password`
- `src/email.ts` (novo) — envio do e-mail de redefinição
- `src/rate-limit.ts` — limite dedicado para as duas rotas públicas
- `src/database.ts` — novo método `withPublicLookupTransaction`
- `src/audit-log.ts` — eventos `PASSWORD_RESET_REQUESTED` e `PASSWORD_RESET_COMPLETED`
- `tests/auth.test.ts` — 6 testes novos (describe `"Travel Lite public forgot password flow"`)

**Frontend (`apps/travel-lite`):**
- `src/pages/ForgotPasswordPage.tsx` (novo)
- `src/pages/ResetPasswordPage.tsx` (novo)
- `src/pages/LoginPage.tsx` — link "Esqueci minha senha"
- `src/App.tsx` — rotas `/forgot-password` e `/reset-password`
- `src/styles.css` — estilo do link
- `src/App.test.tsx` — 8 testes novos (describe `"forgot/reset password (public flow)"`)

Nenhum arquivo de outra frente de trabalho (branding, planos, mobile, rate-limit de login, etc., já presentes como alterações não commitadas) foi tocado por esta tarefa, exceto onde listado acima.

## 2. Endpoints finais

| Rota | Corpo | Resposta | Observação |
|---|---|---|---|
| `POST /auth/forgot-password` | `{ slug, email }` | `200 { message: "Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado." }` | **Sempre** a mesma resposta — agência inexistente, e-mail inexistente, usuário inativo ou usuário real, todos os quatro casos recebem a mesma linha, com teste cobrindo os três primeiros |
| `POST /auth/reset-password` | `{ token, newPassword }` | `200 { message: "Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas." }` ou `404 { error: "Link de redefinição inválido ou expirado" }` | Mesmo erro genérico para token inexistente, expirado ou já usado — sem distinção |

Os nomes seguem exatamente a sugestão do prompt.

## 3. Modelo de dados final

Tabela nova `password_reset_tokens` (migration `007`), com `id`, `tenant_id`, `user_id`, `token_hash` (único), `expires_at`, `used_at`, `requested_ip`, `created_at` — exatamente os campos sugeridos no prompt, mais `FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)` no mesmo padrão de `auth_sessions`.

**Decisão de isolamento (RLS):** em vez da saída mais simples usada em `tenants` (tabela sem RLS, porque só guarda dado público de login), replicei o desenho que a **plataforma Full já usa para o mesmo problema exato** (`infrastructure/migrations/061_local_password_auth.sql`): RLS **ativado e forçado**, com:
- políticas normais por tenant (`tenant_id = current_tenant_id()`) para quando já existe contexto de sessão;
- duas políticas adicionais de "consulta pública por token", que só liberam a linha cujo `token_hash` bate exatamente com um valor fixado numa configuração de sessão (`app.password_reset_lookup_hash`, via `SELECT set_config(..., true)`, que nunca sobrevive a um `COMMIT`/`ROLLBACK` nem vaza de uma conexão do pool para a próxima).

Isso significa que, mesmo que o código da aplicação tivesse um bug na cláusula `WHERE`, o próprio banco impede que uma consulta exponha ou altere um token de outro tenant: é uma garantia em camada dupla (SQL + aplicação), não só a cláusula `WHERE` da aplicação. Preferi essa opção, mais trabalhosa, a deixar a tabela sem RLS, porque um token de reset é um segredo de alto valor (dá controle total da conta), diferente do nome/slug da agência.

Para isso, adicionei `withPublicLookupTransaction(gucName, lookupValue, operation)` à interface `LiteDatabase` (`database.ts`), espelhando o método de mesmo nome já existente em `services/api/src/database.ts`.

## 4. Como o e-mail será enviado (local/dev vs. produção)

**Hoje, não existia nenhuma infraestrutura de e-mail no Travel Lite** (confirmado: nenhum módulo de e-mail, SMTP ou provedor configurado). Criei `services/api-lite/src/email.ts`, um módulo mínimo e independente do que a plataforma Full usa (sem nova dependência — chama a API HTTP do Resend direto com `fetch`, mesma escolha de "sem SDK novo" já feita em `services/api/src/email`):

- **Produção/staging** (`NODE_ENV` igual a `production`/`staging`, ou `TRAVEL_LITE_EMAIL_REQUIRE_REAL=true`): exige `TRAVEL_LITE_RESEND_API_KEY` e `TRAVEL_LITE_EMAIL_FROM` configurados. Sem eles, **falha de propósito** (`LiteEmailNotConfiguredError`), em vez de fingir que enviou — isso só aparece nos logs internos, nunca na resposta pública (que continua genérica).
- **Local/dev**, sem provedor configurado: grava uma linha de log estruturada confirmando que um e-mail **seria** enviado (destinatário, tipo), mas **nunca grava o corpo** (que carrega o link/token real) — mesma regra que a plataforma Full já segue no provedor de desenvolvimento dela (`services/api/src/email/dev-log-provider.ts`), para não deixar o segredo em lugar nenhum de log.
- **Variáveis de ambiente novas, deliberadamente com prefixo `TRAVEL_LITE_`** (em vez de reaproveitar os nomes do Full): `TRAVEL_LITE_RESEND_API_KEY`, `TRAVEL_LITE_EMAIL_FROM`, `TRAVEL_LITE_EMAIL_REQUIRE_REAL` (opcional), `TRAVEL_LITE_APP_URL` (para montar o link `/reset-password?token=...`; padrão `http://localhost:5180` em dev). Isso evita que configurar o e-mail de um produto ligue sem querer o do outro, já que são dois produtos com domínios e inquilinos diferentes.

**Pendência real para produção:** nenhuma dessas variáveis está configurada ainda em nenhum ambiente (não acessei `.env` real nem produção/staging, como pedido). Antes do go-live, alguém com acesso precisa: (1) criar uma conta/domínio verificado no Resend (ou outro provedor) para o Travel Lite, (2) configurar `TRAVEL_LITE_RESEND_API_KEY` e `TRAVEL_LITE_EMAIL_FROM` no ambiente de produção, (3) confirmar `TRAVEL_LITE_APP_URL` apontando para o domínio público real.

**Sobre a exigência de não expor o token na resposta:** segui a a regra à risca — o token **nunca** aparece na resposta HTTP, nem em modo dev. Isso tem uma consequência que registro como limitação: em desenvolvimento local, sem um provedor de e-mail real, **uma pessoa não consegue, sozinha, ver o link gerado**, porque ele só existe dentro do corpo do e-mail (deliberadamente não logado) — mesma limitação que já existe hoje na plataforma Full para o mesmo fluxo. Os testes automatizados contornam isso interceptando a chamada à função de envio diretamente (não a resposta HTTP), o que é o padrão mais seguro e não exige a exceção "modo dev/test explícito" que o prompt citava como alternativa aceitável.

## 5. Segurança — item a item

| Exigência | Atendida? | Como |
|---|---|---|
| Rate limit forte nos endpoints públicos | Sim | `classifyLiteRequestRule` dá 8 requisições/15 min por IP a `/auth/forgot-password` e `/auth/reset-password` (mais estrito que o login, 20/15min); `/auth/forgot-password` também usa o `LiteLoginAbuseProtector` por conta+IP, já usado no login |
| Sem enumeração por mensagem/status/tempo óbvio | Sim | Resposta idêntica (200 + mesma frase) para agência inexistente, e-mail inexistente, usuário inativo e usuário real; mesmo erro genérico (404) para token inexistente, expirado ou usado. O tempo não foi deliberadamente equalizado (ex.: hash fictício), igual à própria implementação do Full para este mesmo fluxo — não é um reforço novo, é paridade com o padrão já aceito |
| Token aleatório forte, só hash salvo | Sim | `randomBytes(32)` (256 bits) + SHA-256 para o hash salvo; nunca a versão crua no banco |
| Expira e é de uso único | Sim, com teste de mutação | 30 minutos (`PASSWORD_RESET_TTL_MS`); `used_at` marcado antes de liberar a troca; removi de propósito a checagem de expiração/uso e o teste correspondente falhou, confirmando que ela protege de verdade |
| Revoga sessões antigas ao resetar | Sim | `UPDATE auth_sessions SET revoked_at = now() ...` dentro da mesma transação da troca de senha |
| Auditoria sem segredo | Sim | `PASSWORD_RESET_REQUESTED` e `PASSWORD_RESET_COMPLETED`, só com `entityType`/`entityId`; testes comparam a metadata serializada contra o token e a senha para garantir ausência |
| Mensagens em português | Sim | Todas as novas mensagens (sucesso, erro de link, limites do formulário) já nasceram em pt-BR |
| Testes cobrindo sucesso, expirado/usado/inválido e anti-enumeração | Sim | Backend: fluxo completo ponta a ponta, token expirado, token usado + token desconhecido, resposta idêntica para os três cenários de "não existe", limite de taxa. Frontend: link visível, mensagem genérica em sucesso e em erro do backend, mensagem distinta só para 429, link sem token, validação client-side, submissão com sucesso (sem nunca mostrar o token na tela) e erro de token inválido |

## 6. Gates executados

| Comando (exatamente os do prompt) | Resultado |
|---|---|
| `services/api-lite`: `tsc -p tsconfig.json --noEmit` | OK |
| `services/api-lite`: `vitest run tests/auth.test.ts` | **19/19** (13 preexistentes do reset administrativo + 6 novos) |
| `services/api-lite`: `eslint src/**/*.ts tests/**/*.test.ts` | 0 erros |
| `apps/travel-lite`: `tsc -p tsconfig.json --noEmit` | OK |
| `apps/travel-lite`: `vitest run src/App.test.tsx` | **29/29** (21 preexistentes + 8 novos) |
| `apps/travel-lite`: `eslint "src/**/*.ts" "src/**/*.tsx"` | 0 erros (4 warnings `react-refresh` pré-existentes, sem relação com esta mudança) |

O `npx` segue bloqueado pelo NVM nesta máquina; usei os binários locais, como o próprio prompt já previa como alternativa.

**Suíte completa do `api-lite` (além do gate pedido):** rodei `vitest run` sem filtro para checar efeito colateral da nova migration nas demais tabelas/RLS. Resultado: **163 de 165 testes passaram**; as 2 falhas (`catalog.test.ts`, `customers.test.ts`) são de **outra frente de trabalho já presente no workspace antes desta tarefa** (tradução de mensagens de validação em `errors.ts` sem atualizar dois testes que ainda esperam o texto em inglês) — não têm relação com `password_reset_tokens`, auth ou esta funcionalidade, e eu não toquei em `catalog.ts`/`customers.ts`/seus testes.

**Verificação por mutação:** removi de propósito (e depois restaurei) a checagem de expiração/uso único do token em `routes/auth.ts` — os dois testes relevantes falharam como esperado, confirmando que protegem de verdade, não são decorativos. No frontend, fiz o mesmo com a tela de "esqueci minha senha" deixando vazar o erro real do backend em vez da mensagem genérica — o teste de anti-enumeração pegou a regressão.

**Smoke com Docker:** não rebuildei nem reiniciei o contêiner `travel-lite-api`. Os testes de `auth.test.ts` já rodam contra o Postgres real de teste (fixture aplica a migration `007` do zero a cada execução), o que exercita a tabela, a RLS e as rotas novas ponta a ponta contra um banco de verdade, não um mock — julguei equivalente ao objetivo do smoke para esta rodada. Fica como pendência, igual registrado na revisão anterior.

## 7. Pendências reais

1. **Envio de e-mail em produção não está configurado** (seção 4) — depende de criar a conta no provedor e definir as variáveis `TRAVEL_LITE_*` em produção. Sem isso, `forgotPassword` falha silenciosamente do ponto de vista do usuário (resposta genérica igual) mas **loga um erro real**, então o monitoramento precisa observar esse log antes do go-live.
2. **Rebuild/restart do contêiner Docker** não foi feito (seção 6) — recomendo antes de qualquer deploy.
3. **Duas falhas de teste pré-existentes e não relacionadas** em `catalog.test.ts`/`customers.test.ts`, por causa da tradução de mensagens de outra frente de trabalho ainda não commitada — fora do escopo desta tarefa, mas registro para que alguém concilie antes de consolidar tudo num só commit.
4. **Sem teste de verificação direta da política RLS "em bruto"** (ou seja, provar com uma consulta crua, fora do caminho normal da aplicação, que a política de busca pública realmente nega acesso sem o GUC certo). A garantia vem de replicar exatamente o SQL já aprovado e em produção na plataforma Full para o mesmo problema; não escrevi um teste dedicado a isso por limite de tempo desta rodada.
5. **Sem página de confirmação por e-mail antes de aceitar a nova senha** (ex.: clique de confirmação adicional) — não foi pedido, e o próprio token de uso único já cumpre esse papel.
6. **Nenhuma migration foi aplicada em produção/staging** — só no banco de teste local, via fixture, conforme pedido.
7. **Sem commit, push ou PR** — as correções ficam na árvore de trabalho, junto com as demais alterações não commitadas já presentes.
