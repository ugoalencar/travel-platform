# Segurança — Regras Invioláveis

## Multi-tenant
Toda entidade tenant-scoped deve:
- ter `agency_id`/tenant key;
- validar ownership no app;
- usar transação tenant-scoped;
- falhar fechado;
- ter RLS quando persistida em tabela tenant-scoped.

## RLS
Obrigatório para novas tabelas tenant-scoped:
- ENABLE RLS
- FORCE RLS
- policies específicas
- testes cross-tenant
- runtime DB role sem bypass

Matriz mínima:
Tenant A CRUD permitido quando autorizado.
Tenant B: read/update/delete negados.
Sem tenant context: falha fechado.

## Auth/RBAC
Papel base:
OWNER > ADMIN > MANAGER > AGENT > VIEWER

Frontend só esconde UI; backend é autoridade.

Dev auth:
- `ALLOW_DEV_AUTH=true`
- `NODE_ENV !== production`
- browser nunca seleciona arbitrariamente tenant/role.

## Customer
Sempre self-scoped por agency + customer.

## Partner
Sempre self-scoped por agency + partner/attribution.

## Tokens públicos
Enrollment, assinatura e convites:
- alta entropia;
- expiração;
- revogação;
- rate limit;
- hash no banco quando aplicável;
- não revelar tenant.

## Uploads
- MIME real
- tamanho
- filename seguro
- storage tenant-scoped
- URL assinada/temporária
- sem conteúdo sensível em logs
- nunca confiar só na extensão

## OCR
- resultado é candidato, não verdade;
- nunca sobrescrever automaticamente campo verificado;
- confiança por campo;
- revisão humana;
- auditoria;
- falha do OCR não bloqueia cadastro manual.

## Webhooks
- assinatura/verificação;
- idempotência;
- replay protection;
- tenant resolvido server-side.

## Dados sensíveis
Passaporte, vistos, menores, vacinação e acessibilidade:
- minimização;
- acesso restrito;
- auditoria;
- retenção definida;
- sem payload em exceptions.
