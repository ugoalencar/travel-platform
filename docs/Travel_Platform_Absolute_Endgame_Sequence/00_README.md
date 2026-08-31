# Travel Platform — Sequência Final Absoluta

Execute na ordem:

1. `01_ABSOLUTE_FINAL_RELEASE_LOCK.md`
2. `02_PRODUCTION_DEPLOY_AND_GO_LIVE.md`
3. `03_POST_GO_LIVE_STABILIZATION.md`
4. `04_FINAL_HANDOFF_AND_CLOSEOUT.md`

Autonomia máxima para problemas técnicos, reversíveis e locais. Pare somente por credenciais/infraestrutura externa ausentes, ação destrutiva/irreversível em produção, mudança estrutural de Auth/Tenant/RLS/RBAC ou decisão de produto irreversível.

Não aceitar P0/P1 no release lock, CI de SHA antigo, deploy sem smoke ou tag apontando para SHA diferente do validado.
