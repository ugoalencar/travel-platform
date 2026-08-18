# AI/Copilot Skills

Conjunto de skills customizadas para guiar desenvolvimento do projeto Travel Platform.

## Skills Disponíveis

### Desenvolvimento de Features
- **[create-feature/](create-feature/)** - Criar novas funcionalidades completas
- **[create-api-endpoint/](create-api-endpoint/)** - Implementar endpoints de API
- **[create-react-page/](create-react-page/)** - Criar páginas React
- **[create-form/](create-form/)** - Construir formulários com validação

### Banco de Dados
- **[database-migration/](database-migration/)** - Gerenciar migrações de schema

### Segurança
- **[authentication/](authentication/)** - Implementar autenticação segura
- **[authorization/](authorization/)** - Controle de acesso e permissões
- **[tenant-isolation/](tenant-isolation/)** - Garantir isolamento de dados entre agências
- **[security-review/](security-review/)** - Revisar segurança de código

### Testing & Quality
- **[write-tests/](write-tests/)** - Escrever testes automatizados
- **[code-review/](code-review/)** - Revisar código estruturadamente
- **[debug/](debug/)** - Debugar e resolver issues

### Maintenance & Documentation
- **[documentation/](documentation/)** - Criar e manter documentação
- **[adr/](adr/)** - Documentar decisões arquiteturais
- **[refactoring/](refactoring/)** - Refatorar código mantendo qualidade
- **[dependency-review/](dependency-review/)** - Revisar e gerenciar dependências

## Como Usar

Cada skill tem um arquivo `SKILL.md` com:
- Descrição
- Quando usar
- Processo passo-a-passo
- Checklists
- Regras obrigatórias
- Verificações

## Regras Críticas

As seguintes regras são obrigatórias em TODO o desenvolvimento:

1. **Tenant Isolation** - Isolamento de dados entre agências é OBRIGATÓRIO
2. **Segurança** - Toda operação sensível requer autorização
3. **Testes** - Toda alteração relevante deve ter testes
4. **Documentação** - Decisões arquiteturais devem ser registradas em ADRs
5. **Validação** - Toda entrada deve ser validada
6. **Sem Secrets** - Nunca expor passwords, tokens, dados pessoais

Consulte `AGENTS.md` para as regras globais. Use `.ai/policies/` para
politicas especializadas e `.ai/checklists/` para validacoes operacionais.
