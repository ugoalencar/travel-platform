# ADR-002: Multi-tenancy por agency_id

## Status

Aceito

## Contexto

O sistema atende múltiplas agências de viagem. Cada agência opera de forma isolada, sem acesso aos dados de outras agências.

## Decisão

Multi-tenancy via coluna `agency_id` em todas tabelas, com:

1. **Row-Level Security (RLS)** no PostgreSQL
2. **Middleware** que extrai agency_id do JWT
3. **Queries** sempre filtradas por agency_id
4. **Testes** de isolamento

### Regra Fundamental

```
USER → AGENCY → RESOURCE
```

**NUNCA:**
```
USER → RESOURCE
```

## Alternativas Consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| **RLS + agency_id** | Simples, seguro, performático | Coluna extra em todas tabelas |
| Schema por tenant | Isolamento forte | Complexidade alta |
| Database por tenant | Isolamento total | Custos altos |
| Shared database | Simples | Sem isolamento |

## Implementação

### Schema

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL
);
```

### RLS

```sql
CREATE POLICY customer_isolation ON customers
  FOR ALL
  USING (agency_id = current_agency_id());
```

### Middleware

```typescript
const agencyId = getAgencyId(); // Do JWT
const customers = await prisma.customer.findMany({
  where: { agencyId }
});
```

## Consequências

### Positivas
- Isolamento garantido no banco
- Simples de implementar
- Performático (índice em agency_id)
- Fallback seguro (RLS)

### Negativas
- Coluna agency_id em todas tabelas
- Queries sempre precisam de agency_id
- Migrations mais verbosas

## Referências

- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Prisma Multi-tenant](https://www.prisma.io/docs/guides/multi-tenancy)
