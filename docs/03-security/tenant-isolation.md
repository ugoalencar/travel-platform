# Tenant Isolation

## Regra Fundamental

```
USER → AGENCY → RESOURCE
```

**NUNCA:**
```
USER → RESOURCE
```

## Como Funciona

### 1. Schema

Todas tabelas possuem `agency_id`:

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL,
  -- ...
);
```

### 2. Row-Level Security (RLS)

```sql
-- Habilitar RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Policy de isolamento
CREATE POLICY customer_isolation ON customers
  FOR ALL
  USING (agency_id = current_agency_id());
```

### 3. Middleware

```typescript
// Extrai agency_id do JWT
const agencyId = getAgencyId();

// Usa em todas queries
const customers = await prisma.customer.findMany({
  where: { agencyId }
});
```

### 4. Validação

```typescript
// Valida que recurso pertence à agência
validateResourceOwnership(customer.agencyId, 'Customer');
```

## Camadas de Proteção

| Camada | Proteção |
|--------|----------|
| **Frontend** | Não exibe dados de outras agências |
| **API** | Middleware valida agency_id |
| **Domain** | Regras de negócio verificam ownership |
| **Database** | RLS filtra automaticamente |
| **Audit** | Logs incluem agency_id |

## Padrões Proibidos

```typescript
// ❌ PROIBIDO: Query sem agency_id
const customers = await prisma.customer.findMany();

// ❌ PROIBIDO: Confiar em agency_id do frontend
const { agencyId } = request.body;

// ❌ PROIBIDO: Acesso cross-tenant
const customer = await prisma.customer.findFirst({
  where: { id: customerId }
});

// ❌ PROIBIDO: Query raw sem agency_id
await prisma.$queryRaw`SELECT * FROM customers`;
```

## Padrões Permitidos

```typescript
// ✅ CORRETO: Query com agency_id
const customers = await prisma.customer.findMany({
  where: { agencyId: getAgencyId() }
});

// ✅ CORRETO: agency_id do contexto
const agencyId = getAgencyId();

// ✅ CORRETO: Validação de ownership
if (customer.agencyId !== getAgencyId()) {
  throw new ForbiddenError('Access denied');
}

// ✅ CORRETO: Query raw com agency_id
await prisma.$queryRaw`
  SELECT * FROM customers
  WHERE agency_id = ${getAgencyId()}
`;
```

## Testes de Isolamento

```typescript
describe('Tenant Isolation', () => {
  it('User A não acessa dados de User B', () => {
    withTenantContext(agencyA.id, userA.id, () => {
      const customers = customerRepo.findAll();
      // Só deve retornar clientes da agência A
      expect(customers.every(c => c.agencyId === agencyA.id)).toBe(true);
    });
  });

  it('Admin não escala privileges entre tenants', () => {
    withTenantContext(agencyA.id, userA.id, () => {
      const agencyId = getAgencyId();
      // Mesmo admin, só acessa sua agência
      expect(agencyId).toBe(agencyA.id);
    });
  });
});
```

## Verificação

- [ ] Todas tabelas têm `agency_id`
- [ ] RLS habilitado em todas tabelas
- [ ] Policy de isolamento criada
- [ ] Middleware validando em cada request
- [ ] Queries sempre incluem agency_id
- [ ] Testes de isolamento passando
