# Validação de Backup e Restore — Travel Platform

Executado ao vivo contra o banco de staging local (`travel-platform-postgres-staging`, PostgreSQL 15.18), como parte da validação do Release Candidate. Backup sem restore testado não é considerado backup validado — por isso ambos foram executados na mesma sessão, não apenas planejados.

## Backup

Comando real executado:

```bash
docker exec travel-platform-postgres-staging pg_dump \
  -U travel_staging_admin -d travel_platform_staging -Fc -f /tmp/backup_staging.dump
```

**Resultado:**
- Arquivo criado: ✅
- Tamanho: **1.078.364 bytes** (não vazio) ✅
- Formato: `pg_dump` custom format (`-Fc`), formato binário conhecido e restaurável via `pg_restore` ✅
- Timestamp de criação: `2026-09-18 15:47 UTC` (confirmado via `ls -la` dentro do container)

Arquivo copiado do container para o host (fora do Git — **não commitado**, conforme instrução explícita desta rodada de nunca colocar backup com dados reais dentro do repositório).

**Retenção:** não documentada nesta rodada porque depende do ambiente real do piloto, que ainda não existe (ver GAP OPERACIONAL de staging remoto em `docs/release/RELEASE_CANDIDATE_VALIDATION.md`). Este backup de teste foi descartado após a validação.

## Restore

Banco descartável criado especificamente para o teste (`restore_test`, na mesma instância Postgres de staging, separado do banco real):

```bash
docker exec travel-platform-postgres-staging psql -U travel_staging_admin -d postgres \
  -c "CREATE DATABASE restore_test;"
docker exec travel-platform-postgres-staging pg_restore \
  -U travel_staging_admin -d restore_test /tmp/backup_staging.dump
```

**Resultado:** restauração concluída sem nenhum erro (`exit code 0`).

## Validações pós-restore

| Verificação | Esperado | Obtido | Status |
|---|---|---|---|
| Contagem de tabelas em `public` | 157 (igual ao original) | **157** | ✅ |
| RLS habilitado em tabela tenant (`customers`) | `relrowsecurity=true` | **`t`** | ✅ |
| `FORCE` RLS em `customers` | `relforcerowsecurity=true` | **`t`** | ✅ |
| Agências restauradas | > 0 | **26** | ✅ |
| Clientes restaurados | > 0 | **11** | ✅ |
| Clientes órfãos (FK `customers.agency_id → agencies.id` quebrado) | 0 | **0** | ✅ |

## Smoke test funcional no banco restaurado

Executado com a role de runtime real (`travel_app_runtime_local`), não com o usuário admin — para testar exatamente o comportamento que a aplicação real teria:

```sql
-- Sem contexto de tenant definido
SELECT count(*) FROM customers;
-- Resultado: 0  (RLS fail-closed corretamente aplicado — nenhum dado vaza sem contexto)

-- Com contexto de tenant real (Agência A, "Horizonte Viagens")
SELECT set_tenant_context('9bf3b747-288e-47c4-a96a-4d579ea6b0e4', NULL);
SELECT count(*) FROM customers;
-- Resultado: 8  (contagem real e correta dos clientes daquele tenant)
```

**Conclusão:** o banco restaurado se comporta de forma idêntica ao banco original em relação a RLS — fail-closed sem contexto, correto com contexto real. Relacionamentos e integridade referencial preservados.

## Limpeza

Banco de teste `restore_test` removido após a validação (`DROP DATABASE restore_test;`). Arquivo de backup de teste mantido apenas no scratchpad local da sessão, não commitado no repositório.

## Veredito

**Backup e restore validados com sucesso.** Nenhum bloqueio encontrado nesta fase. A única pendência é operacional, não técnica: definir e documentar a política real de retenção/armazenamento de backups quando o ambiente de piloto real (fora desta máquina) existir.
