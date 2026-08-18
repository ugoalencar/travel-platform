# Autenticação

## Fluxo

```
1. Usuário insere email + senha
2. Backend valida credenciais
3. Backend gera JWT com:
   - user_id
   - agency_id
   - role
   - exp (15 min)
4. JWT enviado via httpOnly cookie
5. Cookie renovado a cada request
6. Logout: cookie removido
```

## JWT Payload

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

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Registro de agência |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/forgot` | Esqueci senha |
| POST | `/auth/reset` | Redefinir senha |
| GET | `/auth/me` | Usuário atual |

## Segurança

### Senhas

```typescript
// Hash com argon2
import { hash, verify } from 'argon2';

const hashedPassword = await hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
});

const isValid = await verify(hashedPassword, password);
```

### Cookies

```typescript
// Configuração do cookie
reply.setCookie('token', jwt, {
  httpOnly: true,    // Não acessível via JavaScript
  secure: true,      // Apenas HTTPS
  sameSite: 'strict',// Proteção CSRF
  maxAge: 900000,    // 15 minutos
  path: '/',
});
```

### Rate Limiting

```typescript
// Limite de tentativas
const limiter = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,                     // 5 tentativas
  message: 'Muitas tentativas',
};
```

## Registro de Agência

```typescript
// POST /auth/register
{
  "agencyName": "Viagens Brasil",
  "cnpj": "12345678000195",
  "ownerName": "João Silva",
  "email": "joao@viagensbrasil.com",
  "password": "senha123"
}

// Resposta
{
  "agency": { "id": "...", "name": "Viagens Brasil" },
  "user": { "id": "...", "email": "joao@viagensbrasil.com" },
  "token": "jwt..."
}
```

## Login

```typescript
// POST /auth/login
{
  "email": "joao@viagensbrasil.com",
  "password": "senha123"
}

// Resposta
{
  "user": { "id": "...", "email": "...", "role": "OWNER" },
  "agency": { "id": "...", "name": "Viagens Brasil" }
}
```

## Forgot Password

```typescript
// POST /auth/forgot
{ "email": "joao@viagensbrasil.com" }

// Resposta (sempre a mesma, por segurança)
{ "message": "Se o email existir, você receberá um link" }

// Email enviado com link:
// https://app.com/auth/reset?token=abc123
```
