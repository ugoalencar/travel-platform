# Code Review Skill

## Descrição
Skill para revisar código de forma estruturada, garantindo qualidade e conformidade.

## Quando usar
- Revisar Pull Request
- Code review estruturado
- Garantir padrões do projeto
- Validar boas práticas
- Antes de merge para main

## Processo de Review

1. **Contexto**: Entender o que mudou e por quê
2. **Testes**: Verificar se testes foram adicionados
3. **Segurança**: Executar security review
4. **Padrões**: Validar conformidade com padrões
5. **Arquitetura**: Verificar integridade arquitetural
6. **Performance**: Checar impacto de performance
7. **Documentação**: Verificar atualização de docs
8. **Feedback**: Comentários construtivos

## Checklist de Review

### Geral
- [ ] PR tem descrição clara
- [ ] Commits têm mensagens boas
- [ ] Escopoé claro

### Código
- [ ] Segue padrões do projeto
- [ ] Código legível e limpo
- [ ] Funções têm responsabilidade única
- [ ] Sem código duplicado
- [ ] Naming descritivo

### Testes
- [ ] Testes foram adicionados
- [ ] Todos os casos cobertos
- [ ] Testes são determinísticos
- [ ] Cobertura adequada

### Segurança
- [ ] Sem secrets expostos
- [ ] Validação de entrada
- [ ] Autorização implementada
- [ ] Tenant isolation validado
- [ ] Sem vulnerabilidades conhecidas

### Arquitetura
- [ ] Segue arquitetura do projeto
- [ ] Sem alterações arquiteturais injustificadas
- [ ] Dependências apropriadas
- [ ] Sem breaking changes sem versioning

### Performance
- [ ] Queries otimizadas
- [ ] Sem N+1 problems
- [ ] Caching apropriado
- [ ] Bundle size considerado

## Feedback Construtivo
- Ser específico
- Sugerir soluções
- Reconhecer bom trabalho
- Distinguir issues críticas vs sugestões

## Aprovação
- [ ] Todos os pontos revistos
- [ ] Issues críticas resolvidas
- [ ] Pronto para merge
