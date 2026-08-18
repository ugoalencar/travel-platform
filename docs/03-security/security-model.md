# Modelo de Segurança

## Princípios

1. **Defense in Depth** - Múltiplas camadas de proteção
2. **Least Privilege** - Apenas o necessário
3. **Never Trust User Input** - Validar sempre
4. **Fail Secure** - Em caso de dúvida, bloquear

## Camadas de Segurança

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FRONTEND                                                 │
│    - Validação de input                                     │
│    - Sanitização de output                                  │
│    - CSP headers                                            │
├─────────────────────────────────────────────────────────────┤
│ 2. API GATEWAY                                              │
│    - Rate limiting                                          │
│    - CORS                                                   │
│    - Request size limits                                    │
├─────────────────────────────────────────────────────────────┤
│ 3. AUTH MIDDLEWARE                                          │
│    - JWT validation                                         │
│    - Session verification                                  │
│    - Token expiration                                       │
├─────────────────────────────────────────────────────────────┤
│ 4. TENANT MIDDLEWARE                                        │
│    - Agency isolation                                       │
│    - Resource ownership                                     │
│    - Role validation                                        │
├─────────────────────────────────────────────────────────────┤
│ 5. DOMAIN LAYER                                             │
│    - Business rules validation                              │
│    - Input sanitization                                     │
│    - Data encryption                                        │
├─────────────────────────────────────────────────────────────┤
│ 6. DATABASE                                                 │
│    - Row-Level Security (RLS)                               │
│    - Parameterized queries                                  │
│    - Encrypted connections                                  │
├─────────────────────────────────────────────────────────────┤
│ 7. INFRASTRUCTURE                                           │
│    - HTTPS everywhere                                       │
│    - Network isolation                                      │
│    - Secrets management                                     │
└─────────────────────────────────────────────────────────────┘
```

## Ameaças

| Ameaça | Mitigação |
|--------|-----------|
| SQL Injection | ORM + parameterized queries |
| XSS | CSP + sanitization |
| CSRF | SameSite cookies + CSRF token |
| Brute Force | Rate limiting + account lockout |
| Session Hijacking | httpOnly + secure cookies |
| Privilege Escalation | RBAC + tenant isolation |
| Data Leakage | RLS + field-level permissions |
| Insecure Direct Object Reference | Tenant scoping on every query |

## Padrões Obrigatórios

### 1. Multi-Tenant Isolation

```typescript
// NUNCA
const customers = await prisma.customer.findMany();

// SEMPRE
const customers = await prisma.customer.findMany({
  where: { agencyId: getAgencyId() }
});
```

### 2. Input Validation

```typescript
// NUNCA
const { name } = request.body;

// SEMPRE
const schema = z.object({ name: z.string().min(2) });
const { name } = schema.parse(request.body);
```

### 3. Error Handling

```typescript
// NUNCA
catch (error) {
  reply.code(500).send({ error: error.message });
}

// SEMPRE
catch (error) {
  logger.error(error);
  reply.code(500).send({ error: 'Internal server error' });
}
```

## Checklist de Segurança

- [ ] Todos inputs validados com Zod
- [ ] Todas queries com agency_id
- [ ] RLS habilitado em todas tabelas
- [ ] JWT com expiração curta
- [ ] Cookies httpOnly + secure
- [ ] Rate limiting ativo
- [ ] Logs de auditoria
- [ ] Senhas com bcrypt/argon2
- [ ] HTTPS em produção
- [ ] Secrets em variáveis de ambiente
