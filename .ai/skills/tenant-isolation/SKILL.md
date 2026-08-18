# Tenant Isolation Skill

## Descrição
Skill crítica para garantir isolamento de dados entre agências (tenants).

## Quando usar
- Implementar query com multi-tenant
- Adicionar tenant scoping
- Validar isolamento de dados
- Auditar isolamento
- Migrar dados com tenant awareness

## Processo
1. Identificar tenant_id do user/request
2. Adicionar tenant_id em todas queries
3. Implementar middleware de tenant validation
4. Verificar isolamento em frontend
5. Testar isolamento (tente acessar dados de outro tenant)
6. Auditar acesso cross-tenant
7. Documentar tenant scoping

## Regras Obrigatórias
- [ ] Tenant isolation é requisito obrigatório
- [ ] Toda query filtrada por tenant_id
- [ ] Middleware valida tenant em cada request
- [ ] Nunca confiar em tenant_id do frontend
- [ ] Validar isolamento em testes
- [ ] Audit logs incluem tenant_id

## Padrões Multi-Tenant
- Row-level security (RLS) no banco
- Tenant context middleware
- Tenant-scoped connections
- Separate databases per tenant (optional)
- Audit trail por tenant

## Testes de Isolamento
- [ ] User A não acessa dados de User B (diferentes tenants)
- [ ] Admin não pode escalar privileges entre tenants
- [ ] Migrations respeitam tenant boundaries
- [ ] Reports isolados por tenant

## Verificações
- [ ] Tenant scoping implementado
- [ ] Middleware validando
- [ ] Testes de isolamento passando
- [ ] Audit logs corretos
