# Provedor de E-mail Transacional — Resend

Fecha o único bloqueador P1 documentado em `docs/release/RELEASE_CANDIDATE_VALIDATION.md`: ausência de um provedor de e-mail transacional real. Implementado como uma abstração desacoplada — o domínio nunca depende do SDK/API do Resend diretamente.

## Arquitetura

```
services/api/src/email/
  types.ts                — interface EmailProvider, erros tipados
  resend-provider.ts       — ResendEmailProvider (implementação real, via fetch nativo)
  dev-log-provider.ts      — DevLogEmailProvider (development-only, nunca em produção/staging)
  unconfigured-provider.ts — UnconfiguredEmailProvider (fail-closed)
  factory.ts               — createEmailProvider(env) / getEmailProvider(env) — decide qual usar
  templates.ts              — templates HTML+texto (convite, reset, ativação)
  index.ts                  — funções de alto nível que o domínio importa
```

O restante do sistema (`local-auth.ts`, `customer-local-auth.ts`, `invitations.ts`, `customer-portal-access.ts`) importa apenas de `services/api/src/email/index.ts` — nunca de `resend-provider.ts` diretamente. Trocar de provedor no futuro é, na prática, escrever um novo arquivo `<novo-provedor>-provider.ts` que implemente `EmailProvider` e apontar a `factory.ts` para ele — nenhum outro arquivo do domínio muda.

## Decisão de comportamento por ambiente (fail-closed)

`factory.ts` decide o provedor real usado, nesta ordem:

1. Se `RESEND_API_KEY` e `EMAIL_FROM` estão definidos → **sempre** usa `ResendEmailProvider`, em qualquer ambiente.
2. Senão, se `NODE_ENV` é `production` ou `staging` (ou `EMAIL_REQUIRE_REAL=true`) → usa `UnconfiguredEmailProvider`, que **lança** `EmailProviderNotConfiguredError` em toda chamada de `send()`. Nenhum endpoint que dependa disso finge sucesso.
3. Senão (desenvolvimento local, sem chave configurada) → usa `DevLogEmailProvider`, que apenas loga que um e-mail *seria* enviado (nunca o corpo/link/token), para permitir testar os fluxos localmente sem uma conta Resend.

Isso significa: **o staging local atual desta máquina (`docker-compose.local-staging.yml`, que já define `NODE_ENV=production`) vai falhar de propósito em qualquer envio de e-mail até que `RESEND_API_KEY`/`EMAIL_FROM` sejam configurados nesse ambiente.** Esse é o comportamento fail-closed correto — não uma regressão.

## Variáveis de ambiente

Adicionadas em `.env.production.example`:

```bash
RESEND_API_KEY=__INJECT_FROM_SECRETS_MANAGER__
EMAIL_FROM="Travel Platform <no-reply@mail.travel-platform.com>"
EMAIL_REPLY_TO=suporte@travel-platform.com
```

Reutilizadas (já existiam, não foram inventadas nomes novos): `APP_URL` (app da agência, usado para o link de reset de senha do staff) e `CUSTOMER_PORTAL_URL` (portal do cliente, usado para o link de convite/ativação/reset do cliente).

**Nunca** colocar a `RESEND_API_KEY` real no Git. Nunca expô-la ao frontend (ela só existe em `services/api`, nunca em nenhum `VITE_*`/`import.meta.env`). Nunca é logada — confirmado por teste automatizado (`email-provider.test.ts`).

## Configuração do Resend (domínio de envio)

**Não foi inventado nenhum domínio real.** O proprietário do produto precisa:

