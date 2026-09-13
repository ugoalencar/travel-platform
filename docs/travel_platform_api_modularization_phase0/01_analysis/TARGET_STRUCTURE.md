# Estrutura alvo

```text
services/api/src/
  app.ts
  core/
    auth/
    tenant/
    authorization/
    audit/
    observability/
    errors/
    rate-limit/
    feature-flags/
    security/
  modules/
    settings/
    support/
    assets/
    engagements/
    entitlements/
    campaigns/
    publications/
    coupons/
    automations/
    pescador/
    transport/
    operations/
    customers/
    wishes/
    offers/
    proposals/
    trips/
    commercial/
    sales/
    finance/
    employees/
    commissions/
    reports/
    platform/
```

Objetivo: buildApp() vira orchestrator e conhece módulos, não seus detalhes internos.
