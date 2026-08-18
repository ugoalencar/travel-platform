# Write Tests Skill

## Descrição
Skill especializada em escrever testes automatizados (unit, integration, e2e).

## Quando usar
- Implementar testes para feature
- Aumentar cobertura de testes
- Testar edge cases
- Implementar testes de integração
- E2E testing

## Regra Obrigatória
**Toda alteração relevante deve possuir testes.**

## Tipos de Testes

### Unit Tests
- Testar função/método isolado
- Mock dependências
- Testar casos normais e edge cases
- Cobertura: >80%

### Integration Tests
- Testar múltiplos módulos juntos
- Testar com banco de dados real/mock
- Testar API endpoints
- Incluir testes de autorização

### E2E Tests
- Testar user flow completo
- Browser-based testing
- Testar em `tests/e2e/`
- Cenários críticos

## Processo
1. Identificar cenários de teste
2. Escrever testes (TDD ou após implementação)
3. Executar testes localmente
4. Validar cobertura
5. Testar falhas/edge cases
6. Integrar em CI/CD

## Padrões de Teste
- Usar Vitest como framework oficial de testes
- Arrange-Act-Assert pattern
- Descrições claras de teste
- Mock dados realistas
- Testes isolados e independentes
- Testes determinísticos

## Verificações
- [ ] Testes escritos
- [ ] Todos passando localmente
- [ ] Cobertura adequada
- [ ] Edge cases testados
- [ ] Autorização testada
- [ ] Tenant isolation testado
