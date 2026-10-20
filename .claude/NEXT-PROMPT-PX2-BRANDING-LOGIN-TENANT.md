# NEXT PROMPT — PX2 Branding + Login por Tenant

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

O usuário identificou que a documentação de experiência do Travel Lite foi prometida, mas não havia sido entregue integralmente. A estrutura agora deve existir em:

`docs/travel-lite/product-experience/`

Leia especialmente:

- `docs/travel-lite/product-experience/BRANDING.md`
- `docs/travel-lite/product-experience/ONBOARDING.md`
- `docs/travel-lite/product-experience/HELP-CENTER.md`
- `docs/travel-lite/ACCESS-CONTROL.md`
- `docs/AI_CONTEXT.md`
- `AGENTS.md`

## Objetivo PX2

Implementar branding básico por tenant no Travel Lite, com foco em login personalizado:

- nome fantasia;
- logo;
- cores primária/secundária;
- fundo/login;
- aplicação visual no login e app autenticado;
- configuração editável por MASTER;
- fallback seguro quando não houver branding.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma sem autorização explícita.
- Não instalar dependências.
- Segurança e tenant isolation primeiro.
- Nunca confiar em tenantId vindo do frontend.
- Use Fastify/Vitest/React conforme padrões existentes.

## Entrega esperada

1. Auditar estrutura atual de settings/tenant no `services/api-lite` e `apps/travel-lite`.
2. Propor implementação mínima segura.
3. Implementar se couber sem migration; se exigir migration, documentar exatamente a migration proposta e parar antes de aplicar.
4. Adicionar testes focados.
5. Rodar gates relevantes.
6. Salvar relatório final em `.claude/2026-10-01_PX2_branding-login-tenant-report.md`.

## Observação

Se migration for indispensável, não execute. Documente o SQL e peça coordenação.
