# Travel Platform — Staging, UAT & Go-Live Pack

Objetivo: levar a plataforma do estado local funcional para staging real, executar E2E/UAT e emitir GO/NO-GO para produção.

Regras:
- sem novas features nesta fase;
- SQL migrations continuam authoritative;
- sem secrets no Git;
- staging usa dados sintéticos;
- produção só após aprovação humana explícita.

GO exige:
P0=0, P1=0, critical E2E PASS, UAT PASS, RLS PASS, cross-tenant PASS, HTTPS PASS, backup/restore PASS e rollback conhecido.
