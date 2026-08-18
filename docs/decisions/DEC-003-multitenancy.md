# DEC-003: Multi-Tenancy

**Data:** 2026-01-15
**Status:** Aceito
**Decisor:** Tech Lead + Architect

---

## Contexto

O sistema atende múltiplas agências de viagem. Cada agência opera de forma isolada, sem acesso aos dados de outras agências.

## Decisão

Multi-tenancy via **coluna `agency_id` em todas tabelas**, com:

1. **Row-Level Security (RLS)** no PostgreSQL
2. **Middleware** que extrai agency_id do JWT
3. **Queries** sempre filtradas por agency_id
4. **Testes** de isolamento obrigatórios

### Regra Fundamental

```
USER → AGENCY → RESOURCE
```

**NUNCA:**
```
USER → RESOURCE
```

## Alternativas Consideradas

| Estratégia | Isolamento | Complexidade | Performance | Decisão |
|------------|------------|--------------|-------------|---------|
| **RLS + agency_id** | Forte | Baixa | Alta | ✅ |
| Schema por tenant | Forte | Alta | Média | ❌ |
| Database por tenant | Forte | Muito alta | Baixa | ❌ |
| Shared (sem RLS) | Fraco | Baixa | Alta | ❌ |

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
```

### Query

```typescript
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

## Verificação

- [ ] Todas tabelas têm agency_id
- [ ] RLS habilitado
- [ ] Policies criadas
- [ ] Middleware funcionando
- [ ] Testes de isolamento passando

## Referências

- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/03-security/tenant-isolation.md`
