# Create React Page Skill

## Descrição
Skill para criar novas páginas React seguindo padrões do projeto frontend.

## Quando usar
- Implementar nova página
- Adicionar nova rota no frontend
- Criar nova seção de aplicação
- Integrar nova feature no UI

## Processo
1. Consultar documentação de frontend em `docs/06-frontend/`
2. Verificar design system do projeto
3. Criar estrutura de componentes
4. Implementar page component
5. Adicionar roteamento
6. Conectar com API
7. Implementar validação de agência (tenant)
8. Criar testes de componente
9. Adicionar loading, error states

## Padrões
- Usar React hooks modernos
- Separar lógica em custom hooks
- Reutilizar componentes compartilhados (`packages/shared`)
- Implementar error boundaries
- Lazy load quando apropriado

## Regras Obrigatórias
- [ ] Página criada em local apropriado
- [ ] Roteamento configurado
- [ ] Validação de tenant no frontend
- [ ] Testes unitários
- [ ] Error handling
- [ ] Loading states
- [ ] Acessibilidade básica

## Verificações
- [ ] Page renderiza corretamente
- [ ] API integrada
- [ ] Tenant isolation verificado
- [ ] Testes passando
