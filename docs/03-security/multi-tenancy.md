# Multi-Tenancy Architecture

## Regra Fundamental

```
USER → AGENCY → RESOURCE
```

**NUNCA:**
```
USER → RESOURCE
```

O agente não pode simplesmente fazer:
```sql
SELECT * FROM customers;  -- PROIBIDO
```

**Sempre:**
```sql
SELECT * FROM customers WHERE agency_id = $1;  -- CORRETO
```

---

## Estrutura de Arquivos

```
packages/
├── database/
│   └── schema.prisma           # Schema com agency_id em todas tabelas
├── domain/
│   ├── types.ts                # Tipos TypeScript
│   ├── tenant-context.ts       # Middleware de tenant
│   └── tenant-scoped-queries.ts # Helpers de queries
infrastructure/
└── migrations/
    └── 002_rls_policies.sql    # Row-Level Security
tests/
└── security/
    └── tenant-isolation.test.ts # Testes de isolamento
```

---

## Como Funciona

### 1. Schema (schema.prisma)

Todas tabelas possuem `agency_id`:

```prisma
model Customer {
  id        String   @id @default(uuid())
  agencyId  String   @map("agency_id")  // <-- OBRIGATÓRIO
  name      String
  email     String?
  // ...
}
```

### 2. Row-Level Security (RLS)

PostgreSQL força isolamento no nível do banco:

```sql
-- Função para obter agency_id da sessão
CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_agency_id', TRUE), '')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Policy que filtra por agency_id
CREATE POLICY customer_isolation ON customers
  FOR ALL
  USING (agency_id = current_agency_id());
```

### 3. Middleware (tenant-context.ts)

Extrai agency_id do JWT e valida acesso:

```typescript
// Obtém agency_id de qualquer lugar na request
const agencyId = getAgencyId();

// Valida que recurso pertence à agência
validateResourceOwnership(customer.agencyId, 'Customer');
```

### 4. Queries (tenant-scoped-queries.ts)

Todas queries são automaticamente filtradas:

```typescript
// agency_id é aplicado automaticamente
const customers = await customerRepository.findAll();

// agency_id é definido automaticamente ao criar
const newCustomer = await customerRepository.create({
  name: 'João',
  email: 'joao@email.com',
});
```

---

## Fluxo de Segurança

```
1. User faz login → JWT com agency_id
                    ↓
2. Request chega → Middleware extrai agency_id
                    ↓
3. Valida user pertence à agency (SELECT user WHERE id=? AND agency_id=?)
                    ↓
4. Executa query com agency_id no WHERE
                    ↓
5. RLS no banco garante isolamento (fail-safe)
                    ↓
6. Retorna apenas dados da agency do user
```

---

## Padrões Proibidos

```typescript
// ❌ PROIBIDO: Query sem agency_id
const customers = await prisma.customer.findMany();

// ❌ PROIBIDO: Confiar em agency_id do frontend
const { agencyId } = request.body; // NUNCA fazer isso

// ❌ PROIBIDO: Acesso cross-tenant
const customer = await prisma.customer.findFirst({
  where: { id: customerId } // Sem agency_id!
});

// ❌ PROIBIDO: Admin acessando outra agency
if (user.role === 'OWNER') {
  // Pode acessar tudo? NÃO! Apenas sua agency.
}
```

---

## Padrões Permitidos

```typescript
// ✅ CORRETO: Query com agency_id
const customers = await prisma.customer.findMany({
  where: { agencyId: getAgencyId() }
});

// ✅ CORRETO: agency_id do contexto (nunca do frontend)
const agencyId = getAgencyId(); // Do JWT/session

// ✅ CORRETO: Validação de ownership
const customer = await customerRepo.findById(id);
if (customer.agencyId !== getAgencyId()) {
  throw new ForbiddenError('Access denied');
}

// ✅ CORRETO: Validação de acesso
const hasAccess = await validateUserAgencyAccess(userId, agencyId);
```

---

## Testes de Isolamento

Execute os testes para verificar isolamento:

```bash
npm run test
```

Testes verificam:
- User A não acessa dados de User B
- Admin não escala privileges entre tenants
- Queries sempre incluem agency_id
- Resource ownership é validado

---

## Verificação Rápida

Antes de commitar, pergunte:

1. A query tem `agency_id` no WHERE?
2. O `agency_id` vem do contexto (não do frontend)?
3. O recurso pertence à agency do user?
4. O teste de isolamento passa?

Se qualquer resposta for NÃO, não commite.
