# Checklist de Prontidão para Piloto — Travel Platform

Referência: `docs/release/RELEASE_CANDIDATE_VALIDATION.md` (evidências completas). Commit validado: `cbd8fbf5ba0a949a5cc753f530602d057effd765` (integração real do Resend — CI verde no run `35376395447`).

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

- ✅ **Resolvido.** Provedor real (Resend) integrado via abstração desacoplada (`services/api/src/email`). Convite de funcionário, reset de senha (staff e cliente) e ativação do Portal do Cliente agora disparam envio real. Comportamento fail-closed confirmado (produção/staging sem credencial lança `EMAIL_PROVIDER_NOT_CONFIGURED`, nunca finge sucesso). Testes de integração reais confirmaram os 3 dos 4 fluxos disparando o provedor corretamente (convite, forgot-password staff, forgot-password cliente); o 4º (ativação do Portal do Cliente) tem a função de e-mail testada isoladamente com sucesso, mas sem teste de integração dedicado nesta rodada. Ver `docs/operations/EMAIL_PROVIDER_RESEND.md`.
- ⚠️ **Pendência real remanescente:** o envio real para uma caixa postal de verdade depende de uma `RESEND_API_KEY` real e de um domínio verificado, que esta sessão não possui — isso é uma decisão/credencial externa do proprietário do produto, não um bug de código. Até essa credencial ser configurada, o ambiente de staging local (que já roda com `NODE_ENV=production`) falha de propósito (fail-closed) em qualquer tentativa real de envio.

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
| — | E-mail real | **Resolvido** — provedor Resend integrado, fail-closed confirmado. Pendência remanescente: credencial real (`RESEND_API_KEY`) e domínio verificado, a fornecer externamente. |
| — | Staging remoto real ausente | Gap operacional, não é bug de código |
| — | Monitoramento externo ausente | Gap operacional |
| P2 | Gap Offer → Opportunity | Não (workaround real já em uso) — conhecido, não corrigido nesta rodada |
| P3 | `role="alert"` ausente em telas secundárias | Não — conhecido, não corrigido nesta rodada |
| P3 | Verbosidade de log em erro de conexão pg | Não — conhecido, não corrigido nesta rodada |

**P0 abertos: 0. P1 abertos: 0.**
