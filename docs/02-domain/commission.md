# Commission (Comissão)

## Definição

Commission é o cálculo automático da comissão de um broker sobre uma venda.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `saleId` | UUID | Sim | Venda vinculada |
| `brokerId` | UUID | Sim | Broker vinculado |
| `amount` | Decimal | Sim | Valor da comissão |
| `percentage` | Decimal | Sim | Percentual aplicado |
| `status` | Enum | Sim | PENDING, PAID, CANCELLED |
| `paidAt` | DateTime | Não | Data do pagamento |

## Regras de Negócio

1. **Cálculo:** `comissão = venda.total * broker.commission / 100`
2. ** brokers opcionais:** Nem toda venda tem broker
3. **Pagamento:** Status muda para PAID quando broker é pago
4. **Relatório:** Agência pode ver total de comissões por período

## Cálculo Automático

Quando uma venda é registrada com broker:

```typescript
function calculateCommission(sale: Sale, broker: Broker): Commission {
  const amount = sale.total * (broker.commission / 100);

  return {
    saleId: sale.id,
    brokerId: broker.id,
    amount,
    percentage: broker.commission,
    status: 'PENDING',
  };
}
```

## Exemplo

```json
{
  "saleId": "bb0e8400-e29b-41d4-a716-446655440006",
  "brokerId": "770e8400-e29b-41d4-a716-446655440002",
  "amount": 450.00,
  "percentage": 10.00,
  "status": "PENDING",
  "paidAt": null
}
```

## Relatórios

### Vendas por Broker

```sql
SELECT
  b.name,
  COUNT(s.id) as total_vendas,
  SUM(s.total) as valor_total,
  SUM(s.total * b.commission / 100) as comissao_total
FROM sales s
JOIN brokers b ON s.broker_id = b.id
WHERE s.agency_id = $1
AND s.status = 'PAID'
GROUP BY b.id, b.name
```

### Comissões Pendentes

```sql
SELECT
  b.name,
  COUNT(s.id) as vendas_pendentes,
  SUM(s.total * b.commission / 100) as comissao_pendente
FROM sales s
JOIN brokers b ON s.broker_id = b.id
WHERE s.agency_id = $1
AND s.status = 'CONFIRMED'
AND s.broker_id IS NOT NULL
GROUP BY b.id, b.name
```
