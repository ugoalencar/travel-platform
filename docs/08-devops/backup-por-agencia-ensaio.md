# Backup por agência (BAK-01) — registro do ensaio automatizado

Data: 2026-10-24. Banco: PostgreSQL descartável local (contêiner próprio, derrubado ao fim; não é o demo, nem a 55438, nem ambiente online).

Teste: `tests/integration/database/tenant-backup.integration.test.ts` (`npm run test:db`).
Fluxo comprovado: semear agências A e B → exportar A (cifrado) → verificar (dry-run, sem escrita) → apagar as tabelas do manifesto de A → restaurar com `restoreBackupInto` → contagens e SHA-256 por tabela idênticos ao manifesto → B inalterada; recusas: restauração sobre dados existentes, schema diferente, tabela adulterada (rollback sem escrita parcial), arquivo de outra agência.

**Limite desta prova:** é um ensaio automatizado em banco descartável, com manifesto parcial. O ensaio humano registrado (data, operador, contagens) em um banco novo autorizado, exigido pelo desenho, **ainda não foi feito**.

## Ampliação D11 — 2026-10-25 — NAO EXECUTADO

O teste ampliado cobre todas as tabelas classificadas, regras versionadas/faixas, atribuições com identidade, folha, contas a pagar, recebíveis/alocações, recebimentos/estornos, condições e histórico, receita e lotes, permissões e importação. A prova compara contagens e hashes de A e B, totais de vendas, recebíveis, contas a pagar, caixa, alocações, comissões, folha e receita; inclui o ciclo de FKs entre item, conta a pagar, comissão e receita. Exercita também o relatório e a restauração pela API. A migration 115 é necessária.

Nenhum teste de banco desta ampliação foi executado nesta rodada. O ensaio anterior não valida estes novos caminhos.

Preparação assistida: provisionar em banco descartável a mesma agência e identidades/referências excluídas com os mesmos IDs; manter todas as tabelas incluídas vazias. Acessar Configurações → Backup como OWNER, selecionar arquivo e senhas, verificar contagens/conflitos e então restaurar. Um destino com dados é recusado e não é apagado. Arquivos binários de storage exigem recuperação separada. Documentação da decisão: [ADR-011](../adr/ADR-011-full-backup-assisted-recovery.md).
