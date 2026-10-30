# ADR-010 — Backup operacional por agência no Full (BAK-01)

Status: aceito; aditivo de backup gerenciado aprovado em 2026-10-28. Decisão original: adotada por padrão, usuário ausente. Data: 2026-10-24.
Contrato: `.claude/DESENHO-SEC01-BAK01-DASH01-2026-10-24.md`, Parte 2.

Atualização D11 em 2026-10-25: [ADR-011](ADR-011-full-backup-assisted-recovery.md) substitui o inventário parcial e acrescenta a interface de restauração assistida solicitada pelo usuário. Os limites abaixo descrevem a implementação original.

## Decisão
- Exportação por agência, **somente OWNER** (papel exato), chave `(backup, export)` não delegável (SEC-01), com
  reautenticação por senha (step-up), limite de 3 tentativas por 15 min (memória do processo; multi-instância exige contador compartilhado) e **recusa de usuário com MFA inscrito** (falha fechada, sem bypass; o step-up TOTP fica para uma etapa seguinte).
- Arquivo `travel-platform-encrypted-v1`: AES-256-GCM, scrypt (N=131072, r=8, p=1; o leitor só aceita parâmetros dentro de limites), AAD = agência; devolvido na resposta, `no-store`, **nunca gravado no servidor**. Falha ao gravar a auditoria obrigatória → nenhum arquivo.
- Manifesto **parcial** em código (`BACKUP_TABLES`, ordem de restauração por FK) com hash SHA-256 canônico por tabela. Toda tabela com `agency_id` precisa estar em `BACKUP_TABLES`, `EXCLUDED_WITH_REASON` ou `PENDING_INVENTORY` (teste de banco falha para tabela nova sem classificação). A API informa `scope: PARTIAL` e a lista pendente: **não declarar backup completo**.
- Nunca exportado: credenciais, sessões, tokens, MFA, `audit_logs` (só o evento). Colunas com `secret|token|password|credential|api_key` no nome são barradas no manifesto.
- `POST /settings/backup/verify`: dry-run (decifra, confere agência, hashes e fingerprint de schema, compara com os dados vivos); não escreve nada.
- **Não há restauração self-service.** `restoreBackupInto` é a função de domínio do procedimento assistido do operador: só para agência com as tabelas do manifesto vazias, transação única, confere contagem e hash por tabela antes do commit, recusa schema diferente e arquivo de outra agência.
- Fingerprint de schema = hash de (tabela, coluna, tipo) das tabelas do manifesto (pg_catalog), independente de grants.

## Limites
- Arquivos binários de storage não vão no arquivo (só metadados). Sem backup agendado nem destino externo (`automatic.configured=false`).
- Inventário B0 incompleto (132 tabelas pendentes). Limite de 25 MiB de JSON.
- Restauração sobre agência com dados e segundo aprovador/eventos `RESTORE_*` da plataforma: não implementados.

## Aditivo de decisão — 2026-10-28

O usuário aprovou a continuidade somente no Travel Platform Full e definiu armazenamento gerenciado com download manual. O limite antigo que excluía agendamento é substituído pelos seguintes pontos, sem retirar a exportação manual por senha:

- A migration 118 cria agenda e histórico por agência com RLS forçada; o worker separado consulta apenas candidatos de execução e revalida um OWNER ativo antes de operar com contexto explícito da agência.
- Cópias diárias usam AES-256-GCM com chave versionada mantida fora do banco e são gravadas no armazenamento privado configurado. O bucket e a chave precisam ser configurados por operação antes de ativar o agendamento.
- A interface oferece horário e fuso IANA, status, histórico, download e recuperação assistida. O worker retém 30 dias, preservando sempre o backup concluído mais recente. Erros não incluem dados do arquivo.
- O worker depende de processo persistente supervisionado; a API web não executa o agendamento em memória. Nenhuma interface deve afirmar que houve backup até existir uma execução concluída.
- A migration 118 ainda precisa ser validada/aplicada no banco de release e o worker precisa ser iniciado/supervisionado antes de receber dados reais. Isso não foi feito nesta alteração local.
- O manifesto continua sujeito às exclusões por motivo, incluindo arquivos binários, identidades e segredos. `CLASSIFIED` significa classificado, não que o arquivo cubra infraestrutura ou conteúdo fora do manifesto.
- A exportação CSV usa apenas datasets e colunas allowlisted: vendas, clientes, recebíveis, pagáveis, despesas e receitas da agência. Relações com cliente aparecem quando suportadas pelo dataset. CSV é saída manual, limitada e não substitui o backup de recuperação.
