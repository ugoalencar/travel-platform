# Pirâmide de Testes

## Visualização

```
         ╱╲
        ╱  ╲        E2E (5%)
       ╱    ╲       Fluxos críticos
      ╱──────╲
     ╱        ╲     Integration (15%)
    ╱          ╲    API, banco, serviços
   ╱────────────╲
  ╱              ╲  Unit (80%)
 ╱                ╲ Lógica de negócio
╱──────────────────╲
```

## Distribuição

| Tipo | Quantidade | Exemplos |
|------|------------|----------|
| **Unit** | 80% | Services, utils, validações |
| **Integration** | 15% | API endpoints, DB queries |
| **E2E** | 5% | Login, venda completa |

## Unit Tests

```typescript
// tests/unit/domain/customer.test.ts
describe('Customer', () => {
  it('deve validar CPF corretamente', () => {
    expect(validateCpf('12345678901')).toBe(true);
    expect(validateCpf('1234567890')).toBe(false);
  });

  it('deve格式化ar telefone', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888');
  });
});
```

## Integration Tests

```typescript
// tests/integration/api/customers.test.ts
describe('Customers API', () => {
  it('deve listar clientes da agência', async () => {
    const response = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it('deve criar cliente com dados válidos', async () => {
    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'João', email: 'joao@email.com' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('João');
  });
});
```

## Security Tests

```typescript
// tests/security/tenant-isolation.test.ts
describe('Tenant Isolation', () => {
  it('User A não acessa dados de User B', () => {
    withTenantContext(agencyA.id, userA.id, () => {
      const customers = customerRepo.findAll();
      expect(customers.every(c => c.agencyId === agencyA.id)).toBe(true);
    });
  });
});
```

## E2E Tests

```typescript
// tests/e2e/flows/sale.spec.ts
test('fluxo completo de venda', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@agency.com');
  await page.fill('[name="password"]', 'senha123');
  await page.click('button[type="submit"]');

  await page.goto('/sales/new');
  await page.selectOption('[name="customer"]', 'João Silva');
  await page.selectOption('[name="trip"]', 'Cancún');
  await page.click('button[type="submit"]');

  await expect(page.locator('.success')).toBeVisible();
});
```

## Boas Práticas

### Sempre

- [ ] Testar comportamento, não implementação
- [ ] Usar describe/it descritivos
- [ ] Arrange-Act-Assert
- [ ] Um assertion por teste (quando possível)
- [ ] Mockar dependências externas

### Nunca

- [ ] Testar bibliotecas externas
- [ ] Depender de ordem de execução
- [ ] Usar dados reais de produção
- [ ] Testar implementação interna
