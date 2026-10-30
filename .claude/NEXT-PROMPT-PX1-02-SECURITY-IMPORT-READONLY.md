# Próximo prompt Claude — PX1-02 Segurança Full / Import Routes

Você é um agente auxiliar trabalhando no repositório `D:\travel-platform`.

## Contexto

O relatório anterior (`.claude/2026-10-01_1027_auditoria-mapa-lite-full.md`) encontrou um risco alto no Full:

- `services/api/src/routes/import.ts` aparentemente registra rotas `/api/import/*` sem aplicar `protectedHooks`;
- o parâmetro `protectedHooks` é recebido, mas possivelmente não usado;
- pode haver leitura multipart antes de autenticação;
- falhas parecem retornar erro interno ao cliente;
- não foi encontrado teste HTTP cobrindo autenticação/autorização dessas rotas.

O Opencode/Mimo ainda está auditando a UX da Travel Lite. Para evitar conflito, **não trabalhe em `apps/travel-lite`, `services/api-lite` nem `docs/travel-lite` nesta rodada**.

## Tarefa

Faça uma auditoria **somente leitura** e produza um relatório técnico sobre o risco das rotas de importação no Full.

## Regras obrigatórias

- Não editar, mover, renomear, deletar ou formatar arquivos.
- Não rodar deploy.
- Não rodar migrations.
- Não rodar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Não ler arquivos `.env` reais.
- Não acessar produção ou staging.
- Não alterar `main`.
- Não mexer na worktree `D:\travel-platform\.worktrees\travel-lite`.
- Seguir `AGENTS.md` e `docs/AI_CONTEXT.md`.

## Leia no mínimo

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `docs/03-security/security-model.md`
- `docs/03-security/authorization.md`
- `services/api/src/app.ts`
- `services/api/src/routes/import.ts`
- `services/api/src/routes/*.ts` suficientes para comparar o padrão correto de registro com `protectedHooks`
- testes existentes em `services/api/tests/*import*`, `services/api/tests/*auth*`, `tests/security/*`, se existirem
- migrations relacionadas a `import_jobs`, `import_mapping_templates` e area grants, se necessário

## Entregue em novo arquivo `.md`

Salve o relatório em:

`.claude/2026-10-01_PX1-02_import-routes-security-audit.md`

O relatório deve conter:

1. Confirmação objetiva se o risco existe ou se foi falso positivo.
2. Evidências com caminhos de arquivos e nomes de funções/rotas.
3. Comparação com um módulo de rota protegido corretamente.
4. Impacto provável:
   - autenticação;
   - autorização/RBAC;
   - tenant isolation;
   - exposição de erro interno;
   - consumo de memória/DoS via multipart antes de auth.
5. Testes existentes que cobrem ou deixam de cobrir esse comportamento.
6. Correção recomendada, mas **sem implementar**.
7. Lista de arquivos que provavelmente precisariam ser alterados numa rodada futura.
8. Riscos de regressão se a correção for feita.

## Importante

Esta rodada é investigação e especificação técnica. Não implemente a correção ainda.
