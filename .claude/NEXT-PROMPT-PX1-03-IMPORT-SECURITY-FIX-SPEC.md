# Próximo prompt Claude — PX1-03 Especificação de correção Import Security

Você é um agente auxiliar trabalhando no repositório `D:\travel-platform`.

## Contexto

Você confirmou em `.claude/2026-10-01_PX1-02_import-routes-security-audit.md` que as rotas `/api/import/*` do Full estão sem `protectedHooks`, sem RBAC, expõem erro interno e aceitam upload anônimo antes da autenticação.

O Opencode/Mimo entregou uma auditoria separada de UX da Travel Lite. Para evitar conflito, **não trabalhe em `apps/travel-lite`, `services/api-lite`, `docs/travel-lite` nem `.opencode` nesta rodada**.

## Tarefa

Produza uma especificação técnica de correção para as rotas de importação do Full, ainda **sem implementar código**.

## Regras obrigatórias

- Não editar código-fonte.
- Não editar testes.
- Não rodar deploy.
- Não rodar migrations.
- Não rodar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Não ler arquivos `.env` reais.
- Não acessar produção ou staging.
- Não alterar `main`.
- Pode criar apenas o relatório `.md` solicitado abaixo.

## Leia no mínimo

- `.claude/2026-10-01_PX1-02_import-routes-security-audit.md`
- `services/api/src/routes/import.ts`
- `services/api/src/app.ts`
- `services/api/src/routes/wishes.ts`
- `services/api/src/routes/customers.ts`
- `services/api/src/rate-limit.ts`
- `tests/security/import-allowlist.test.ts`
- `QUALITY-GATES.md`
- `SCRIPTS.md`

## Entregue em novo arquivo `.md`

Salve o relatório em:

`.claude/2026-10-01_PX1-03_import-security-fix-spec.md`

O relatório deve conter:

1. Objetivo da correção.
2. Escopo exato da rodada futura.
3. Arquivos a alterar.
4. Mudanças propostas em `services/api/src/routes/import.ts`, com pseudodiff ou blocos de exemplo curtos.
5. Decisão recomendada de RBAC para cada rota:
   - `upload`;
   - `parse`;
   - `validate`;
   - `confirm`;
   - `cancel`;
   - `jobs`;
   - `:jobId`.
6. Estratégia de tratamento de erro seguro.
7. Estratégia de validação de entrada.
8. Testes mínimos obrigatórios, com nomes sugeridos.
9. Gates a rodar após implementação.
10. Riscos de regressão e mitigação.
11. Ordem segura de implementação para outro agente executar depois.

## Importante

Esta rodada ainda é especificação. Não implemente a correção.
