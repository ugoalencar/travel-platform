# Authorization Skill

## Descrição
Skill para implementar controle de acesso e autorização em toda aplicação.

## Quando usar
- Implementar Role-Based Access Control (RBAC)
- Adicionar permissões a recurso
- Proteger endpoint
- Validar acesso a dados
- Implementar policies

## Processo
1. Consultar documentação de segurança em `docs/03-security/`
2. Definir roles e permissões
3. Implementar autorização no backend
4. Validar acesso em cada endpoint
5. Implementar no frontend (UI)
6. Testar cada role
7. Validar tenant isolation
8. Documentar permissions

## Regras Obrigatórias
- [ ] Toda operação sensível verifica autorização
- [ ] Autorização no backend (nunca frontend)
- [ ] Tenant isolation verificado
- [ ] Least privilege principle
- [ ] Audit logs de acesso
- [ ] Testes de permissions

## Padrões de Autorização
- Role-Based Access Control (RBAC)
- Attribute-Based Access Control (ABAC)
- Resource-level permissions
- Tenant scoping
- Super admin escalation

## Verificações
- [ ] Roles criados
- [ ] Permissions atribuídas
- [ ] Endpoints protegidos
- [ ] Tenant isolation validado
- [ ] Testes de autorização
