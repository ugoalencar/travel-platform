# ADR-009 — Permissões individuais por usuário (SEC-01)

Status: aceito (decisão adotada por padrão, usuário ausente; revisar quando houver decisão humana).
Data: 2026-10-24. Contrato: `.claude/DESENHO-SEC01-BAK01-DASH01-2026-10-24.md` (Parte 1).

## Contexto

O Full só estreitava permissões por **papel** (`permission_restrictions`) e tinha uma concessão individual
estreita (`agent_area_grants`, 12 módulos de leitura). O Lite já tinha GRANT/REVOKE por usuário. Faltava
uma decisão única, testada e auditada, sem enfraquecer RBAC/RLS.

## Decisão

- Precedência: **restrição (por papel ou REVOKE do usuário) > concessão (GRANT) > papel**.
- `OWNER` e `ADMIN` nunca são restringidos nem recebem overrides (sem bloqueio do próprio tenant); ainda
  precisam do piso de papel da rota.
- Catálogo fechado em código (`services/api/src/permissions/permission-catalog.ts`). Chave fora do catálogo é
  rejeitada na escrita e negada na leitura (falha fechada). Só **leituras** são delegáveis (GRANT), só a
  usuários `AGENT`; `customers:fields_manage` e `catalog:manage` (Q4 do ADR-008) são só de administrador e
  **não delegáveis**.
- Tabela `user_permission_overrides` (migration 103): RLS forçada, FK composta `(agency_id, user_id)`,
  `UNIQUE` por chave (GRANT e REVOKE não coexistem), sem política de UPDATE, trigger impede override em
  OWNER/ADMIN.
- Anti-escalada: só `ADMIN`/`OWNER` editam; nunca o próprio usuário; o ator só concede o que ele mesmo pode;
  alvo precisa ser da mesma agência e ativo (senão 404); substituição atômica com `FOR UPDATE`.
- Auditoria obrigatória (`USER_PERMISSION_OVERRIDES_CHANGED`, falha derruba a alteração), uma por mudança real.
- Aplicação: `requireRoleOrAreaGrant` (rotas financeiras) consulta o resolvedor primeiro; o legado
  `agent_area_grants` continua valendo, mas uma restrição ou REVOKE o vence. Rotas ainda não inventariadas
  mantêm o piso de papel (nunca "abertas por padrão").

## Consequências / limites

- A restrição só é uma garantia geral nas rotas que chamam o resolvedor; o inventário completo de rotas ×
  chave do catálogo é trabalho futuro (a lacuna do `assertNotRestricted` em 4 rotas persiste).
- Erros de validação saem como 400 (não 422) para não alterar `errors.ts` em uso por outra frente.
- Lite: vocabulário diferente (`finance.read` etc.); o campo `liteKey` do catálogo é a ponte para a migração.
