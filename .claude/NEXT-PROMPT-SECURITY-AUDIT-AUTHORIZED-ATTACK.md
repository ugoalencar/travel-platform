# Prompt Para Claude — Ataque Controlado De Segurança

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

1. Autenticação e sessão:
   - login staff/agência;
   - login platform-admin/super admin;
   - login Travel Lite;
   - MFA do platform-admin;
   - tokens de sessão;
   - revogação, expiração, logout e reuso de token;
   - armazenamento de sessão no frontend.

2. Recuperação e troca de senha:
   - forgot password;
   - reset password;
   - expiração/uso único/hash de tokens;
   - enumeração de conta;
   - troca de senha por usuário logado;
   - senha inicial/provisória;
   - obrigação de trocar senha inicial;
   - revogação de sessões após troca/reset.

3. Rate limit e brute force:
   - login;
   - MFA verify;
   - forgot/reset password;
   - convites públicos;
   - links públicos por token;
   - importações;
   - rotas sensíveis sem autenticação;
   - store em memória vs externo.

4. Tenant isolation:
   - IDOR horizontal entre tenants;
   - uso indevido de `agencyId`, `tenantId` ou `sellerId`;
   - rotas que aceitam ID no path/body/query;
   - RLS e filtros server-side;
   - Travel Lite: isolamento entre `gadotti` e `demo`.

5. RBAC e escalada de privilégio:
   - super admin/platform-admin;
   - MASTER/ADMIN/MANAGER/SELLER/VIEWER no Lite;
   - permissões customizadas;
   - usuário tentando mudar próprio perfil/permissões;
   - usuário tentando alterar alguém acima do próprio rank;
   - rotas que confiam só no frontend.

6. Exposição de tokens/URLs:
   - reset links;
   - convites;
   - enrollment links;
   - contract/signature links;
   - partner links;
   - URLs públicas com tokens;
   - logs que possam registrar tokens;
   - frontend armazenando ou mostrando tokens após criação.

7. Headers, CORS, CSP e CSRF:
   - CORS em produção;
   - Helmet/security headers;
   - CSP;
   - HSTS;
   - CSRF considerando uso de Bearer token;
   - risco de XSS roubando token de storage.

8. Validação de entrada:
   - SQL injection;
   - XSS persistente/refletido;
   - upload/import CSV/XLSX;
   - campos de branding/logo;
   - campos financeiros;
   - datas, UUIDs, enumerações;
   - limites de tamanho.

9. Auditoria e observabilidade:
   - eventos de login, falha de login, reset, MFA, usuário, permissão,
     importação, venda e financeiro;
   - logs com dados sensíveis;
   - erros internos expostos ao cliente.

10. Deploy readiness:
   - secrets;
   - backups;
   - HTTPS;
   - banco dedicado;
   - ambiente local vs produção;
   - documentos de go-live.

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

