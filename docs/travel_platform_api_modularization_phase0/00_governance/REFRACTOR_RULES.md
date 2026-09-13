# Regras de Refactor

Permitido:
- mover handlers, schemas, validators e route registration;
- criar módulo por domínio;
- criar testes;
- reduzir imports diretos do app.ts.

Proibido:
- alterar URLs;
- alterar contratos HTTP;
- alterar auth/RBAC/RLS/tenant;
- alterar financeiro;
- alterar migrations;
- adicionar features;
- duplicar tenant/RBAC/audit/error/finance helpers.

Parar para humano se a extração exigir qualquer mudança de comportamento.
