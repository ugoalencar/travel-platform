# Autenticação

> Reconciliado com a implementação real em 2026-09 (Pilot Delivery Gap Closure — Agent 06/Docs).
> A versão anterior deste documento descrevia um design (JWT + cookie httpOnly, argon2, rotas
> `/auth/register`/`/auth/forgot`/`/auth/reset`/`/auth/me`) que nunca foi implementado. Ver
> `docs/adr/ADR-003-authentication.md` para o histórico dessa decisão nunca construída.

## Fluxo

```
1. Usuário informa agencySlug + email + senha
2. Backend valida credenciais (scrypt, tempo constante mesmo se usuário/agência não existir)
3. Sem MFA cadastrado -> sessão FULLY_AUTHENTICATED, token opaco retornado
4. Com MFA cadastrado  -> sessão MFA_REQUIRED, cliente chama POST /auth/mfa/verify com o código
5. Token enviado pelo cliente em toda request como `Authorization: Bearer <token>`
6. Logout: sessão marcada invalidated_at no servidor (não é client-side apenas)
```

Não existe endpoint de auto-registro de agência (`/auth/register`) — agências são criadas via o
fluxo de onboarding existente (`OnboardingWizardPage` / `completeOnboarding()`), e usuários
adicionais só são criados por convite (`invitations.ts`), nunca por auto-cadastro.

## Endpoints reais

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | pública | `{ agencySlug, email, password }` |
| POST | `/auth/mfa/verify` | pública (token de desafio) | `{ sessionToken, code }` |
| POST | `/auth/forgot-password` | pública | `{ agencySlug, email }` — sempre resposta genérica |
| POST | `/auth/reset-password` | pública (token) | `{ token, newPassword }` — revoga todas as sessões |
| POST | `/auth/logout` | sessão | revoga a sessão atual |
| GET | `/auth/sessions` | sessão | lista sessões ativas do usuário |
| POST | `/auth/sessions/:id/revoke` | sessão | revoga uma sessão específica |
| POST | `/auth/mfa/enroll` | sessão | gera segredo TOTP + 16 códigos de recuperação |
| POST | `/auth/mfa/enroll/confirm` | sessão | `{ secretId, code }` — ativa o MFA |
| POST | `/auth/mfa/disable` | sessão | desativa o MFA |
| PATCH | `/users/:id/status` | sessão, ADMIN+ | `{ status, reason }` — suspende/reativa; revoga sessões do alvo |

`GET /me` (identidade do usuário autenticado) já existe separadamente em `routes/infrastructure.ts`
— não faz parte da superfície `/auth/*`.

## Sessão (não é JWT)

Token opaco de 32 bytes (`randomBytes(32).toString('hex')`), retornado ao cliente uma única vez.
Apenas o hash SHA-256 do token é persistido (`auth_sessions.session_token_hash`) — o servidor nunca
armazena o token em texto claro, e não há como decodificar um token para obter `user_id`/`agency_id`
sem uma consulta ao banco (ao contrário de um JWT, que carrega esses dados no próprio token).
Expiração: 24h (sessão completa) / 10 min (desafio de MFA pendente). Ver
`services/api/src/local-auth.ts` e `infrastructure/migrations/061_local_password_auth.sql`.

## Segurança

### Senhas

Hash com `scrypt` (built-in do Node, `node:crypto`) — não argon2. Formato armazenado:
`scrypt$N$r$p$<saltHex>$<hashHex>`, auto-descritivo para permitir ajuste futuro dos parâmetros de
custo sem quebrar verificação de hashes antigos. Ver `services/api/src/password-hashing.ts`.

### Rate limiting

`LoginAbuseProtector` (`services/api/src/rate-limit.ts`) rastreia falhas por IP, por conta (hash) e
pelo par IP+conta, com três estados de escalonamento: `throttle` → `captcha_required` →
`temporary_block`. Classes dedicadas `AUTH_LOGIN`/`AUTH_RECOVERY` no rate limiter geral cobrem
`/auth/login` e `/auth/forgot-password|reset-password` mesmo antes do `LoginAbuseProtector` entrar
em ação.

### MFA

TOTP (RFC 6238, SHA-1/6 dígitos/30s por padrão) + 16 códigos de recuperação de uso único, hash
SHA-256 em repouso. Obrigatório por política padrão para `OWNER`/`ADMIN`
(`mfa_requirements`, tabela por agência/role, configurável). Ver `services/api/src/mfa-provider.ts`.
