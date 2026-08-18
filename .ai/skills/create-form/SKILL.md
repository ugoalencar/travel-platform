# Create Form Skill

## Descrição
Skill especializada em criar formulários React com validação e integração com API.

## Quando usar
- Criar formulário de entrada de dados
- Implementar form com validação
- Adicionar formulário de edição
- Integrar form com backend

## Processo
1. Consultar padrões de form em `docs/06-frontend/`
2. Definir schema de validação (Zod, Yup, etc)
3. Criar componentes de field
4. Implementar form component
5. Adicionar validação client-side
6. Integrar com API
7. Implementar error handling
8. Adicionar loading states
9. Testar validação
10. Testar integração com API

## Padrões
- Usar library apropriada (React Hook Form, Formik, etc)
- Validação server-side e client-side
- Feedback visual de erro
- Submit loading state
- Success feedback

## Regras Obrigatórias
- [ ] Validação client-side
- [ ] Nunca confiar em validação do frontend
- [ ] Toda entrada validada no backend
- [ ] Error messages claros
- [ ] Testes de validação
- [ ] Acessibilidade

## Verificações
- [ ] Form renderiza
- [ ] Validação funciona
- [ ] API integrada
- [ ] Errors tratados
- [ ] Testes passando
