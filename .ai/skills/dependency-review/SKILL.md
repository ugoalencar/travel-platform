# Dependency Review Skill

## Descrição
Skill para revisar e validar dependências do projeto.

## Quando usar
- Antes de adicionar nova dependência
- Revisar vulnerabilidades
- Manter dependências atualizadas
- Verificar licenças
- Reduzir bundle size
- Auditar compatibilidades

## Regra Obrigatória
**Não adicionar dependências sem justificar.**

## Processo

1. **Necessidade**
   - Por que precisa desta dependência?
   - Já existe alternativa no projeto?
   - Vale o tamanho/complexidade?

2. **Pesquisa**
   - GitHub: stars, issues, última atualização
   - NPM/PyPI: versões, download stats
   - Manutenção ativa?
   - Comunidade?

3. **Segurança**
   - npm audit
   - Vulnerabilidades conhecidas?
   - Licença compatível?
   - Dependências transitivas seguras?

4. **Performance**
   - Bundle size?
   - Tree-shaking support?
   - Impacto de performance?

5. **Alternativas**
   - Considerar alternativas
   - Comparar pros/cons
   - Documentar decisão

6. **Instalação**
   - Instalar com versão fixa ou range?
   - Atualizar documentação
   - Testar integração

## Checklist

### Antes de Adicionar
- [ ] Necessidade justificada
- [ ] Alternativas consideradas
- [ ] Reputação do projeto verificada
- [ ] Sem vulnerabilidades críticas
- [ ] Licença compatível
- [ ] Bundle size aceitável

### Manutenção
- [ ] npm audit ou pip audit rodando
- [ ] Dependências desatualizado identificadas
- [ ] Updates planejadas
- [ ] Deprecations monitoradas
- [ ] Licenças verificadas

### Remoção
- [ ] Usar justificadamente?
- [ ] Pode remover?
- [ ] Atualizar docs
- [ ] Testar remoção

## Ferramentas
- npm audit
- pip audit
- OWASP Dependency Check
- Snyk
- Dependabot
- npm outdated

## Verificações
- [ ] Dependência justificada
- [ ] Sem vulnerabilidades
- [ ] Licença OK
- [ ] Bundle size aceitável
- [ ] Documentação atualizada
