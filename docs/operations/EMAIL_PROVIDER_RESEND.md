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

## Teste real com credencial — status atual (DNS em propagação)

Uma `RESEND_API_KEY` real foi fornecida e configurada (apenas via variável de ambiente do container, nunca no Git — ver `infrastructure/docker-compose.local-staging.yml`, que só referencia `${RESEND_API_KEY:-}`, nunca o valor real). Dois testes de envio real foram executados contra a API do Resend a partir do ambiente de staging local, com o seguinte resultado:

```
STATUS: 403
BODY: {"statusCode":403,"message":"The mail.travelplataforma.com.br domain is not verified.
       Please, add and verify your domain on https://resend.com/domains","name":"validation_error"}
```

**Confirmado de forma independente** (consulta DNS pública direta, fora do Resend): `nslookup -type=TXT mail.travelplataforma.com.br` e `nslookup -type=CNAME resend._domainkey.mail.travelplataforma.com.br` não retornaram nenhum registro SPF/DKIM publicado — apenas o SOA do domínio raiz (`travelplataforma.com.br`). Ou seja, **os registros DNS do subdomínio de envio ainda não estão propagados/publicados**, confirmado tanto pelo Resend quanto por uma consulta DNS pública independente. O proprietário do produto confirmou que a configuração DNS ainda está em andamento.

**Isto não é uma falha de código.** O comportamento observado é exatamente o esperado: o `ResendEmailProvider` fez a chamada real, recebeu a rejeição real do provedor, e propagou um `EmailProviderSendError` real — sem fingir sucesso em nenhum momento (confirmado também pelo `email-provider.test.ts`, que testa esse exato cenário com um mock).

**Próximos passos (fora do escopo de código, dependem apenas da propagação DNS):**
1. Aguardar a propagação dos registros SPF/DKIM já configurados no provedor de DNS (`a.sec.dns.br` / registro.br, conforme a consulta acima) — pode levar de minutos a algumas horas, dependendo do TTL configurado.
2. Confirmar no painel do Resend (`https://resend.com/domains`) que o domínio aparece como **Verified** (não apenas "pendente").
3. Repetir a consulta DNS pública (`nslookup -type=TXT mail.travelplataforma.com.br`) até os registros aparecerem.
4. Somente então repetir o teste real de envio (comando documentado abaixo) e, se bem-sucedido, executar a lista completa dos 4 fluxos reais (convite, forgot/reset staff, ativação/reset Customer Portal) antes de considerar o P1 definitivamente fechado com prova de entrega real.

### Comando usado para o teste real (reprodutível quando o DNS propagar)

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

## Status do P1 (ausência de e-mail real)

- **Implementação:** completa (abstração desacoplada, 4 fluxos conectados, fail-closed, templates, observabilidade segura).
- **Testes automatizados (mock):** completos e verdes (`email-provider.test.ts`, 15/15; mais 3 suítes de integração reais confirmando 3 dos 4 fluxos disparando o e-mail corretamente com o provedor de desenvolvimento).
- **Teste real contra o provedor real (Resend, chave real):** executado — confirma que o código funciona corretamente e trata o erro real do provedor sem fingir sucesso.
- **Prova de entrega em caixa postal real:** **ainda não obtida** — bloqueada exclusivamente pela propagação DNS do subdomínio de envio, uma dependência externa e temporária, não uma falha de implementação.
