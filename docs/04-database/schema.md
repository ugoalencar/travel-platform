# Schema do Banco de Dados

## Visão Geral

PostgreSQL com Prisma ORM, multi-tenant via `agency_id`.

## Tabelas

```
agencies (1) ──── (N) users
agencies (1) ──── (N) brokers
agencies (1) ──── (N) customers
agencies (1) ──── (N) trips
trips    (1) ──── (N) offers
trips    (1) ──── (N) sales
customers(1) ──── (N) sales
brokers  (1) ──── (N) sales
users    (1) ──── (N) sales
```

## Schema Prisma

Ver `packages/database/schema.prisma`

## Colunas Obrigatórias

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Chave primária |
| `agency_id` | UUID | Tenant (isolamento) |
| `created_at` | Timestamp | Data de criação |
| `updated_at` | Timestamp | Última atualização |

## Índices

| Tabela | Índice | Colunas |
|--------|--------|---------|
| users | `agency_email` | agency_id, email (único) |
| customers | `agency_cpf` | agency_id, cpf (único) |
| customers | `agency_email` | agency_id, email (único) |
| trips | `agency_destination` | agency_id, destination |
| trips | `agency_start_date` | agency_id, start_date |
| sales | `agency_created` | agency_id, created_at |

## RLS (Row-Level Security)

Todas tabelas têm RLS habilitado com policy de isolamento.

Ver `infrastructure/migrations/002_rls_policies.sql`

## Tipos Enum

| Enum | Valores |
|------|---------|
| Plan | FREE, BASIC, PRO, ENTERPRISE |
| Status | ACTIVE, INACTIVE, SUSPENDED |
| UserRole | OWNER, ADMIN, MANAGER, AGENT, VIEWER |
| TripStatus | ACTIVE, INACTIVE, SOLD_OUT, CANCELLED |
| OfferStatus | ACTIVE, INACTIVE, EXPIRED |
| SaleStatus | PENDING, CONFIRMED, PAID, CANCELLED, REFUNDED |
