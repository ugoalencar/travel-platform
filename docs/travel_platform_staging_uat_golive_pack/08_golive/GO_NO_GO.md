# GO / NO-GO

GO somente se:
- baseline conhecido
- staging estável
- P0=0
- P1=0
- E2E crítico PASS
- UAT PASS
- RLS PASS
- cross-tenant PASS
- HTTPS PASS
- backup/restore PASS
- observability PASS
- rollback pronto

NO-GO para qualquer leak cross-tenant, auth bypass, RLS failure, erro financeiro crítico, migration inconsistente ou backup não restaurável.
