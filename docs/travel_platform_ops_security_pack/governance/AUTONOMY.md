# Autonomia e Aprovação

## Automático
Mudanças reversíveis, testáveis e não destrutivas:
- testes de segurança
- scanners
- logs/metrics
- health checks
- queries parametrizadas
- whitelists
- headers seguros
- docs/runbooks
- feature flags
- backup/restore em ambiente não produtivo

## Exige humano
- Auth/Tenant/RLS/RBAC estrutural
- segredo/provider externo
- produção/DNS
- alteração destrutiva
- retenção de dados
- HSTS preload
- SLA/RPO/RTO definitivo

## Git
- worktree/branch isolado
- sem merge em main por feature agent
- nunca `git add .` ou `git add -A`
- nunca enfraquecer segurança para passar teste
