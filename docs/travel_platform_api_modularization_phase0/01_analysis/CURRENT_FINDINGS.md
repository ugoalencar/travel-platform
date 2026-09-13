# Achados atuais

Cross-domain coupling conhecido:
- commissions.ts -> financial.ts
- automations.ts -> engagements.ts
- automations.ts -> coupons.ts
- commercial-cockpit.ts -> commercial-queries.ts
- commercial-cockpit.ts -> pipeline-config.ts

Interpretação:
o acoplamento de domínio é baixo e o principal problema está em composition/route registration.

Security core permanece centralizado:
Auth, tenant context, RBAC, RLS, audit, rate limiting, MFA, CAPTCHA, SSRF guard, feature flags, errors, observability.
