# Relatório Onda F2 — Lite da F1 e BAK-01 (backup operacional por agência, Full)

Sem commit/push/deploy. Contêineres de teste próprios, derrubados. Demo, 55438, Supabase, Render, Vercel e Gadotti intocados.

## 1. Lite da F1 (paridade com o Full) — FEITO
- Dashboard do Lite com concorrência otimista como no Full: migration `017_dashboard_settings_version.sql` (`version`), `GET /dashboard/settings` devolve `version` (0 sem linha), `PUT` exige `version` (400 sem ela) e responde 409 se obsoleta ou em corrida; a UI do Lite envia a versão. Testes em `services/api-lite/tests/access.test.ts`.
- Suíte Lite completa (55600): 43 arquivos / 450 testes ✔; travel-lite 193 ✔; lint/typecheck/build ✔. (Uma execução intermediária falhou por interferência de outra sessão no mesmo banco 55600; reexecutada isolada, passou.)
- Fica fora, por decisão: `commissions-projection` no Lite (a liberação de comissão do Lite segue outro caminho; não criar função nova sem equivalente validado).

## 2. BAK-01 (Full) — FEITO EM ESCOPO PARCIAL, declarado como tal
**Arquivos novos:** `services/api/src/{tenant-backup-crypto,tenant-backup,tenant-backup-pending}.ts`, `routes/backup.ts`; testes `services/api/tests/tenant-backup-crypto.test.ts` (7), `tests/integration/database/tenant-backup.integration.test.ts` (14); `docs/adr/ADR-010-backup-operacional-por-agencia-full.md`, `docs/08-devops/backup-por-agencia-ensaio.md`.
**Editados (pontuais):** `app.ts`, `audit-log.ts` (`BACKUP_EXPORTED/EXPORT_DENIED/VERIFIED`), `permissions/permission-catalog.ts` (`backup:export`, não delegável), docs do Lite (25→28 tabelas).

**Comportamento**
- `POST /settings/backup/export`, `POST /settings/backup/verify`, `GET /settings/backup/status`: **somente OWNER** (papel exato; ADMIN/AGENT → 403), `no-store`. Export e verify exigem a senha atual (step-up) e senha própria do arquivo (12–200, diferente da de acesso); 3 tentativas/15 min (429); senha errada → 403 genérico + `BACKUP_EXPORT_DENIED`; **usuário com MFA inscrito não exporta** (sem bypass); corpo com campos extras (`agencyId`) → 400.
- Arquivo `travel-platform-encrypted-v1`: AES-256-GCM + scrypt (N=131072), AAD = agência, `kdfParams` do arquivo limitados (sem exaustão por arquivo forjado), formato do Lite recusado. Devolvido na resposta, nunca gravado no servidor; falha da auditoria obrigatória → nenhum arquivo. Auditoria sem senha, conteúdo ou CPF.
- Manifesto (12 tabelas operacionais, ordem por FK, SHA-256 canônico por tabela, leitura em um único comando = um snapshot): clientes, fornecedores, vendas, itens, recebíveis, pagamentos, alocações, receita da agência (3), configuração de campos, layout do dashboard. Colunas com `secret|token|password|credential|api_key` barradas; `users`, sessões, tokens, MFA e `audit_logs` excluídos com motivo. **Teste de completude**: toda tabela com `agency_id` precisa estar incluída, excluída com motivo ou em `PENDING_INVENTORY` — hoje **132 tabelas pendentes de inventário (B0)**; a API devolve `scope: PARTIAL` e a lista.
- Verificação (dry-run): decifra, confere agência, hashes e fingerprint de schema, compara com os dados vivos e **não escreve**; arquivo adulterado, senha errada ou arquivo de outra agência → 422.
- Restauração: **sem endpoint**. `restoreBackupInto` (procedimento assistido) só para agência com as tabelas do manifesto vazias, transação única, confere contagem e hash por tabela antes do commit; recusa schema diferente, tabela adulterada (rollback sem escrita parcial) e arquivo de outra agência.

**Recuperação comprovada (ida e volta, banco descartável):** semear A e B → exportar A → apagar A → restaurar → contagens e hashes por tabela iguais ao manifesto → B inalterada. Registro em `docs/08-devops/backup-por-agencia-ensaio.md`.

## 3. Gates
| Gate | Resultado |
|---|---|
| `test:db` completo (8 arquivos, contêiner 55636) | **114/114 ✔** |
| `services/api` typecheck / build / testes novos | OK / OK / 24 ✔ |
| Lint dos arquivos novos | OK |
| Suíte completa do Full API | não rodada isolada (regra da coordenação) |

## 4. Decisões adotadas por padrão
Manifesto parcial com pendências explícitas (em vez de fingir completude); MFA inscrito bloqueia a exportação até existir step-up TOTP; fingerprint de schema = hash de (tabela, coluna, tipo) via `pg_catalog` (não depende de registro manual de migrations nem de grants); limite 25 MiB; limitador em memória (documentado); restauração só por procedimento assistido.

## 5. Não feito / pendente
- **Revisão do Codex** do BAK-01 não executada nesta etapa (priorizei implementação e testes dentro do limite de sessão); recomendado antes de aceitar.
- Inventário B0 das 132 tabelas; script `infrastructure/ops/restore_tenant.sh`; segundo aprovador e eventos `RESTORE_*` da plataforma; restauração sobre agência com dados; UI (`BackupSection`) e `route-inventory`.
- Ensaio humano registrado em banco novo autorizado (só há o ensaio automatizado).
- Backup agendado/destino externo (continua "não configurado").
- Lite: apenas a correção documental 25→28; sem mudança de código (o contrato do Full é mais forte; adotar KDF/hash por tabela no Lite fica para depois).
- **IMP-01** (importação de vendas conciliada) não iniciada.
