# ADR-003: Autenticação JWT + cookies httpOnly

## Status

Aceito, mas **nunca implementado como descrito abaixo** — ver nota de reconciliação.

## Nota de reconciliação (Pilot Delivery Gap Closure — Agent 06/Docs, 2026-09)

O design deste ADR (JWT em cookie httpOnly, expiração de 15 min, renovação automática) nunca foi
implementado. Duas tentativas anteriores existem no código, nenhuma completa até este pack:

1. `production-auth.ts` — scaffolding OIDC/OAuth2 (parsing de ID token, validação de state/nonce),
   nunca conectado a nenhuma rota real; `ProductionAuthProvider.authenticate()` sempre retornava
   `null` (comentário no próprio código: "placeholder that returns null (fail-closed)").
2. `auth_sessions`/MFA (`016_production_auth_captcha_mfa.sql`) — tabelas e primitivas criptográficas
   (TOTP, recovery codes) desenhadas para sessões OIDC, também nunca conectadas a HTTP.

**O que existe de verdade hoje** (`local-auth.ts`, `session-auth.ts`, `routes/auth.ts`,
`061_local_password_auth.sql`): login local por email+senha (scrypt), sessão via token opaco de
alta entropia enviado como `Authorization: Bearer <token>` (não JWT, não cookie), hash do token
armazenado em `auth_sessions.session_token_hash`, expiração de 24h, revogação real (logout,
reset de senha, suspensão de usuário). MFA (TOTP + recovery codes) e reset de senha completos.

Esta nota documenta a realidade sem reescrever a decisão histórica; o design original permanece
abaixo como registro do que foi decidido e nunca construído. Se JWT+cookie voltar a ser desejado,
isso é uma nova decisão (novo ADR), não uma correção deste.

## Contexto

Precisamos de autenticação segura para API e frontend, suportando multi-tenancy (agency_id no token).

## Decisão

Usar JWT com httpOnly cookies:

1. **JWT** com payload: user_id, agency_id, role, email
2. **httpOnly cookie** para armazenar token
3. **Expiração curta** (15 minutos)
4. **Renovação automática** a cada request

### Configuração

```typescript
reply.setCookie('token', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 900000, // 15 min
});
```

## Alternativas Consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| **JWT + httpOnly cookie** | Seguro, XSS-safe | CSRF potential |
| JWT no localStorage | Simples | XSS vulnerável |
| Session cookies | Simples | Server-side state |
| OAuth2/SAML | Padrão industry | Complexo demais |

## Segurança

### Proteção contra XSS
- httpOnly: JavaScript não acessa cookie
- SameSite: Proteção contra CSRF

### Proteção contra CSRF
- SameSite=strict
- Token em header (não em body)

### Proteção contra Replay
- Expiração curta (15 min)
- Renovação automática

## Payload do JWT

```json
{
  "sub": "user-uuid",
  "agency_id": "agency-uuid",
  "role": "ADMIN",
  "email": "user@agency.com",
  "iat": 1706000000,
  "exp": 1706000900
}
```

## Consequências

### Positivas
- Seguro contra XSS
- Multi-tenancy suportado (agency_id)
- Renovação transparente
- Padrão maduro

### Negativas
- JWT não pode ser invalidado (mitigado com expiração curta)
- Cookies em cross-origin (mitigado com CORS)
- Tamanho do cookie (payload pequeno)

## Referências

- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Cookies](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
