# Observabilidade

## Logs estruturados
Campos:
requestId, correlationId, tenantId, userId, route, method, status, duration, errorCode, deploymentId.

Nunca logar:
senha, token, documento integral, passaporte completo, CPF completo, dados bancários sensíveis.

## Métricas
requests/min, p50/p95/p99, 4xx, 5xx, DB connections, queue depth, OCR/signature failures, storage errors.

## Tracing
Browser → API → DB → provider externo.
Correlation ID deve acompanhar a cadeia.
