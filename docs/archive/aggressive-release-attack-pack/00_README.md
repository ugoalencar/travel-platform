# Travel Platform — Aggressive Release Attack Pack

Objetivo: eliminar áreas completas em paralelo, integrar apenas streams verdes e deixar as auditorias pesadas para o fim de cada onda.

Baseline conhecida: `5e7916e9db1799391854e21db60569adaccd8d99`.

Antes de começar, cada agente deve executar `git fetch origin` e confirmar a `origin/main` real.

## Distribuição recomendada

Dispare imediatamente:

1. `01_COORDINATOR.md`
2. `02_PRODUCT_CORE_A.md`
3. `03_PRODUCT_CORE_B.md`
4. `04_PRODUCT_CORE_C_OPS.md`
5. `05_CUSTOMER_PORTAL_TRANSPORT.md`
6. `06_SECURITY_AUTH_CAPTCHA_MFA.md`
7. `07_PRODUCTION_OPS_DB.md`

Depois, quando esses streams estiverem verdes:

8. `08_PRODUCT_INTEGRATOR.md`
9. `09_SECURITY_PROD_INTEGRATOR.md`
10. `10_FINAL_RC_AND_AUDITS.md`
11. `11_STAGING_UAT_GOLIVE.md`

## Regras globais

- branch/worktree dedicado por agente
- nunca trabalhar diretamente em `main`
- nunca `git add .` ou `git add -A`
- sem force push
- sem `--no-verify`
- sem rebase de branch compartilhada
- sem merge em `main`
- SQL migrations são autoritativas; Prisma é derivado
- preservar AuthProvider, TenantContext, RBAC, RLS/FORCE RLS, customer self-scope, SEC-B, SEC-E, SEC-F e SEC-H
- todo stream termina com lint, typecheck, testes relevantes, build, P0/P1 e HEAD exato
- P0/P1 bloqueiam integração
