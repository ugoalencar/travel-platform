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
EMAIL_FROM="Travel Platform <no-reply@mail.travelplataforma.com.br>"
EMAIL_REPLY_TO=suporte@travelplataforma.com.br
```

Reutilizadas (já existiam, não foram inventadas nomes novos): `APP_URL` (app da agência, usado para o link de reset de senha do staff) e `CUSTOMER_PORTAL_URL` (portal do cliente, usado para o link de convite/ativação/reset do cliente).

**Nunca** colocar a `RESEND_API_KEY` real no Git. Nunca expô-la ao frontend (ela só existe em `services/api`, nunca em nenhum `VITE_*`/`import.meta.env`). Nunca é logada — confirmado por teste automatizado (`email-provider.test.ts`).

## Configuração do Resend (domínio de envio)

**Domínio real registrado pelo proprietário do produto: `travelplataforma.com.br`.** Decisão tomada nesta rodada:

- **Domínio de envio (verificar no Resend): `mail.travelplataforma.com.br`** — subdomínio transacional dedicado, não o domínio raiz (prática recomendada para reputação de envio e para isolar o tráfego transacional do resto do domínio).
- **`EMAIL_FROM`**: `"Travel Platform <no-reply@mail.travelplataforma.com.br>"`.
- **`EMAIL_REPLY_TO`**: `suporte@travelplataforma.com.br` — este fica no domínio raiz (é só um cabeçalho de resposta, não precisa de verificação SPF/DKIM).

Passos que o proprietário do produto executa (esta sessão não altera DNS automaticamente):

1. No painel do Resend, adicionar o domínio **`mail.travelplataforma.com.br`** (não `travelplataforma.com.br` direto).
2. Configurar os registros DNS que o Resend exigir para verificar esse subdomínio:
   - **SPF**: registro `TXT` apontando para os servidores do Resend (o painel mostra o valor exato ao adicionar o domínio).
   - **DKIM**: registros `CNAME` (geralmente 3) que o Resend gera automaticamente.
   - **DMARC** (recomendado, não obrigatório pelo Resend, mas recomendado para entregabilidade): registro `TXT` em `_dmarc.mail.travelplataforma.com.br`, política inicial sugerida `p=none` para observar antes de enforçar.
3. Gerar uma API Key no painel do Resend e injetá-la como `RESEND_API_KEY` via gerenciador de segredos do ambiente de piloto (nunca em arquivo versionado, nunca em chat).
4. Confirmar no próprio painel do Resend que o domínio aparece como "Verified" antes de considerar o e-mail real liberado para o piloto.

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

## Teste real com credencial — domínio verificado, entrega confirmada

O domínio `mail.travelplataforma.com.br` foi verificado no Resend (registros SPF/DKIM propagados). Com o domínio verificado, o teste direto abaixo retornou sucesso:

```
STATUS: 200
BODY: {"id":"..."}
```

Em seguida, os 4 fluxos reais do produto que disparam e-mail foram exercidos ponta a ponta em staging local, com a `RESEND_API_KEY` real, contas de teste reais (revertidas ao estado original após o teste) e confirmação de recebimento pelo destinatário real:

| Fluxo | Rota real | `messageId` (Resend) | Resultado |
|---|---|---|---|
| Convite de funcionário | `POST /api/settings/invitations` | `01a0b6be-e38a-73ae-b796-1e85e36a2ca9` | ✅ e-mail recebido, remetente/assunto corretos |
| Forgot/reset password (staff) | `POST /api/auth/forgot-password` → `POST /api/auth/reset-password` | `01a0b6bf-299f-72bf-965e-147000ac203a` | ✅ recebido; reset real bem-sucedido; token inutilizável após uso; login confirmado |
| Ativação do Customer Portal | `POST /api/customers/:id/portal-access` → `POST /customer-auth/reset-password` | `01a0b6bf-dd1c-7659-a35b-8f80a63167ba` | ✅ recebido; ativação real bem-sucedida; login confirmado |
| Reset do Customer Portal | `POST /customer-auth/forgot-password` → `POST /customer-auth/reset-password` | `01a0b6c0-4d25-7080-94f6-d639a987319d` | ✅ recebido; reset real bem-sucedido; token inutilizável após uso; login confirmado |

O destinatário real (`alencarugo@gmail.com`) confirmou recebimento correto dos 4 e-mails (remetente `Travel Platform <no-reply@mail.travelplataforma.com.br>`, assunto correto, sem cair em spam).

**Nota sobre verificação via API do Resend:** a `RESEND_API_KEY` em uso é uma chave restrita ("sending access only"), portanto `GET /domains` e `GET /emails/:id` retornam `401 restricted_api_key` — isso é o comportamento esperado de uma chave com escopo apenas de envio, não um defeito. A confirmação de entrega vem do `HTTP 200` retornado por cada `POST /emails` (com `messageId` real) somada à confirmação humana de recebimento na caixa postal real.

**Logs verificados:** cada um dos 4 disparos gerou o log estruturado esperado (`email.<tipo>.sent`, `provider:"resend"`, `messageId`), sem nenhuma ocorrência do token bruto, senha ou `RESEND_API_KEY` nos logs do container.

**Estado de teste limpo após a validação:** todas as contas e registros usados exclusivamente para este teste (papel de usuário temporariamente alterado, e-mail de teste, convite de teste, conta de cliente de teste) foram revertidos/removidos após a confirmação, sem deixar dados de teste residuais no banco.

### Comando usado no teste direto (reprodutível)

```bash
# Dentro do container travel-platform-api-staging, com RESEND_API_KEY/EMAIL_FROM
# já injetados via variável de ambiente (nunca via arquivo versionado):
node -e "
const { ResendEmailProvider } = require('/app/services/api/dist/services/api/src/email/resend-provider.js');
const provider = new ResendEmailProvider({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  replyTo: process.env.EMAIL_REPLY_TO,
});
provider.send({
  to: 'endereco-real-para-teste@example.com',
  subject: 'Teste real - Travel Platform (Resend)',
  html: '<p>Teste real de entrega.</p>',
  text: 'Teste real de entrega.',
}).then((r) => console.log('SUCESSO:', JSON.stringify(r))).catch((e) => console.error('ERRO:', e.message));
"
```

## Status do P1 (ausência de e-mail real) — **FECHADO**

- **Implementação:** completa (abstração desacoplada, 4 fluxos conectados, fail-closed, templates, observabilidade segura).
- **Testes automatizados (mock):** completos e verdes (`email-provider.test.ts`, 15/15; mais 3 suítes de integração reais confirmando o e-mail disparando corretamente com o provedor de desenvolvimento).
- **Teste real contra o provedor real (Resend, chave real):** executado, domínio verificado, `HTTP 200` confirmado.
- **Prova de entrega em caixa postal real:** **obtida** — os 4 fluxos reais do produto foram exercidos ponta a ponta com e-mails reais recebidos, remetente/assunto corretos, tokens válidos, uso único e expiração confirmados, login real confirmado após cada ação, nenhum segredo exposto em log.
