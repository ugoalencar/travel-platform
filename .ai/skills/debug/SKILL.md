# Debug Skill

## Descrição
Skill para debugar código, identificar e resolver issues.

## Quando usar
- Investigar bug
- Validar comportamento
- Entender fluxo de código
- Testes falhando
- Comportamento inesperado

## Processo de Debug
1. Reproduzir o bug consistentemente
2. Isolar o problema
3. Adicionar logs/breakpoints
4. Executar debugger
5. Inspecionar state/variáveis
6. Verificar fluxo de execução
7. Identificar raiz do problema
8. Implementar fix
9. Testar fix
10. Prevenir regressão (teste)

## Técnicas de Debug

### Logs
```javascript
console.log('valor:', valor);
console.error('erro:', erro);
```

### Debugger
- VS Code debugger
- Browser DevTools
- Node.js debugger
- IDE integrados

### Testes
- Adicionar testes que reproduzem bug
- Testes devem falhar
- Fix implementado
- Testes devem passar

## Tipos de Problemas
- Logic errors
- Type errors
- Authorization issues
- Tenant isolation breaks
- Performance issues
- API errors
- Database issues

## Verificações
- [ ] Bug reproduzido
- [ ] Raiz identificada
- [ ] Fix testado
- [ ] Teste adicionado
- [ ] Sem regressões
