# Observabilidade

## Pilares

1. **Logs** - O que aconteceu
2. **Métricas** - O que está acontecendo
3. **Traces** - Onde aconteceu

## Logs

### Formato

```json
{
  "timestamp": "2026-01-15T10:30:00Z",
  "level": "info",
  "message": "Customer created",
  "context": {
    "agencyId": "agency-uuid",
    "userId": "user-uuid",
    "customerId": "customer-uuid"
  }
}
```

### Níveis

| Nível | Uso |
|-------|-----|
| `error` | Erros que precisam de atenção |
| `warn` | Avisos potencialmente problemáticos |
| `info` | Informações normais de operação |
| `debug` | Detalhes para debug |

### O que Logar

| Evento | Nível | Dados |
|--------|-------|-------|
| Login | info | userId, agencyId |
| Erro de autenticação | warn | email, IP |
| Erro interno | error | stack trace |
| Venda criada | info | saleId, agencyId |
| Acesso cross-tenant | error | userId, agencyId, resource |

### O que NÃO Logar

- Senhas
- Tokens
- Dados sensíveis (CPF, cartão)
- Query parameters sensíveis

## Métricas

### Aplicação

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `http_requests_total` | Counter | Total de requests |
| `http_request_duration` | Histogram | Latência |
| `http_errors_total` | Counter | Erros por tipo |
| `active_users` | Gauge | Usuários ativos |
| `db_query_duration` | Histogram | Queries lentas |

### Infraestrutura

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `cpu_usage` | Gauge | Uso de CPU |
| `memory_usage` | Gauge | Uso de memória |
| `disk_usage` | Gauge | Uso de disco |
| `db_connections` | Gauge | Conexões ativas |

### Business

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `sales_total` | Counter | Vendas totais |
| `sales_value` | Counter | Valor total vendido |
| `new_customers` | Counter | Novos clientes |
| `active_agencies` | Counter | Agências ativas |

## Traces

```typescript
// OpenTelemetry
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('travel-platform');

async function createCustomer(data) {
  return tracer.startActiveSpan('createCustomer', async (span) => {
    try {
      span.setAttribute('agencyId', getAgencyId());
      const result = await prisma.customer.create({ data });
      span.setAttribute('customerId', result.id);
      return result;
    } catch (error) {
      span.setAttribute('error', true);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## Alertas

| Condição | Severidade | Ação |
|----------|------------|------|
| Error rate > 5% | P1 | Investigar imediatamente |
| Latência p99 > 2s | P2 | Investigar em 1h |
| CPU > 80% | P2 | Verificar carga |
| Disk > 80% | P3 | Expandir ou limpar |
| DB connections > 80% | P2 | Verificar pool |

## Dashboards

### Operacional

- Requests por minuto
- Taxa de erro
- Latência (p50, p95, p99)
- Uptime

### Business

- Vendas por dia
- Novos clientes
- Agências ativas
- Receita

## Checklist

- [ ] Logs estruturados
- [ ] Métricas de aplicação
- [ ] Métricas de infraestrutura
- [ ] Traces em pontos críticos
- [ ] Alertas configurados
- [ ] Dashboards criados
