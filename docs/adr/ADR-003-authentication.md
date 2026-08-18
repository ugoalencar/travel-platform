# ADR-003: Autenticação JWT + cookies httpOnly

## Status

Aceito

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
