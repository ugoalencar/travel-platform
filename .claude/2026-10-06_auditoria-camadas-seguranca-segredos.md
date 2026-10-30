# Auditoria rápida: camadas de segurança e proteção de tokens/chaves

Data: 2026-10-06 · Somente leitura. Nenhum `.env` foi aberto; nenhum valor de segredo foi impresso. Produção/Render/Vercel/Supabase/GitHub não foram acessados.

## Evidências de proteção (no repositório)
- `.gitignore` bloqueia `.env`, `.env.*`, `*.pem`, `*.key`, `secrets/`, `credentials/`, `.tmp/`; só os `*.example` são rastreados. Nenhum arquivo de env real rastreado; nunca houve `.env` real no histórico (só os `*.example`).
- Histórico do git: 0 commits com padrões de `sk_live_`, `AKIA…`, `ghp_…`, chave privada PEM, `re_…`. 1 commit casa com URL de Postgres do Supabase (63e9fe1, teste de TLS): senha é placeholder (contém palavra de marcador), falso positivo.
- Código rastreado: só aparecem valores falsos em testes e credenciais do banco descartável local.
- `env.ts` falha fechado em produção: exige `DATABASE_URL`, `PLATFORM_DATABASE_URL` (diferente da anterior), `MFA_ENCRYPTION_KEY` ≥ 32 caracteres, proíbe `ALLOW_DEV_AUTH=true`.
- Senhas com scrypt; segredo TOTP cifrado em repouso; helmet; CORS por lista explícita (Lite exige HTTPS e proíbe `*`); rate limit por classe; RLS e separação de role de plataforma; auditoria; `redact` no log.
- CI roda `secrets:scan` (script próprio), `security:check`, `test:security`, `test:db`. `npm audit --omit=dev`: 0 vulnerabilidades.

## Lacunas
1. Sem gestor central de segredos nem inventário/rotina de rotação; segredos vivem em variáveis de ambiente de cada serviço. `.env.antigo-comprometido` ainda existe na raiz (ignorado pelo git): confirmar rotação do que continha e apagar.
2. Sem varredura contínua padrão de mercado: sem gitleaks/push protection verificável, sem Dependabot, sem CodeQL (`.github` só tem `ci.yml`); hook de pré-commit é script manual (`pre-commit.ps1`), sem husky.
3. Frontends na Vercel sem cabeçalhos de segurança (`vercel.json` sem CSP, X-Frame-Options/frame-ancestors, HSTS, Referrer-Policy, Permissions-Policy, nosniff). Tokens de sessão (Bearer) em `sessionStorage` nos apps: dependem de a CSP existir para limitar dano de XSS.
4. `POST /public/leads` sem schema, aceita `status`/`source` do chamador, sem captcha (provedor de captcha existe, não ligado às rotas públicas), resposta `{"lead":null}`.
5. Webhooks de cobrança ainda inexistentes; a classificação de rate limit só reconhece `/webhook(s)/...`, então a rota planejada `/public/billing/webhooks/...` cairia na classe pública genérica.
6. MFA opcional no super admin (seed com `mfa_enabled=false`), inexistente no Lite; verificação de MFA sob limite de recuperação, sem bloqueio por conta+IP (achado BAIXO-02 da auditoria de 2026-10-02).
7. Sem troca de senha autenticada no Full (MÉDIO-02 da mesma auditoria).
8. Uploads sem varredura de malware.
9. Sem alertas de segurança (login anômalo, falha de webhook, pico de 401/429).

## Já corrigido desde a auditoria de 2026-10-02
Lite ganhou rate limit, CSP e token em `sessionStorage` (antes `localStorage`) e recuperação de senha (commit `cdb9a67`).

## Observação
Credencial de teste local criada nesta sessão está em `.tmp/local-platform-admin-credentials.txt` (git ignora; vale só para o banco descartável local).

(não relacionado à auditoria — nota de rodapé por engano; ver relatório separado de imagens/vídeo da landing)
