# Go-live Travel Lite no Render — relatório técnico

- **Data/hora:** 2026-10-02 13:00 (atualizado 13:05)
- **Prompt:** `.claude/NEXT-PROMPT-GOLIVE-TRAVEL-LITE-RENDER.md` (versão revisada, pedindo explicitamente para tratar `docs/travel-lite/RELEASES.md` como baseline fechada e detalhar a troca de credenciais de demonstração)
- **Onde:** checkout principal `D:\travel-platform`, branch `main` com alterações não commitadas (as já existentes no workspace, somadas às desta tarefa). **Nenhum commit, push, acesso a produção/staging ou alteração de DNS foi feito.**
- **Escopo:** tratei `docs/travel-lite/RELEASES.md` (`0.1.0 Inicial — 2026-10-02`) como o estado funcional fechado para este go-live — não reabri nem propus nenhuma mudança de funcionalidade do produto. Tudo que não é estritamente deploy/infraestrutura está registrado como risco residual (seção 10), não implementado.

## 1. Resumo executivo

O Travel Lite **já está pronto para rodar online no Render** sem mudança de código na aplicação: `HOST`, `PORT`, `DATABASE_URL` e `FRONTEND_DIST_DIR` já são lidos do ambiente (`services/api-lite/src/config.ts`), o `Dockerfile.travel-lite` já serve API e frontend numa imagem só, e o CORS/CSP de produção já exigem configuração explícita (fail-closed). **Os bloqueios reais não são de código, são de infraestrutura ainda não decidida**: banco PostgreSQL online dedicado, segredos de e-mail, e o processo de aplicar as migrations contra um banco remoto — este último não existia (o runner local recusa de propósito qualquer host remoto).

Fiz três entregas pequenas e versionáveis para fechar essas lacunas: (1) um runner de migration **separado**, só para hosts remotos, com dois travamentos explícitos; (2) um arquivo de exemplo com todas as variáveis de ambiente de produção; (3) atualização de dois documentos já existentes (`SCRIPTS.md`, `ONLINE-DEMO-GOLIVE.md`) registrando as decisões já tomadas (Render, `travellite.travelplataforma.com.br`). Não toquei em nenhum código de runtime da API nem do frontend.

**Achado que mais importa:** este mesmo projeto **já teve exatamente este incidente antes**, na Travel Platform (Full): o servidor escutava em `127.0.0.1` por padrão, o Render nunca detectava a porta aberta em `0.0.0.0`, e o primeiro deploy deu timeout (`docs/release/PILOT_REMOTE_PROVISIONING_REPORT.md`). O Travel Lite tem o mesmo padrão de código (`config.ts` também usa `127.0.0.1` como padrão), mas o `Dockerfile.travel-lite` **já** define `ENV HOST=0.0.0.0` — então, **contanto que ninguém sobrescreva isso no painel do Render com um valor vazio ou diferente**, o Lite não deve repetir o mesmo erro. Ainda assim, recomendo fortemente definir `HOST=0.0.0.0` explicitamente também nas variáveis do Render, por segurança.

## 2. Estado atual do deploy

