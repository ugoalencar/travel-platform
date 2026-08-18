# Refactoring Skill

## Descrição
Skill para refatorar código mantendo funcionalidade e melhorando qualidade.

## Quando usar
- Código difícil de ler
- Lógica duplicada
- Manutenção difícil
- Performance issues
- Tecnologia desatualizada
- Melhorar test coverage

## Regra Importante
**Não criar abstrações prematuramente.**

## Processo de Refactoring

1. **Entender código existente**
   - Ler código
   - Entender fluxo
   - Identificar problemas

2. **Testes primeiro**
   - Adicionar testes se não houver
   - Testes devem passar ANTES de refactoring
   - Testes validam comportamento

3. **Refactor incremental**
   - Pequenas mudanças
   - Testar após cada mudança
   - Commit pequenos

4. **Não alterar comportamento**
   - Refactoring = mesma funcionalidade
   - Se mudar comportamento, são features
   - Tests continuam passando

5. **Validar performance**
   - Medir antes
   - Medir depois
   - Documentar impacto

## Tipos de Refactoring

### Extract Method
- Dividir função grande em menores
- Cada método com responsabilidade única
- Nomear descritivamente

### Remove Duplication
- Identificar código duplicado
- Extrair para função compartilhada
- DRY principle

### Rename
- Variáveis/funções com nomes melhores
- Nomes descritivos
- Conventions do projeto

### Simplify Logic
- Reduzir complexidade
- Condicionalidades claras
- Legibilidade

### Update Dependencies
- Atualizar libraries desatualizado
- Seguir deprecation warnings
- Testar compatibilidade

## Verificações
- [ ] Testes existem e passam ANTES
- [ ] Refactoring não altera behavior
- [ ] Testes passam DEPOIS
- [ ] Performance validada
- [ ] Code review feito
- [ ] Sem regressões
