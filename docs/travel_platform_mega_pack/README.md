# Travel Platform — Mega Implementation Pack

Objetivo: evoluir o sistema para um SaaS totalmente administrável cobrindo:
- SaaS Administration & Tenant Self-Service
- Client Self-Onboarding por link
- Contratos e assinatura eletrônica
- Parceiros externos / afiliados
- Traveler 360 internacional
- Requisitos de viagem
- OCR documental opcional
- Catálogo de produtos/experiências
- Seguro viagem
- "Turbine sua Viagem" / upsell / cross-sell
- Sale Items
- Campanhas/anúncios de parceiros
- Portal do Cliente e Portal do Parceiro
- Segurança, RLS, RBAC, auditoria e proteção multi-tenant

Baseline documentado: `main@382f8f2`, mas TODO agente deve confirmar o HEAD atual antes de trabalhar.

Regra máxima: autonomia alta na implementação, tolerância zero para regressão de segurança, tenant isolation, RLS, RBAC e cálculos financeiros.

Leia primeiro:
1. governance/AUTONOMY.md
2. security/NON_NEGOTIABLES.md
3. architecture/TARGET.md
4. agents/ORCHESTRATOR.md
