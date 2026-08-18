# Security Review Skill

## Descrição
Skill para revisar segurança de código, arquitetura e configurações.

## Quando usar
- Revisar novo código antes de merge
- Auditar segurança de feature
- Validar isolamento de dados
- Verificar secrets management
- Revisar autenticação/autorização
- Checar dependências vulneráveis

## Checklist de Segurança
- [ ] Sem hardcoded secrets/passwords
- [ ] Validação de entrada em todos endpoints
- [ ] Autorização verificada
- [ ] Tenant isolation implementado
- [ ] Sem SQL injection risk
- [ ] Sem XSS vulnerability
- [ ] Sem CSRF vulnerability
- [ ] Rate limiting em endpoints públicos
- [ ] Error messages não expõem dados
- [ ] Logs não contêm dados sensíveis

## Processo de Review
1. Ler código procurando vulnerabilidades
2. Verificar validações de entrada
3. Verificar autorização
4. Validar tenant isolation
5. Checar gerenciamento de secrets
6. Revisar queries SQL (SQL injection)
7. Revisar output (XSS)
8. Verificar dependências (npm audit, cargo audit)
9. Documentar findings
10. Pedir fixes antes de merge

## Ferramentas
- npm audit / pip audit
- OWASP Top 10
- Security best practices
- Snyk / Dependabot
- SonarQube

## Verificações Críticas
- [ ] Secrets não expostos
- [ ] Validações presentes
- [ ] Autorização implementada
- [ ] Tenant isolation validado
- [ ] No vulnerabilities conhecidas
