# Atualização do SaaS

## Pipeline
Development → CI → Staging → Migration Validation → Security Gates → Human UAT → Canary → Production → Monitoring.

## Feature flags
Exemplos:
- OCR_DOCUMENTS
- DIGITAL_SIGNATURES
- PARTNER_PORTAL
- UPSELL_ENGINE
- INSURANCE
- MARKETING_AUTOMATIONS

Flag não substitui autorização.

## Versão
Registrar:
- appVersion
- buildSha
- migrationVersion
- deploymentId
- releasedAt

## Rollback
1. feature flag OFF
2. rollback app
3. banco permanece compatível
4. incidente se necessário
