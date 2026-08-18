# Create API Endpoint Skill

## Descrição
Skill especializada em criar endpoints de API REST/GraphQL seguindo padrões do projeto.

## Quando usar
- Implementar novo endpoint
- Adicionar nova rota
- Integrar nova funcionalidade na API
- Expor novo recurso via API

## Processo
1. Identificar domínio.
2. Identificar ator.
3. Definir autorização.
4. Definir DTO.
5. Definir validação.
6. Definir caso de uso.
7. Implementar serviço.
8. Implementar controller.
9. Implementar testes.
10. Implementar testes de autorização.
11. Atualizar documentação.

## Regras Obrigatórias
- [ ] Toda API deve ter validação de entrada
- [ ] Toda operação sensível deve verificar autorização
- [ ] Nunca confiar em dados do frontend
- [ ] Isolamento de agência é obrigatório
- [ ] Endpoint documentado
- [ ] Testes de integração

## Tipos de Resposta
- Sucesso (200, 201)
- Validação (400)
- Autorização (401, 403)
- Not Found (404)
- Error (500)
