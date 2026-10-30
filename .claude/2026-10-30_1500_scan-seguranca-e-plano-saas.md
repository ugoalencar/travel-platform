# Scan de segurança e plano para SaaS multi-tenant — Travel Platform

Data: 2026-10-30. Escopo: verificação externa não intrusiva (cabeçalhos, CORS, caminhos sensíveis, dependências, segredos no git) e análise de configuração. Sem testes de exploração, sem carga, sem alterações em produção.

## Achados

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| 1 | **Crítico** | Chave privada OpenSSH real em arquivo versionado (`.env.example`), presente no histórico (commit `67ff9f9`). | `git grep` + `git log -S`. Valor não reproduzido aqui. |
| 2 | **Alto** | Preview da API usa o mesmo banco de produção (`DATABASE_URL`, `PLATFORM_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MFA_ENCRYPTION_KEY` com target production + preview). Um preview comprometido ou mal configurado atinge dados reais. | Vercel env list. |
| 3 | **Alto** | Dependência `zod < 4.6.6` com vulnerabilidade alta (correção disponível). | `npm audit --omit=dev`. |
| 4 | Médio | Sem Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy e Permissions-Policy nos 3 frontends. Só HSTS. | `curl -I` nos 3 domínios. |
| 5 | Médio | Dependências: `fast-uri` (moderada) e `fastify` 5.12.2–5.12.5 (baixa), ambas com correção. | `npm audit`. |
| 6 | Médio | Formulário público de lead sem captcha/validação (já na auditoria anterior, não corrigido). | `founder/board.md`. |
| 7 | Médio | Conta Demo com senha pública fraca (`demo12345678`) em produção. Aceito pelo fundador para ambiente de demonstração; precisa ficar isolado. | Decisão do fundador. |
| 8 | Baixo | Arquivo `.env.antigo-comprometido` existe localmente (não versionado). Nome indica credencial que já foi comprometida. | Listagem da pasta. |
| 9 | Corrigido hoje | Links de e-mail apontavam para `localhost` (faltavam `APP_URL`, `PLATFORM_ADMIN_URL`, `CUSTOMER_PORTAL_URL` na Vercel). | Variáveis criadas e API redeployada. |

Verificado e **sem problema** nesta rodada: HSTS nos domínios; API com `nosniff` e `X-Frame-Options: DENY`; CORS não reflete origem externa; `/.env`, `/.git/config`, `/swagger`, `/metrics` retornam o HTML do SPA (não são arquivos reais); `/api/docs` 404; `.env` real não versionado (`.gitignore`).

## Cloudflare

- Os nameservers do domínio são `a.sec.dns.br` e `b.sec.dns.br`: **a zona não está no Cloudflare**.
- As ferramentas Cloudflare disponíveis aqui cobrem Workers, D1, KV e R2. Não há operação de zona, WAF ou scanner.
- Para usar Cloudflare como proteção e teste, é preciso adicionar a zona e trocar os nameservers. Isso altera o DNS de todos os domínios, inclusive o Lite. **Não foi feito** e exige sua aprovação e validação prévia.

## Plano e cronograma

**Semana 0 (48 h) — contenção**
1. Revogar a chave SSH do `.env.example`, gerar nova fora do repositório e remover o valor do histórico (`git filter-repo`) — só com sua autorização, porque reescreve histórico.
2. Separar o banco de preview: criar variáveis de preview apontando para um banco de teste, sem os segredos de produção.
3. Atualizar `zod`, `fastify` e `fast-uri` (`npm audit fix` testado com `npm run test`).
4. Confirmar rotação do que estava em `.env.antigo-comprometido`.

**Semana 1 — cabeçalhos e entrada pública**
5. Adicionar CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy e Permissions-Policy nos 3 frontends (`vercel.json`).
6. Captcha e validação no formulário de lead.
7. Gitleaks no CI (`.github/workflows/ci.yml`).
8. MFA obrigatório para toda conta de plataforma.

**Semana 2 — isolamento entre tenants**
9. Rodar `tests/security` e `npm run test:db` no CI e registrar o resultado.
10. Teste autenticado de isolamento Gadotti × Demo (depois que a Patricia tiver senha).

**Semana 3 — decisão de infraestrutura**
11. Decidir se a zona vai para o Cloudflare (WAF, rate limit de borda, scanner). Se sim, plano de troca de DNS com checagem do Lite antes.

**Semana 4 — negócio e prova**
12. Corrigir a landing para não prometer cobrança recorrente nem NFS-e até existirem.
13. Teste de restauração de backup (runbook em `docs/08-devops`), não verificado nesta rodada.

## Não verificado

Lógica de autorização por endpoint, injeção, XSS, SSRF e fluxo de pagamento não foram testados. Este scan é de superfície externa. Um pentest autenticado precisa de contas de teste e de autorização explícita.
