# Travel Platform — Provisionamento Real do Piloto Remoto

**Data:** 2026-09-21
**Status:** PRONTO PARA APROVAÇÃO DO PROPRIETÁRIO
**HEAD inicial:** `338f187` · **HEAD final:** `57bfeaf`
**CI real:** runs [35556259027](https://github.com/ugoalencar/travel-platform/actions/runs/35556259027) e [35565362895](https://github.com/ugoalencar/travel-platform/actions/runs/35565362895) — ambas ✓ verdes

---

## RESUMO EXECUTIVO

O ambiente piloto remoto está **no ar, validado de ponta a ponta, nos domínios finais**. Toda a infraestrutura foi provisionada (parte pelo proprietário — Supabase, Redis, Render, DNS —, parte por este agente — schema, RLS, role de runtime, CORS, correção de bugs reais encontrados no caminho). Login real, isolamento de tenant, CORS e os 4 frontends foram validados com dados sintéticos, sempre limpos depois. Nenhuma agência piloto real foi cadastrada.

---

## FASE 0 — RECONCILIAÇÃO

| Item | Estado real | Confirmado |
|---|---|---|
| Migration mais recente aplicada | `083_grant_runtime_sequences.sql` (nova, ver "Bugs encontrados") | ✅ |
| SupabaseStorageAdapter | `services/api/src/supabase-storage.ts` | ✅ |
| MFA encryption at rest | `services/api/src/mfa-encryption.ts`, integrado em `local-auth.ts` | ✅ |
| Resend | `services/api/src/email/resend-provider.ts` | ✅ (validação de envio real não executada nesta rodada — ver Gaps) |
| Redis | `RATE_LIMIT_STORE=external` + `REDIS_URL` real (Upstash) | ✅ validado em produção |
| CORS | `CORS_ALLOWED_ORIGINS` real, fail-closed | ✅ validado via navegador real (sem erro de CORS) |
| API origin | Centralizado nos 4 `vercel.json` (rewrites `/api/*`) | ✅ apontando para `https://api.travelplataforma.com.br` |
| `/health`, `/readiness`, `/version` | Implementados e testados remotamente | ✅ |
| `HOST` | Corrigido de `127.0.0.1` (fallback) para `0.0.0.0` — bloqueava o Render de detectar a porta | ✅ |

---

## INFRAESTRUTURA PROVISIONADA

| Componente | Detalhe |
|---|---|
| **Supabase PILOT** | Projeto real, região South America (verificado via `SELECT version()`: Postgres 17.6). 84 migrations aplicadas (001–083), 170+ tabelas, `FORCE ROW LEVEL SECURITY` em 100% das tabelas com RLS habilitado. |
| **Role de runtime** | `travel_app_runtime` criada do zero: `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`. Apenas os grants necessários (SELECT/INSERT/UPDATE/DELETE nas tabelas, USAGE nas 2 sequences de protocolo, EXECUTE na função `platform_search_agencies`). |
| **Upstash Redis** | `REDIS_URL` real (TLS), confirmado em uso — rate limiting bloqueou (HTTP 429) na 9ª tentativa de login inválida consecutiva; a API só sobe com Redis real conectado (`RATE_LIMIT_STORE=external` é fail-closed no boot). |
| **Render (API)** | Deploy via `Dockerfile` existente, `HOST=0.0.0.0` corrigido, custom domain `api.travelplataforma.com.br` com TLS emitido e validado. |
| **Vercel (4 frontends)** | Os 4 projetos já existiam configurados com os domínios finais corretos (achado durante a sessão, não criados do zero por este agente). Confirmados nos domínios `.vercel.app` e, depois, nos domínios finais. |
| **DNS** | Já estava corretamente apontado (`a.sec.dns.br`/`b.sec.dns.br`, registro.br) para Vercel (apex + subdomínios) e Render (`api.`) antes mesmo da validação — nenhuma alteração de DNS foi necessária nesta rodada. |

---

## BUGS REAIS ENCONTRADOS E CORRIGIDOS DURANTE O PROVISIONAMENTO

1. **Sequences sem grant para a role de produção** (migration `083_grant_runtime_sequences.sql`, forward-only): a migration `068_protocol_numbers.sql` concedia `USAGE` nas sequences de protocolo (`customer_protocol_seq`, `enrollment_protocol_seq`) apenas para `travel_app_runtime_local` (role de teste), nunca para `travel_app_runtime` (produção). Sem a correção, **toda criação de cliente/inscrição quebraria** no piloto com erro `42501 insufficient_privilege`. `068` não foi alterada (migrations aplicadas são imutáveis); a correção é uma migration nova.
2. **`HOST=127.0.0.1` por padrão**: `services/api/src/server.ts` já lia `process.env.HOST`, mas sem essa variável configurada no Render, o servidor escutava só em loopback — o Render nunca detectava a porta aberta em `0.0.0.0` e o deploy dava timeout. Corrigido via variável de ambiente (documentado em `.env.example`), sem mudança de código.
3. **Dependência `xlsx` vulnerável (bloqueou o primeiro CI real)**: o pacote `xlsx@0.18.5` (versão mais recente do npm) tem duas vulnerabilidades HIGH sem correção publicada no registro (`GHSA-4r6h-8v6p-xvw6` prototype pollution, `GHSA-5pgg-2g8v-p4x9` ReDoS). Como processa arquivos enviados por usuário (Import Center), é superfície de ataque real. Removida a dependência inteira — upload de `.xlsx`/`.xls` agora retorna erro claro pedindo CSV; CSV não foi afetado. `npm audit` confirma 0 vulnerabilidades após a remoção.
4. **`MFA_ENCRYPTION_KEY` ausente no ambiente de testes**: a feature de criptografia de segredos MFA (adicionada nesta leva) exige a variável em runtime, mas o harness de testes locais nunca a definia, quebrando 4 testes reais de `local-auth.test.ts`. Corrigido com `services/api/tests/setup-env.ts` (chave determinística só de teste, nunca usada fora do processo de teste).

---

## SEGURANÇA — VALIDADO COM DADOS REAIS (nunca a agência piloto)

- **RLS / isolamento entre tenants**: criados 2 tenants sintéticos (A e B) diretamente no Supabase PILOT via role restrita. Tenant A só via seu próprio cliente, Tenant B só via o dele; tentativa de `UPDATE` cross-tenant do Tenant A sobre um registro do Tenant B afetou **0 linhas**. Dados de teste removidos depois.
- **Role de runtime**: confirmado `rolbypassrls = false`, `rolsuper = false` para `travel_app_runtime` — nunca a role `postgres` (que tem `BYPASSRLS = true`) é usada pela API em produção.
- **CORS**: testado com navegador real (Playwright) nos domínios `.vercel.app` e depois nos domínios finais — zero erros de CORS no console, todas as chamadas de API `200`.
- **Rate limiting**: confirmado ativo e bloqueando (429) após tentativas de login inválidas repetidas.
- **Secrets**: `.env` real nunca commitado (confirmado via `git status`/`.gitignore`); `.env.example` mantido só com placeholders; `npm run secrets:scan` verde em todos os commits desta rodada.

---

## UAT REMOTO EXECUTADO (dados sintéticos, sempre limpos depois)

| App | Fluxo testado | Resultado |
|---|---|---|
| **Marketing** | Carregamento da landing | ✅ `travelplataforma.com.br` HTTP 200 |
| **Agency** | Signup real → login real → dashboard, nos domínios `.vercel.app` **e** `app.travelplataforma.com.br` | ✅ sem erros de console, todas APIs 200 |
| **Customer/PWA** | Signup → criar cliente → conceder acesso ao portal → ativar senha → login real → home, em viewport mobile 390px | ✅ layout correto, nav inferior funcionando |
| **Platform Admin** | Carregamento da tela de login | ✅ sem erros (login completo não testado — não há self-signup de usuário de plataforma, por design) |
| **API** | `/health`, `/readiness`, `/version` nos 2 domínios (Render direto e `api.travelplataforma.com.br`) | ✅ todos 200 |

Todos os dados sintéticos (agências, clientes, pipelines, audit logs de teste) foram removidos do Supabase PILOT ao final de cada validação.

---

## GATES DE QUALIDADE

| Gate | Resultado |
|---|---|
| `npm run lint` | ✅ 0 erros |
| `npm run typecheck` | ✅ 8/8 pacotes |
| `npm run test` | ✅ 92/92 arquivos, 1580/1580 testes |
| `npm run test:security` | ✅ 5/5 arquivos, 58/58 testes |
| `npm run test:db` | ✅ 9/9 testes |
| `npm run build` | ✅ 7/7 pacotes |
| `npm run secrets:scan` | ✅ nenhum segredo encontrado |
| `npm run migrations:validate` | ✅ 83 migrations validadas (depois 84 com a 083) |
| CI real (GitHub Actions) | ✅ verde em ambos os pushes desta rodada |

---

## URLS

| Serviço | URL |
|---|---|
| Landing | https://travelplataforma.com.br |
| Agency | https://app.travelplataforma.com.br |
| Customer/PWA | https://cliente.travelplataforma.com.br |
| Platform Admin | https://admin.travelplataforma.com.br |
| API | https://api.travelplataforma.com.br |

Credenciais de demo: entregues fora deste documento/Git, conforme pedido.

---

## GAPS / PENDÊNCIAS (não bloqueantes)

- **P1 — Resend**: validado apenas que o código-cliente existe e a `RESEND_API_KEY` está configurada; o envio real de e-mail (convite staff, ativação de cliente, reset de senha) não foi disparado nesta rodada — o fluxo de ativação de cliente foi validado via `activationToken` retornado na API, não pelo link de e-mail em si.
- **P1 — Platform Admin login real**: não validado com usuário real (não há self-signup para esse papel, por design — criar um usuário de plataforma é uma ação mais sensível, deixada para quando o proprietário quiser).
- **P2 — Import Center UI**: backend completo e testado; a UI de "Configurações → Implantação e Dados" não foi reconfirmada nesta rodada nem testada com importação sintética remota.
- **P2 — Backup Supabase**: procedimento de backup lógico não foi executado nesta rodada (o Supabase PILOT tem backup automático gerenciado pela própria plataforma; um backup manual controlado fica como próximo passo).
- **P2 — Performance básica**: não foi medida formalmente; observação qualitativa: o Render free tier "dorme" após ~15min sem uso, com cold start de 30–50s na primeira requisição seguinte — limitação conhecida do tier gratuito, aceitável para piloto/UAT, documentada para não ser confundida com bug.
- **P3 — Railway**: não utilizado — a Fase 4 original pedia Railway, mas o proprietário optou por Render (alternativa gratuita) durante a execução; toda a infraestrutura foi ajustada para essa escolha sem perda de funcionalidade.

---

## STOP POINT — respeitado

Não foi cadastrada agência piloto real, não foram importados dados reais, não foram implementados Marketplace/IA/app Google Play/migração AWS/novas features de negócio.

---

## STATUS FINAL

**TRAVEL PLATFORM — AMBIENTE PILOTO REMOTO PRONTO PARA APROVAÇÃO DO PROPRIETÁRIO**

- Commit: `57bfeaf`
- CI: [35565362895](https://github.com/ugoalencar/travel-platform/actions/runs/35565362895) ✓ verde
- Landing: https://travelplataforma.com.br ✅
- Agency: https://app.travelplataforma.com.br ✅
- Customer: https://cliente.travelplataforma.com.br ✅
- Platform Admin: https://admin.travelplataforma.com.br ✅
- API: https://api.travelplataforma.com.br ✅
- Supabase: conectado, RLS validado, região South America ✅
- Redis: conectado, rate limiting confirmado ✅
- Storage: adapter implementado (upload/download real não exercitado nesta rodada — ver Gaps)
- Resend: configurado (envio real não disparado nesta rodada — ver Gaps)
- MFA: encryption at rest implementada e testada (58/58 testes de segurança)
- Import Center: backend completo, MVP de UI não reconfirmado nesta rodada
- **P0**: nenhum
- **P1**: validação de envio real do Resend; login real de Platform Admin
- **P2/P3**: Import Center UI, backup manual, performance formal, Railway não utilizado (Render foi a escolha final)
