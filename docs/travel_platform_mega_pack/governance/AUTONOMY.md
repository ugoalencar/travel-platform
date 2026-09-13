# Regras de Autonomia e Aprovação

## Aprovação automática
O agente pode executar sem parar quando:
- mudança reversível;
- sem alterar Auth/RBAC/RLS/Tenant;
- sem alterar fórmula financeira autoritativa;
- sem reescrever migration aplicada;
- sem destruir dados;
- sem exigir segredo/conta externa;
- existe teste objetivo;
- mudança é UI, validação, API compatível, teste, documentação ou nova feature isolada.

## Aprovação humana obrigatória
Parar somente se houver:
1. mudança estrutural de Auth;
2. mudança de Tenant model;
3. mudança de RLS;
4. mudança de RBAC base;
5. mudança de cálculo financeiro oficial;
6. alteração destrutiva de schema/dados;
7. escolha de provider pago/externo;
8. necessidade de segredo;
9. ativação de produção;
10. decisão jurídica sobre contratos/assinaturas/LGPD;
11. política de retenção de documentos sensíveis;
12. nova superfície pública de alto risco;
13. browser podendo escolher tenant/role.

## Trabalho
- usar worktree isolado;
- branch por domínio;
- agentes de feature NÃO fazem merge em main;
- sem micro-checkpoints;
- corrigir P0/P1 encontrados no próprio escopo;
- P2/P3 documentar, salvo correção trivial e segura.

## Git
Proibido:
- git add .
- git add -A
- force push
- --no-verify
- reset/rebase destrutivo sem autorização
- commitar secrets
- commitar overrides locais acidentais
