# Checklist de Prontidão para Piloto — Travel Platform

Referência: `docs/release/RELEASE_CANDIDATE_VALIDATION.md` (evidências completas). Commit validado: `9e70997b5e75238693e3dad5027c0382f5816bcc`.

Legenda: ✅ OK | ⚠️ Ressalva (P2/P3 ou gap operacional documentado) | ❌ Bloqueio (P0/P1)

## Infra

- ✅ API responde em `/health` e `/readiness` com dados reais.
- ⚠️ `/version` retorna `"unknown"` para build/migração/deployment (variáveis de ambiente não configuradas no ambiente local).
- ✅ PostgreSQL 15.18 real, Redis 7.4.11 real, HTTPS real via Caddy (staging local).
- ❌ **Não existe staging remoto real** equivalente ao ambiente do piloto — GAP OPERACIONAL.

## Auth

- ✅ Login staff funcional com credenciais reais.
- ✅ Sessão não persistida em `localStorage` (apenas `sessionStorage`, mais o slug da agência não-sensível).
- ✅ Platform Admin com login/sessão totalmente separados do staff.
- ✅ RBAC real confirmado (AGENT recebe `403` em rota restrita a MANAGER+).
- ⚠️ MFA e recovery code não re-exercidos ao vivo nesta rodada (sem conta de teste com MFA habilitado); fluxo estrutural inalterado desde a Phase 3B.

## Tenant

- ✅ **Isolamento cross-tenant confirmado via API direta** (cliente, viagem e oferta de um tenant retornam `404` para outro tenant; listagens retornam apenas os próprios registros).
- ✅ RLS fail-closed confirmado diretamente no Postgres (sem contexto de tenant = 0 linhas).

## Agency

- ✅ Criação de cliente real → Customer 360 com dados reais.
- ✅ Pipeline: movimentação de etapa com persistência confirmada após reload.
- ✅ Criação de viagem funcional, com dados cruzados corretos entre fluxos (cliente recém-criado disponível no seletor).

## Commercial / Pipeline

- ✅ Pipeline funcional, drag/avançar etapa, persistência real.
- ⚠️ Gap **Offer → Opportunity** confirmado e documentado (Fase 9 do relatório de validação) — sem `offerId` em `commercial_opportunities`. Caminho real usado (Oferta → Proposta direto) já cobre o caso de uso principal; não é bloqueio de piloto.

## Operations

- ✅ Categorias Terrestre/Aéreo/Excursão com distinção visual real.
- ✅ Modelo de Excursões (template → departure → roster) intacto.
- ⚠️ Upload/download de documentos não re-testado com um novo arquivo real nesta rodada específica (comportamento herda o mesmo mecanismo de RLS já validado).

## Finance

- ✅ Dashboard financeiro real, sem recálculo no frontend (confirmado por inspeção de código).
- ✅ Nenhuma divergência encontrada entre API e UI nesta sessão.

## Customer App

- ✅ Fluxo completo validado (Home → viagem → documentos → ofertas → interesse real registrado no banco).
- ✅ Nenhuma informação interna (custo, comissão, nota privada) exposta ao cliente — confirmado por inspeção de código.
- ✅ Responsivo em 390px (bottom-nav, cards).

## Platform Admin

- ✅ **Revalidado após correção dos DB grants** — Dashboard, Agências, Suporte carregando com `200 OK` e dados reais.
- ✅ Grants não ficaram amplos demais (21 tabelas com CRUD completo, 11 tabelas de auditoria limitadas a `SELECT`+`INSERT`, mesma convenção de `audit_logs`).

## Email

- ❌ **BLOQUEIO — nenhum provedor de e-mail transacional real configurado.** Convite, ativação e reset de senha funcionam apenas via link mostrado na tela, não aceitável para piloto com agência externa.

## Storage

- ✅ Upload/armazenamento via chave segura, não caminho local exposto (confirmado por inspeção de código, `file-storage.ts`).

## Backup

- ✅ **Backup real gerado nesta rodada** — `pg_dump -Fc`, 1.078.364 bytes, formato binário válido, não vazio.
- ⚠️ Retenção e armazenamento de backup real (fora da máquina local) não documentados/implementados — depende do ambiente de piloto real (GAP OPERACIONAL, ligado ao gap de staging remoto).

## Restore

- ✅ **Restore real testado nesta rodada** — restaurado em banco descartável, schema/RLS/dados/relacionamentos íntegros (157 tabelas, 26 agências, 11 clientes, zero FK órfão).
- ✅ Smoke test funcional pós-restore confirmou RLS fail-closed e correto com contexto de tenant.

## Support

- ⚠️ Página de Suporte do Platform Admin funcional (CRUD real), mas sem canal externo de e-mail para notificar (mesmo gap da Fase 4).

## Monitoring

- ❌ **GAP OPERACIONAL** — nenhum monitoramento externo (APM/alertas) conectado. Observabilidade real hoje = `/health`+`/readiness`+`/version` (parcial) + logs estruturados.

## Security

- ✅ Scanner de segredos: nenhum segredo encontrado no código.
- ✅ 20/20 testes de segurança passando.
- ✅ Nenhuma senha/token real encontrado em logs (achado menor de verbosidade de log, P3, registrado no relatório de validação).

## UAT

- ✅ Fluxo principal da agência exercido com dados reais e persistência confirmada.
- ✅ Fluxo do Customer Portal exercido com dados reais (Phase 2).
- ✅ Fluxo do Platform Admin revalidado após correção de grants.

---

## Resumo de bloqueios

| Prioridade | Item | Bloqueia piloto? |
|---|---|---|
| P1 | E-mail real ausente | **Sim** |
| — | Staging remoto real ausente | Gap operacional, não é bug de código |
| — | Monitoramento externo ausente | Gap operacional |
| P2 | Gap Offer → Opportunity | Não (workaround real já em uso) |
| P3 | `role="alert"` ausente em telas secundárias | Não |
| P3 | Verbosidade de log em erro de conexão pg | Não |