| Item | Estado |
|---|---|
| Domínio | `travellite.travelplataforma.com.br` — DNS já criado no Registro.br e resolvendo para o Render (conforme o prompt; não verifiquei eu mesmo, não acessei DNS nem produção) |
| Serviço Render da Full (`api.travelplataforma.com.br`) | **Existe e está em uso** (confirmado em `docs/release/PILOT_REMOTE_PROVISIONING_REPORT.md`). O Travel Lite precisa de um **Web Service novo e separado** — nunca reaproveitar ou sobrescrever esse |
| Imagem/Dockerfile | `Dockerfile.travel-lite` pronto: build em duas etapas, `npm ci` → `turbo build` (api-lite + travel-lite) → `npm prune --omit=dev`; runtime `node:24-alpine`, usuário não-root (`USER node`), `EXPOSE 4010` |
| Variáveis já lidas do ambiente pelo código | `NODE_ENV`, `HOST`, `PORT`, `DATABASE_URL`, `MIGRATIONS_DATABASE_URL` (só migrations), `FRONTEND_DIST_DIR`, `TRAVEL_LITE_APP_URL`, `TRAVEL_LITE_CORS_ORIGINS`, `TRAVEL_LITE_RESEND_API_KEY`, `TRAVEL_LITE_EMAIL_FROM`, `TRAVEL_LITE_EMAIL_REQUIRE_REAL` |
| Banco online dedicado | **Não provisionado ainda** (fora do meu escopo; decisão/execução de infraestrutura) |
| Migrations online | **Sem processo aprovado antes desta tarefa** — o único runner existente (`scripts/travel-lite-migrate.cjs`) recusa de propósito qualquer host remoto e `NODE_ENV=production` |
| Segredos de e-mail (`TRAVEL_LITE_RESEND_API_KEY`/`TRAVEL_LITE_EMAIL_FROM`) | Não configurados em lugar nenhum ainda |
| Validação local mais recente | Segundo `docs/travel-lite/RELEASES.md` (de outra frente de trabalho já presente no workspace): Docker local reconstruído e smoke aprovado em `http://127.0.0.1:4010`, typecheck e testes focados aprovados |
| Roteamento por caminho (`/gadotti`, `/demo`) | **Já implementado** no frontend (`apps/travel-lite/src/branding.ts`'s `slugFromCurrentPathname`, rota `/:agencySlug` em `App.tsx`) — a agência vem travada no formulário de login quando o caminho bate. Confirmei que os 29 testes do frontend continuam passando |

## 3. Bloqueios encontrados

1. **Sem banco PostgreSQL online dedicado.** Decisão e provisionamento de infraestrutura — fora do que posso fazer sem acessar produção/criar recursos reais.
2. **Sem processo para rodar as migrations contra esse banco**, porque o único runner existente é hostil a qualquer host remoto de propósito (`scripts/travel-lite-migrate.cjs:assertLocalTargets`). **Resolvido nesta rodada** com um script novo e separado (seção 4 e 7).
3. **Variáveis de produção nunca foram documentadas num só lugar** para o Travel Lite (o `.env.travel-lite.example` existente é só para o stack local). **Resolvido nesta rodada** com `.env.travel-lite.production.example`.
4. **Segredos de e-mail (Resend) não configurados.** Sem eles, `POST /auth/forgot-password` falha de forma **intencional e silenciosa para o usuário** (resposta pública continua genérica; o erro só aparece no log do serviço — comportamento já implementado em `services/api-lite/src/email.ts`, de uma tarefa anterior). Isso é esperado, não é um bug; só precisa ser configurado antes do go-live para o recurso funcionar de verdade.
5. **Risco de repetir o incidente de `HOST`** já registrado no histórico do projeto (seção 1). Não é um bloqueio hoje (o Dockerfile já cobre), mas é um ponto de atenção explícito para quem configurar o serviço no Render.
6. **Nenhuma validação real contra Render foi possível nesta rodada** (não tenho acesso, e as regras da tarefa proíbem acessar produção/staging) — tudo abaixo é baseado em leitura de código e no histórico já documentado deste mesmo projeto para o serviço irmão (`api.travelplataforma.com.br`).

## 4. Alterações feitas

| Arquivo | Tipo | Resumo |
|---|---|---|
| `scripts/travel-lite-migrate-online.cjs` | **Novo** | Runner de migration só para hosts remotos, com dois travamentos independentes (ver seção 7) |
| `.env.travel-lite.production.example` | **Novo** | Todas as variáveis de produção, com comentários explicando cada uma e o risco do `HOST` |
| `.gitignore` | Editado | Adicionada a negação `!.env.travel-lite.production.example` (sem isso, o padrão `.env.*` já existente escondia o arquivo de exemplo do controle de versão) |
| `SCRIPTS.md` | Editado | Nova seção "Online migrations (Render or any other remote host)", documentando o script novo |
| `docs/travel-lite/ONLINE-DEMO-GOLIVE.md` | Editado | Registradas as decisões já tomadas: provedor (Render) e domínio (`travellite.travelplataforma.com.br`, DNS já criado); as demais pendências (banco, segredos, política de dados) continuam como estavam |

**Nenhum código de runtime da API ou do frontend foi alterado.** Nenhuma migration nova foi criada. Nenhum arquivo de outra frente de trabalho já presente no workspace foi tocado.

## 5. Variáveis de ambiente finais recomendadas para o Render

Lista completa e comentada em `.env.travel-lite.production.example`. Resumo:

| Variável | Valor recomendado | Obrigatória |
|---|---|---|
| `NODE_ENV` | `production` | Sim |
| `HOST` | `0.0.0.0` | Sim — defina explicitamente mesmo o Dockerfile já definindo (ver seção 1) |
| `PORT` | deixar o Render injetar a dele; só fixar se o provedor exigir um valor específico | Normalmente não |
| `DATABASE_URL` | URL de runtime do banco online dedicado do Lite (role restrita, nunca a role de administração) | Sim |
| `MIGRATIONS_DATABASE_URL` | URL de administração do mesmo banco — **só usada manualmente** ao rodar o novo script de migration, nunca pela API em produção | Só para migrar |
| `FRONTEND_DIST_DIR` | `/app/apps/travel-lite/dist` (já é o padrão do Dockerfile) | Sim |
| `TRAVEL_LITE_APP_URL` | `https://travellite.travelplataforma.com.br` | Sim |
| `TRAVEL_LITE_CORS_ORIGINS` | `https://travellite.travelplataforma.com.br` | Sim — sem isso, o serviço recusa subir em produção (fail-closed, `security.ts`) |
| `TRAVEL_LITE_RESEND_API_KEY` | chave real do Resend (ou outro provedor, exigiria código novo) | Para o "esqueci minha senha" funcionar de verdade |
| `TRAVEL_LITE_EMAIL_FROM` | remetente verificado no provedor | Idem |
| `TRAVEL_LITE_EMAIL_REQUIRE_REAL` | não definir (já é implícito por `NODE_ENV=production`) | Não |

## 6. Passo a passo para criar/configurar o Web Service no Render

**Não executei nada disto** — é o roteiro para quem tiver acesso ao painel do Render.

1. **New → Web Service**, repositório `travel-platform`, branch a publicar (ex.: `main` já com o PX7/PX5/etc. integrados).
2. **Runtime:** Docker. **Dockerfile path:** `Dockerfile.travel-lite` (não é o `Dockerfile` da raiz, que é da Full). **Docker build context:** raiz do repositório (o Dockerfile faz `COPY . .` e depende do monorepo inteiro para o `turbo build`).
3. **Nome do serviço:** algo que deixe claro que é o Lite e não confunda com o serviço existente da Full (ex.: `travel-lite-api`), para reduzir o risco de alguém mexer no serviço errado depois.
4. **Porta:** o Render detecta a porta pela variável `PORT` que ele mesmo injeta, ou pode-se fixar manualmente combinando com o valor exposto (`4010`, já no `EXPOSE` do Dockerfile). Confirmar qual o comportamento padrão da conta/plano usado.
5. **Variáveis de ambiente:** todas da seção 5, coladas no painel "Environment" do serviço — nunca neste repositório.
6. **Banco de dados:** criar (ou apontar para) um Postgres dedicado ao Lite, nunca o mesmo da Full. Se for um Render Postgres, usar a connection string interna (mais rápida, sem round-trip pela internet) para `DATABASE_URL`/`MIGRATIONS_DATABASE_URL`.
7. **Domínio customizado:** adicionar `travellite.travelplataforma.com.br` nas configurações do serviço e seguir a validação de TLS do próprio Render (automática, via Let's Encrypt).
8. **Antes do primeiro deploy real:** rodar as migrations (seção 7) contra o banco já criado, **antes** de a aplicação receber tráfego.
9. **Deploy.** Acompanhar o log de build e de boot; confirmar que a mensagem de "listening on http://0.0.0.0:<porta>" aparece (se aparecer `127.0.0.1`, é o mesmo incidente da seção 1 — revisar a variável `HOST`).
10. **Smoke pós-deploy:** seção 8 (checklist) antes de liberar para a Gadotti.

## 7. Plano seguro de migrations online

Criei `scripts/travel-lite-migrate-online.cjs`, uma **segunda opção das três sugeridas pelo prompt**: nem alterar o runner local (que continua intocado, só para ambiente local), nem só documentar um processo manual — um script novo, exclusivo para hosts remotos, com trava explícita e **fail-closed em todos os caminhos de erro**.

### Por que um script separado, em vez de uma flag no existente
Um único script com uma flag "libera produção" é um ponto único de falha: uma variável de ambiente errada/copiada por engano destrava os dois modos ao mesmo tempo. Com dois scripts, **o local nunca aceita remoto e o novo nunca aceita local** — são mutuamente exclusivos por desenho.

### As duas travas, as duas obrigatórias
1. **`MIGRATIONS_DATABASE_URL` obrigatória, sem valor padrão** (diferente do script local, que tem um padrão local de conveniência) e com host validado como **não-local** (recusa `localhost`, `127.0.0.1`, nomes de serviço docker-compose sem ponto, etc. — usar o script local para esses).
2. **`TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST`**, que precisa bater **exatamente** com o host presente em `MIGRATIONS_DATABASE_URL`. Isso não impede quem realmente quer migrar aquele host — impede o acidente mais comum: uma connection string velha ou de outro projeto colada por engano, porque a pessoa precisa **ler o host da URL e digitá-lo de novo**, conscientemente, como segunda variável.

Também suporta `TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN=true`, que lista as migrations pendentes sem aplicar nada — útil para conferir antes de rodar de verdade.

### Validação feita (sem tocar em nenhum host remoto real)
- `node -c scripts/travel-lite-migrate-online.cjs` — sintaxe OK.
- Testei os quatro caminhos de recusa (URL ausente, host local, confirmação ausente, confirmação divergente) — todos saem com código 1 e a mensagem certa, **nenhum deles chega a abrir conexão de rede** (a recusa acontece antes de qualquer `new Pool(...)`).
- **Não testei o caminho de sucesso contra um host remoto de verdade** — seria acessar um banco online, fora do que esta tarefa autoriza. Antes do primeiro uso real, rode primeiro com `TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN=true` contra o banco já criado, confira a lista de migrations pendentes (devem ser as 7 de `infrastructure/migrations-travel-lite/`, 001 a 007) e só depois rode sem o dry-run.

### Uso
```powershell
$env:MIGRATIONS_DATABASE_URL = "postgresql://travel_lite_admin:<senha>@<host-render>/travel_lite"
$env:TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST = "<host-render>"
node scripts/travel-lite-migrate-online.cjs
```

## 8. Checklist antes de liberar para a Gadotti

- [ ] Banco PostgreSQL online dedicado criado (nunca o da Travel Platform/Full).
- [ ] Backup do banco confirmado antes do primeiro deploy (`docs/travel-lite/ONLINE-DEPLOY-RUNBOOK.md`, já existente).
- [ ] Variáveis de ambiente da seção 5 configuradas no Render (nenhuma com valor real neste repositório).
- [ ] `HOST=0.0.0.0` confirmado nas variáveis do Render, além do padrão do Dockerfile.
- [ ] Migrations aplicadas com `scripts/travel-lite-migrate-online.cjs` (dry-run primeiro, depois real) — as 7 migrations de `infrastructure/migrations-travel-lite/` (até a `007_password_reset_tokens.sql`).
- [ ] `TRAVEL_LITE_RESEND_API_KEY`/`TRAVEL_LITE_EMAIL_FROM` configurados e testados (enviar um "esqueci minha senha" de teste e confirmar o recebimento).
- [ ] Domínio `travellite.travelplataforma.com.br` com TLS validado no Render.
- [ ] `GET /health` e `GET /version` (ou `/api/version`) respondendo no domínio final, com `version` igual a `0.1.0` (conforme `docs/travel-lite/ONLINE-ARCHITECTURE.md`).
- [ ] Login funcionando em `/gadotti` e em `/demo`, cada um com a agência corretamente travada no formulário.
- [ ] Isolamento entre `gadotti` e `demo` conferido (um tenant não vê dados do outro) — uma amostra rápida, não uma auditoria completa, já que o isolamento por RLS já foi verificado em rodadas anteriores desta mesma sessão de trabalho.
- [ ] Identidade visual (branding) de cada tenant carregando certo no respectivo caminho.
- [ ] Credenciais de demonstração da Gadotti e da `demo` são **próprias do ambiente online**, diferentes das que aparecem em `docs/travel-lite/RELEASES.md` (essas são só do pacote local) — emitidas via `POST /users/:id/reset-password` (gera senha temporária forte, exibida uma única vez) seguido de troca obrigatória no primeiro acesso via `POST /auth/change-required-password` (mecanismo já implementado e testado no produto, não um processo novo) — ver risco residual 1.
- [ ] Serviço Render da Full (`api.travelplataforma.com.br`) confirmado intocado depois de todo o processo.

## 9. Comandos de validação executados e resultado

| Comando | Resultado |
|---|---|
| `node -c scripts/travel-lite-migrate-online.cjs` | Sintaxe OK |
| 4 execuções manuais do script novo com variáveis inválidas/ausentes/divergentes | As 4 recusam com código 1, mensagem clara, sem nenhuma chamada de rede |
| `node scripts/check-secrets.cjs` | Nenhum segredo novo encontrado nos arquivos desta tarefa (os avisos existentes são de fixtures de teste de tarefas anteriores, já reportados antes) |
| `git diff --check` nos 5 arquivos desta tarefa | Limpo (corrigi uma linha em branco sobrando no fim de `ONLINE-DEMO-GOLIVE.md`) |
| `apps/travel-lite`: `vitest run src/App.test.tsx` | **29/29** — confirma que o roteamento por caminho (`/gadotti`, `/demo`), feito por outra frente de trabalho já no workspace, continua funcionando |

Não rodei o gate completo (`lint`/`typecheck`/`test`/`build`) dos dois pacotes porque esta tarefa não alterou nenhum arquivo de código-fonte da API nem do frontend — só scripts de infraestrutura e documentação.

## 10. Riscos residuais

1. **Credenciais de demonstração locais documentadas em texto puro** em `docs/travel-lite/RELEASES.md` (de outra frente de trabalho, já presente no workspace antes desta tarefa) — são senhas do pacote de demonstração **local** (`demo.master@gadotti.local` / `DemoTravel2026!` e `patricia.voltolini@gadottijoinville.com.br` / `LiteDemo2026!`), não deste deploy. **Não copie essas senhas para o ambiente online.** Procedimento recomendado para emitir as credenciais online de `gadotti` e `demo`: um administrador já com acesso cria/confirma o usuário e usa o fluxo existente `POST /users/:id/reset-password` (gera uma senha temporária aleatória, exibida uma única vez na UI, nunca registrada em log) para definir a senha inicial de cada conta; no primeiro login, o fluxo `passwordChangeRequired` já implementado força a troca via `POST /auth/change-required-password` antes de liberar acesso ao sistema — então a senha temporária nunca chega a ser a senha de uso corrente. Isso é reaproveitamento de um mecanismo já construído e testado (não requer código novo) e evita tanto reusar as senhas do RELEASES.md quanto inventar um processo paralelo de distribuição de senha.
2. **O caminho de sucesso do novo script de migration nunca foi exercitado contra um banco de verdade** (só os 4 caminhos de recusa). Reduzi esse risco com o modo `--dry-run`-equivalente (`TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN=true`): rode-o primeiro.
3. **Nada aqui substitui o Go/No-Go Gate já definido** em `docs/travel-lite/ONLINE-DEPLOY-RUNBOOK.md` (aprovação humana explícita para provedor, banco, segredos, domínio e política de dados piloto) — este relatório só prepara o terreno técnico, não autoriza o deploy.
4. **Risco de HOST** (seção 1): preventivamente documentado e com instrução explícita de configurar `HOST=0.0.0.0` no painel, mas só será confirmado de verdade no primeiro deploy real, que está fora do meu acesso.
5. **E-mail de recuperação de senha depende de um provedor ainda não contratado/configurado para o Lite** (Resend ou outro) — sem isso, "esqueci minha senha" não entrega e-mail nenhum em produção (comportamento intencional, não um bug, mas precisa ser resolvido antes do go-live para o recurso ser útil).
6. **Nenhuma carga ou teste de performance foi feita** — fora do escopo desta tarefa e desta sessão.
