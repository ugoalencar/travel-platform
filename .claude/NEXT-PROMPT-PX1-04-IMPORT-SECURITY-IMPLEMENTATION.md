# Próximo prompt Claude — PX1-04 Implementação Import Security Full

Você é um agente auxiliar trabalhando no repositório `D:\travel-platform`.

## Contexto

O plano mestre PX1 foi salvo em:

`docs/superpowers/plans/2026-10-01-px1-master-coordination.md`

Sua especificação técnica anterior está em:

`.claude/2026-10-01_PX1-03_import-security-fix-spec.md`

O Opencode/Mimo deve continuar em HOLD. Não toque em `.opencode`, `apps/travel-lite`, `services/api-lite` nem `docs/travel-lite`.

## Objetivo

Implementar a correção de segurança das rotas `/api/import/*` do Full:

- autenticação antes de qualquer processamento;
- RBAC por perfil;
- erro 500 sem vazar `error.message`;
- validação de entrada;
- testes HTTP cobrindo 401/403/erro seguro;
- documentação de autorização atualizada.

## Decisões aplicadas nesta rodada

- Escritas de importação: `ADMIN+`.
- Leituras de importação: `MANAGER+`.
- Rate limit dedicado para `/api/import/*`: **não implementar agora**; registrar como follow-up.
- Não fazer deploy.
- Não rodar migrations.
- Não tocar produção/staging.

## Regras obrigatórias

- Não trabalhar diretamente na `main`.
- Criar branch/worktree isolada antes de implementar, sugerida: `codex/px1-import-security`.
- Não ler arquivos `.env` reais.
- Não rodar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Não instalar dependências.
- Não acessar produção ou staging.
- Não fazer deploy.
- Não mexer na worktree Travel Lite.
- Seguir `AGENTS.md`, `docs/AI_CONTEXT.md`, `QUALITY-GATES.md` e `SCRIPTS.md`.

## Arquivos permitidos

Você pode alterar apenas:

- `services/api/src/routes/import.ts`
- `services/api/src/import/service.ts`
- `tests/security/import-allowlist.test.ts`
- `services/api/tests/import-routes-http.test.ts`
- `docs/03-security/authorization.md`
- `.claude/2026-10-01_PX1-04_import-security-implementation-report.md`

Não altere `services/api/src/rate-limit.ts` nesta rodada.

## Implementação esperada

Siga a Task 2 do plano mestre:

`docs/superpowers/plans/2026-10-01-px1-master-coordination.md`

Resumo:

1. Criar branch/worktree isolada.
2. Escrever testes vermelhos primeiro em `services/api/tests/import-routes-http.test.ts`.
3. Aplicar `protectedHooks` nas 7 rotas de importação.
4. Adicionar `requireRole(UserRole.ADMIN)` nas rotas de escrita.
5. Adicionar `requireRole(UserRole.MANAGER)` nas rotas de leitura.
6. Remover respostas com `error.message` cru.
7. Reclassificar erros de usuário em `services/api/src/import/service.ts`.
8. Validar entradas antes do serviço.
9. Ajustar `tests/security/import-allowlist.test.ts` para autenticar como ADMIN.
10. Atualizar `docs/03-security/authorization.md`.

## Gates obrigatórios

Rode ao final, salvo bloqueio real documentado:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Rode `npm run test:db` apenas se adicionar teste que dependa de Postgres/RLS real.

## Entrega

Crie:

`.claude/2026-10-01_PX1-04_import-security-implementation-report.md`

O relatório deve conter:

1. Branch/worktree usada.
2. Arquivos alterados.
3. Testes adicionados/alterados.
4. Gates executados e resultado.
5. Itens não executados e motivo.
6. Riscos restantes.
7. Confirmação explícita de que não houve deploy, migration, produção/staging ou leitura de `.env`.

## Importante

Não fazer merge, push, PR ou deploy. Apenas implementar localmente e reportar.
