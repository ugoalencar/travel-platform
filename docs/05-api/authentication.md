# Autenticação da API

## JWT

### Estrutura

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

### Configuração

```typescript
// Geração
const token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: '15m',
});

// Verificação
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

## Cookies

```typescript
// Login
reply.setCookie('token', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 900000, // 15 min
  path: '/',
});

// Logout
reply.clearCookie('token', { path: '/' });
```

## Headers

### Request

```
Authorization: Bearer <token>
```

ou

```
Cookie: token=<jwt>
```

### Response

```
Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/
```

## Fluxo de Request

```
1. Client envia request com token
2. Auth middleware valida JWT
3. Decodifica payload (sub, agency_id, role)
4. Adiciona ao request (`request.auth`)
5. Tenant middleware extrai agency_id
6. Handler acessa getAgencyId()
```

## Renovação de Token

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';

// Hook de renovação
async function renewToken(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.token;
  if (!token) return;

  const decoded = jwt.verify(token, JWT_SECRET);
  const timeToExpiry = decoded.exp * 1000 - Date.now();

  // Renovar se faltar menos de 5 minutos
  if (timeToExpiry < 5 * 60 * 1000) {
    const newToken = jwt.sign({
      sub: decoded.sub,
      agency_id: decoded.agency_id,
      role: decoded.role,
      email: decoded.email,
    }, JWT_SECRET, { expiresIn: '15m' });

    reply.setCookie('token', newToken, cookieOptions);
  }

}
```

## Erros Comuns

| Código | Descrição | Ação |
|--------|-----------|------|
| 401 | Token ausente | Fazer login |
| 401 | Token expirado | Fazer login novamente |
| 401 | Token inválido | Fazer login novamente |
| 403 | Sem permissão | Verificar role |
| 403 | Acesso cross-tenant | Verificar agency_id |