1. Criar uma conta no [Resend](https://resend.com).
2. Adicionar um **subdomínio transacional dedicado** (recomendado, não o domínio raiz) — por exemplo `mail.<dominio-real>` ou `notify.<dominio-real>`.
3. Configurar os registros DNS que o Resend exigir para verificar esse subdomínio:
   - **SPF**: registro `TXT` apontando para os servidores do Resend (o próprio painel do Resend mostra o valor exato ao adicionar o domínio).
   - **DKIM**: registros `CNAME` (geralmente 3) que o Resend gera automaticamente ao adicionar o domínio.
   - **DMARC** (recomendado, não obrigatório pelo Resend, mas recomendado para entregabilidade): registro `TXT` em `_dmarc.<subdomínio>`, política inicial sugerida `p=none` para observar antes de enforçar.
4. Gerar uma API Key no painel do Resend e injetá-la como `RESEND_API_KEY` via gerenciador de segredos do ambiente de piloto (nunca em arquivo versionado).
5. Definir `EMAIL_FROM` usando exatamente o domínio verificado (ex.: `"Travel Platform <no-reply@mail.<dominio-real>>"`).

**Esta sessão não alterou nenhum DNS automaticamente** — essa etapa é exclusivamente manual, do proprietário do produto/domínio.

## Fluxos que agora enviam e-mail real

| Fluxo | Função | Link enviado | Anti-enumeração |
|---|---|---|---|
| Convite de funcionário | `sendEmployeeInvitationEmail` (via `createInvitation`) | `{CUSTOMER_PORTAL_URL}/accept-invitation/{token}` | Não aplicável — quem convida já sabe o e-mail do convidado |
| Esqueci minha senha (staff) | `sendStaffPasswordResetEmail` (via `forgotPassword`) | `{APP_URL}/reset-password?token={token}` | **Sim** — falha de envio é logada mas nunca propagada na resposta HTTP (que já é genérica por design) |
| Esqueci minha senha (cliente) | `sendCustomerPasswordResetEmail` (via `customerForgotPassword`) | `{CUSTOMER_PORTAL_URL}/customer-portal/reset-password?token={token}` | **Sim**, mesmo princípio |
| Ativação do Portal do Cliente | `sendCustomerActivationEmail` (via `grantCustomerPortalAccess` → rota `/customers/:id/portal-access`) | `{CUSTOMER_PORTAL_URL}/customer-portal/reset-password?token={token}` | Não aplicável — quem concede acesso já sabe o e-mail do cliente |

**Nota importante sobre o convite/ativação, ambos não-anti-enumeração:** se o envio de e-mail falhar (provedor não configurado, domínio não verificado, etc.), o erro **propaga** como uma falha real da requisição (não finge sucesso) — mas o registro (convite ou `customer_accounts`) já foi criado no banco antes da tentativa de envio, então o token/link ainda é válido e recuperável manualmente se necessário (a UI de convite já mostra o link como reforço/fallback, mesmo com e-mail real configurado).

## Templates

Três templates simples em `templates.ts`, todos em português, com HTML mínimo (funcionam com imagens bloqueadas, pois não usam imagens) e uma versão em texto puro equivalente:

- `employeeInvitationEmail` — convite de funcionário.
- `passwordResetEmail` — reutilizado tanto para staff quanto para cliente.
- `customerActivationEmail` — ativação do Portal do Cliente.

Nenhum template inclui informação sensível além do link de ação em si (nenhum dado financeiro, nenhuma nota interna).

## Observabilidade

Cada tentativa de envio gera um log estruturado (JSON) via `console.log`, com:

```json
{"level":30,"msg":"email.employee_invitation.sent","emailType":"employee_invitation","result":"sent","provider":"resend","messageId":"...","timestamp":"..."}
```

**Nunca logado:** senha, token de reset/convite/ativação, API key, corpo completo do e-mail. O `messageId` retornado pelo Resend é seguro de logar (identifica o envio no painel do Resend, não é um segredo).

## Tratamento de erros

- **Timeout de rede**: `ResendEmailProvider` usa `AbortSignal.timeout(10_000)` — nunca trava indefinidamente.
- **Erro do provedor** (domínio não verificado, destinatário rejeitado, etc.): `EmailProviderSendError`, com o status HTTP do Resend, sem nunca ecoar o corpo bruto da resposta do provedor (que poderia conter informação inesperada) nem a API key.
- **Configuração ausente em produção/staging**: `EmailProviderNotConfiguredError`, código `EMAIL_PROVIDER_NOT_CONFIGURED`.
- Em nenhum dos casos acima o processo quebra com uma exceção não tratada solta — cada ponto de disparo captura e decide (propagar para o chamador HTTP real, ou apenas logar, dependendo se é ou não uma superfície anti-enumeração, ver tabela acima).

## Como trocar de provedor no futuro

1. Criar `services/api/src/email/<novo-provedor>-provider.ts` implementando a interface `EmailProvider` (`send(input): Promise<SendEmailResult>`).
2. Atualizar `factory.ts` para escolher esse novo provider (por uma nova variável de ambiente, ex. `EMAIL_PROVIDER=resend|outro`, ou simplesmente substituir o import se for uma migração definitiva).
3. Nenhum outro arquivo do domínio (`local-auth.ts`, `invitations.ts`, etc.) precisa mudar — todos dependem apenas de `email/index.ts`.

## Troubleshooting

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| Endpoint retorna 500 com `EMAIL_PROVIDER_NOT_CONFIGURED` | `RESEND_API_KEY`/`EMAIL_FROM` ausentes em produção/staging | Variáveis de ambiente do deploy |
| E-mail não chega, mas o log mostra `"result":"sent","provider":"resend"` | Entrega aceita pelo Resend mas rejeitada depois (spam, domínio não totalmente propagado) | Painel do Resend (buscar pelo `messageId` logado) |
| Log mostra `email.*.failed` com `errorCode` diferente de `EMAIL_PROVIDER_NOT_CONFIGURED` | Falha real do provedor (rede, domínio não verificado, destinatário inválido) | `EmailProviderSendError.message` no log (nunca contém a API key) |
| Convite/ativação retorna 500 mas o registro já existe no banco | Comportamento esperado (ver seção "Fluxos") — o token ainda é válido | Reenviar manualmente ou usar o link já existente na UI |

## Teste real pendente (requer credencial externa)

Esta rodada implementou, testou (com provedor mockado) e documentou a integração completa. **O envio real de um e-mail e a confirmação de recebimento em uma caixa postal real dependem de uma `RESEND_API_KEY` real e de um domínio verificado — nenhum dos dois existe nesta sessão.** Assim que o proprietário do produto fornecer essas credenciais, o teste manual descrito em `docs/release/RELEASE_CANDIDATE_VALIDATION.md` (seção "Teste real") deve ser executado antes de considerar o piloto liberado com e-mail 100% confirmado ponta a ponta.
