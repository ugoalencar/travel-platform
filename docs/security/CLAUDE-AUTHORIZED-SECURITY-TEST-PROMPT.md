# Prompt Para Claude — Teste De Segurança Autorizado

Você está autorizado a executar um teste de segurança controlado no projeto
Travel Platform/Travel Lite, exclusivamente em ambiente local ou ambiente de
teste explicitamente preparado para isso.

## Objetivo

Atacar o sistema como um auditor interno para produzir um relatório de
vulnerabilidades, falhas de fluxo e lacunas de segurança antes de publicação
online.

## Escopo Permitido

- Código-fonte do repositório local.
- Aplicações:
  - `services/api`
  - `services/api-lite`
  - `apps/agency`
  - `apps/platform-admin`
  - `apps/travel-lite`
  - `apps/customer`, apenas rotas de autenticação/portal quando relevante.
- Banco local ou banco descartável de teste.
- Servidores locais levantados por Docker/Vite/Fastify.
- Testes automatizados, fuzzing leve, revisão estática, revisão de configs e
  chamadas HTTP contra localhost.

## Fora Do Escopo

- Produção.
- Staging real.
- Sistemas de terceiros.
- Domínios públicos reais.
- DNS real.
- Credenciais reais.
- Ataques de negação de serviço volumétricos.
- Phishing, engenharia social ou envio real de e-mail/SMS.
- Exfiltração, publicação ou compartilhamento de tokens, senhas, cookies,
  chaves ou dados pessoais.

## Regras De Segurança

- Não leia arquivos `.env` reais.
- Não imprima secrets no relatório.
- Se encontrar secret ou token real, reporte apenas caminho, tipo provável e
  recomendação; mascare o valor.
- Não altere dados reais.
- Não rode comandos destrutivos.
- Não rode migrations contra produção/staging.
- Não faça `git push`, deploy ou publicação.
- Não tente burlar sistemas fora do ambiente local/teste.
- Preserve tenant isolation; não remova controles para fazer testes passarem.

## Áreas Obrigatórias De Ataque

### 1. Autenticação E Sessão

- Login staff/agência.
- Login platform-admin/super admin.
- Login Travel Lite.
- MFA do platform-admin.
- Tokens de sessão.
- Revogação de sessão.
- Expiração.
- Armazenamento de sessão no frontend.
- Logout.
- Reuso de token.

### 2. Recuperação E Troca De Senha

- Forgot password.
- Reset password.
- Token de reset: expiração, uso único, hash no banco, enumeração de conta.
- Troca de senha por usuário logado.
- Senha inicial/provisória.
- Obrigatoriedade de trocar senha inicial.
- Revogação de sessões após troca/reset.

### 3. Rate Limit E Brute Force

- Login.
- MFA verify.
- Forgot/reset password.
- Convites públicos.
- Links públicos por token.
- Importações.
- Rotas sensíveis sem autenticação.
- Comportamento em memória vs store externo.

### 4. Tenant Isolation

- IDOR horizontal entre tenants.
- Uso indevido de `agencyId`, `tenantId` ou `sellerId`.
- Rotas que aceitam ID no path/body/query.
- RLS e filtros server-side.
- Lite: isolamento entre `gadotti` e `demo`.

### 5. RBAC E Escalada De Privilégio

- Super admin/platform-admin.
- MASTER/ADMIN/MANAGER/SELLER/VIEWER no Lite.
- Permissões customizadas.
- Usuário tentando mudar próprio perfil/permissões.
- Usuário tentando alterar alguém acima do próprio rank.
- Rotas que confiam só no frontend.

### 6. Exposição De Tokens/URLs

- Reset links.
- Convites.
- Enrollment links.
- Contract/signature links.
- Partner links.
- URLs públicas com tokens.
- Logs que possam registrar tokens.
- Frontend armazenando ou mostrando tokens após criação.

### 7. Headers, CORS, CSP E CSRF

- CORS em produção.
- Helmet/security headers.
- CSP.
- HSTS.
- CSRF considerando uso de Bearer token.
- Risco de XSS roubando token de storage.

### 8. Validação De Entrada

- SQL injection.
- XSS persistente/refletido.
- Upload/import CSV/XLSX.
- Campos de branding/logo.
- Campos financeiros.
- Datas, UUIDs, enumerações.
- Limites de tamanho.

### 9. Auditoria E Observabilidade

- Eventos de login, falha de login, reset, MFA, usuário, permissão, importação,
  venda e financeiro.
- Logs com dados sensíveis.
- Erros internos expostos ao cliente.

### 10. Deploy Readiness

- Secrets.
- Backups.
- HTTPS.
- Banco dedicado.
- Ambiente local vs produção.
- Documentos de go-live.

## Entregáveis

Crie um relatório Markdown em:

`.claude/security-audit-YYYY-MM-DD.md`

O relatório deve conter:

1. Resumo executivo.
2. Matriz de severidade:
   - Crítico
   - Alto
   - Médio
   - Baixo
   - Informativo
3. Cada achado com:
   - título;
   - severidade;
   - componente afetado;
   - arquivo/linha quando aplicável;
   - rota afetada quando aplicável;
   - pré-condição;
   - passos para reproduzir em ambiente local/teste;
   - impacto;
   - recomendação objetiva;
   - sugestão de teste automatizado.
4. Lista de itens testados e considerados ok.
5. Lacunas que exigem decisão de produto.
6. Próxima ordem recomendada de correção.

## Foco Especial

Priorize estes questionamentos:

- Existe recuperação de senha completa no super admin?
- Existe troca de senha pelo próprio cliente/usuário logado?
- Existe obrigação de trocar senha inicial/provisória?
- O Travel Lite precisa ter recuperação/troca de senha antes do go-live?
- Rate limit cobre login, MFA e reset?
- URLs/tokens públicos são seguros e não vazam em logs/UI?
- O ambiente está seguro o suficiente para demonstrar online `gadotti` e `demo`?

## Postura

Seja agressivo tecnicamente, mas não destrutivo. O objetivo é encontrar falhas
antes de cliente ou atacante encontrar.

