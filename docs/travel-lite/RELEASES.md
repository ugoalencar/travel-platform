# Travel Lite — Releases

## 0.1.0 Inicial — 2026-10-02

Status: base inicial para demonstração, homologação e futuras atualizações.

### Entregue

- Travel Lite com API Fastify, frontend React/PWA e PostgreSQL dedicado.
- Tenant Gadotti preservado para homologação.
- Tenant Demo separado, com dados preenchidos para navegação comercial sem
  alterar o ambiente Gadotti.
- Branding por tenant, inclusive impacto no login.
- Central de Ajuda e onboarding dentro do produto.
- Dashboard, clientes, vendedores, vendas, custos, financeiro, relatórios,
  importações, plano/capacidades e readiness de migração Lite para Full.
- Manual e apresentação do Lite.
- Mensagens visíveis principais em português.

### Acessos Locais De Demonstração

| Ambiente | Agência | Usuário principal | Senha |
| --- | --- | --- | --- |
| Demo | `demo` | `demo.master@gadotti.local` | `DemoTravel2026!` |
| Gadotti | `gadotti` | `patricia.voltolini@gadottijoinville.com.br` | `LiteDemo2026!` |

As credenciais acima são para o pacote/local de demonstração. Qualquer ambiente
online deve receber credenciais e política de senha próprias.

### Limitações Conhecidas

- Não existe ainda área de backup/restore operada pelo cliente dentro da
  interface.
- Deploy online ainda depende de decisão de provedor, banco, domínio, secrets,
  backup e política de dados piloto.
- O modelo híbrido local-first ainda não está implementado.
- Validação comercial de licença/pagamento ainda não existe.
- Backups online periódicos criptografados ainda não existem.

### Evidência Local

- API typecheck: aprovado.
- Frontend typecheck: aprovado.
- Testes frontend focados: aprovados.
- Testes API focados: aprovados.
- Endpoint de versão esperado: `/api/version` retornando `0.1.0`.
- Docker local reconstruído e smoke real aprovado em `http://127.0.0.1:4010`.
