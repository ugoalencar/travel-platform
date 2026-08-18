# Diretrizes da API

## Formato

### Request

```
POST /api/v1/customers
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "João Silva",
  "email": "joao@email.com"
}
```

### Response

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "João Silva",
    "email": "joao@email.com",
    "createdAt": "2026-01-15T10:30:00Z"
  }
}
```

### List Response

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

## Endpoints

### Auth
| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| POST | `/auth/register` | Registro | ❌ |
| POST | `/auth/login` | Login | ❌ |
| POST | `/auth/logout` | Logout | ✅ |
| POST | `/auth/forgot` | Esqueci senha | ❌ |
| POST | `/auth/reset` | Redefinir senha | ❌ |
| GET | `/auth/me` | Usuário atual | ✅ |

### Core
| Método | Rota | Descrição | Role |
|--------|------|-----------|------|
| GET | `/agencies/me` | Perfil agência | ANY |
| PUT | `/agencies/me` | Atualizar agência | OWNER |
| GET | `/users` | Listar usuários | ADMIN |
| POST | `/users` | Criar usuário | ADMIN |
| PUT | `/users/:id` | Atualizar usuário | ADMIN |
| DELETE | `/users/:id` | Remover usuário | ADMIN |
| GET | `/customers` | Listar clientes | ANY |
| POST | `/customers` | Criar cliente | AGENT+ |
| PUT | `/customers/:id` | Atualizar cliente | AGENT+ |
| DELETE | `/customers/:id` | Remover cliente | MANAGER+ |
| GET | `/brokers` | Listar brokers | MANAGER+ |
| POST | `/brokers` | Criar broker | ADMIN |
| PUT | `/brokers/:id` | Atualizar broker | ADMIN |
| DELETE | `/brokers/:id` | Remover broker | ADMIN |

### Commercial V1
| Método | Rota | Descrição | Role |
|--------|------|-----------|------|
| GET | `/trips` | Listar viagens | ANY |
| POST | `/trips` | Criar viagem | MANAGER+ |
| PUT | `/trips/:id` | Atualizar viagem | MANAGER+ |
| DELETE | `/trips/:id` | Remover viagem | MANAGER+ |
| GET | `/trips/:id/offers` | Listar ofertas | ANY |
| POST | `/trips/:id/offers` | Criar oferta | MANAGER+ |
| PUT | `/offers/:id` | Atualizar oferta | MANAGER+ |
| DELETE | `/offers/:id` | Remover oferta | MANAGER+ |
| GET | `/sales` | Listar vendas | MANAGER+ |
| POST | `/sales` | Registrar venda | AGENT+ |
| PUT | `/sales/:id` | Atualizar venda | MANAGER+ |

Booking is not a V1 API surface. ADR-004 classifies Booking as V1.1.

## Paginação

```
GET /api/v1/customers?page=1&limit=20&search=joão
```

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `page` | 1 | Página atual |
| `limit` | 20 | Itens por página |
| `search` | - | Busca textual |
| `sort` | created_at | Ordenação |
| `order` | desc | ASC ou DESC |

## Validação

### Input
- Usar Zod para validar todos inputs
- Retornar 400 com detalhes do erro

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email" },
    { "field": "name", "message": "Required" }
  ]
}
```

### Headers Obrigatórios

```
Content-Type: application/json
Authorization: Bearer <token>
X-Request-ID: uuid (opcional, para tracking)
```
