# Arquitetura do Sistema

## Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Agency App     │  Broker App     │  Customer App           │
│  (React)        │  (React)        │  (React)                │
└────────┬────────┴────────┬────────┴────────────┬────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                            │
│              (Rate Limiting, Auth, Routing)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Auth        │ │  Tenant      │ │  API         │
│  Service     │ │  Service     │ │  Service     │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOMAIN LAYER                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Agency  │ │ Customer│ │  Trip   │ │  Sale   │  ...     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE LAYER                            │
│              PostgreSQL + Row-Level Security                 │
│              (Isolamento por agency_id)                      │
└─────────────────────────────────────────────────────────────┘
```

## Princípios Arquiteturais

### 1. Multi-Tenant por Design

```
USER → AGENCY → RESOURCE
```

- Cada agência é um tenant isolado
- `agency_id` em todas tabelas
- RLS no PostgreSQL
- Middleware valida em cada request

### 2. Separação de Responsabilidades

| Camada | Responsabilidade |
|--------|------------------|
| **Presentation** | UI, rotas, formulários |
| **API** | HTTP, validação, serialização |
| **Domain** | Regras de negócio, entidades |
| **Infrastructure** | Banco, cache, file system |

### 3. Fail-Safe

- RLS no banco é a última linha de defesa
- Se o middleware falhar, RLS ainda protege
- Nunca confiar em dados do frontend

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + TypeScript + Fastify |
| ORM | Prisma |
| Database | PostgreSQL 15 |
| Cache | Redis |
| Auth | JWT + httpOnly cookies |
| Infra | Docker + docker-compose |
| CI/CD | GitHub Actions |

## Monorepo

```
travel-platform/
├── apps/
│   ├── agency/          # Portal da agência
│   ├── broker/          # Portal do broker
│   └── customer/        # Portal do cliente
├── packages/
│   ├── database/        # Schema, migrations
│   ├── domain/          # Tipos, regras de negócio
│   ├── shared/          # Utils, helpers
│   ├── config/          # Configurações
│   └── validation/      # Schemas de validação
├── services/
│   └── api/             # Backend API
├── infrastructure/
│   ├── docker/
│   ├── terraform/
│   └── migrations/
└── tests/
    ├── e2e/
    ├── integration/
    └── security/
```

## Fluxo de Request

```
1. Client → HTTP Request
2. API Gateway → Rate Limit + CORS
3. Auth Middleware → Valida JWT
4. Tenant Middleware → Extrai agency_id
5. Route Handler → Valida input
6. Domain Service → Regras de negócio
7. Repository → Query com agency_id
8. Database → RLS filtra automaticamente
9. Response → Serializa e retorna
```
