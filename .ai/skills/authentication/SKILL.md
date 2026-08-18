# Authentication Skill

## Descrição
Skill para implementar e manter sistemas de autenticação segura.

## Quando usar
- Implementar login/logout
- Integrar auth provider
- Gerenciar sessions
- Implementar MFA
- Reset de senha

## Processo
1. Consultar documentação de segurança em `docs/03-security/`
2. Verificar auth provider do projeto
3. Implementar login flow
4. Gerenciar tokens/sessions
5. Implementar refresh token
6. Adicionar logout
7. Testar autenticação
8. Validar segurança

## Regras Obrigatórias
- [ ] Nunca armazenar passwords em plain text
- [ ] Usar hash seguro (bcrypt, argon2)
- [ ] Implementar rate limiting
- [ ] Usar HTTPS
- [ ] Tokens com expiração
- [ ] Refresh token seguro
- [ ] CSRF protection
- [ ] Logout limpa sessions

## Padrões de Segurança
- OAuth2/JWT para APIs
- Sessions httpOnly cookies
- Password complexity rules
- Account lockout após N tentativas
- Audit logs de autenticação

## Verificações
- [ ] Auth flow funciona
- [ ] Tokens validados
- [ ] Sessions gerenciadas
- [ ] Rate limiting ativo
- [ ] Vulnerabilidades testadas
