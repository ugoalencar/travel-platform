# Database Migration Skill

## Descrição
Skill para criar e gerenciar migrações de banco de dados de forma segura.

## Quando usar
- Adicionar/alterar schema no banco de dados
- Criar migrations versionadas
- Rollback de migrações
- Validar impacto de migrations

## Processo
1. Consultar documentação de banco em `docs/04-database/`
2. Criar migration file com timestamp
3. Implementar UP migration
4. Implementar DOWN migration (rollback)
5. Testar em ambiente local
6. Validar isolamento de dados por tenant
7. Documentar breaking changes

## Regras Obrigatórias
- [ ] Nunca executar migrations destrutivas sem autorização
- [ ] Sempre criar DOWN migrations
- [ ] Testar rollback
- [ ] Validar impacto em cada agência
- [ ] Documentar mudanças de schema

## Verificações
- [ ] Migration versionada
- [ ] UP e DOWN implementados
- [ ] Sem dados perdidos
- [ ] Tenant isolation mantido
