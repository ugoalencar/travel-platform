# Ambientes

## Local
HTTP permitido, dev-auth dual gate, secrets fora do git.

## Staging
HTTPS, dados sintéticos, providers sandbox, logs/metrics/tracing.

## Production
HTTPS, dev-auth impossível, secret manager, rate limit distribuído, backups, strict CORS, CSP/HSTS.
