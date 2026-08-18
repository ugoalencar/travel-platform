# Destructive Commands Checklist

## ⚠️ COMANDOS BLOQUEADOS - Requer Confirmação Explícita

Use este checklist antes de executar comandos potencialmente destrutivos.

### Filesystem Operations

- [ ] `rm` - Remove arquivos
  - Perigo: Remoção permanente
  - Confirmação: SIM

- [ ] `rm -rf` - Recursivo forçado
  - Perigo: ⚠️ CRÍTICO - Remove tudo recursivamente
  - Confirmação: SIM (dupla confirmação)

- [ ] `rmdir` - Remove diretórios
  - Perigo: Estrutura perdida
  - Confirmação: SIM

- [ ] `shred` - Sobrescreve dados
  - Perigo: Dados irrecuperáveis
  - Confirmação: SIM

- [ ] `dd` - Disk dump
  - Perigo: ⚠️ CRÍTICO - Pode destruir disco
  - Confirmação: SIM (tripla confirmação)

### Database Operations

- [ ] `DROP DATABASE` - Deleta banco inteiro
  - Perigo: ⚠️ CRÍTICO - Perda total de dados
  - Confirmação: SIM (tripla confirmação)
  - Backup verificado: SIM

- [ ] `DROP TABLE` - Deleta tabela
  - Perigo: Dados perdidos
  - Confirmação: SIM
  - Backup verificado: SIM

- [ ] `TRUNCATE TABLE` - Remove todos registros
  - Perigo: Sem WHERE - tudo é removido
  - Confirmação: SIM
  - Backup verificado: SIM

- [ ] `DELETE FROM (sem WHERE)` - Delete sem filtro
  - Perigo: Remove TODOS registros
  - Confirmação: SIM
  - Verificação: Sempre usar WHERE clause

### Git Operations

- [ ] `git reset --hard` - Descarta mudanças
  - Perigo: Trabalho local perdido
  - Confirmação: SIM
  - Branches seguras: main, master (extra cuidado)

- [ ] `git push --force` - Força push
  - Perigo: ⚠️ CRÍTICO - Altera histórico remoto
  - Confirmação: SIM (tripla confirmação)
  - Apenas: Feature branches (NUNCA main/master)

- [ ] `git rebase --force` - Força rebase
  - Perigo: Histórico alterado
  - Confirmação: SIM

- [ ] `git clean -fd` - Remove não rastreados
  - Perigo: Arquivos não salvos perdidos
  - Confirmação: SIM

- [ ] `git branch -D` - Força delete branch
  - Perigo: Código perdido se não mergeado
  - Confirmação: SIM

### Docker Operations

- [ ] `docker system prune` - Limpa tudo não usado
  - Perigo: Imagens, containers, volumes
  - Confirmação: SIM
  - Volumes específicos: Nunca -a

- [ ] `docker rmi` - Remove imagens
  - Perigo: Imagem perdida
  - Confirmação: SIM

- [ ] `docker volume rm` - Remove volume
  - Perigo: ⚠️ CRÍTICO - Dados persistidos perdidos
  - Confirmação: SIM (tripla confirmação)
  - Backup: SIM

- [ ] `docker container rm` - Remove container
  - Perigo: Estado perdido
  - Confirmação: SIM

### Kubernetes Operations

- [ ] `kubectl delete namespace` - Deleta namespace inteiro
  - Perigo: ⚠️ CRÍTICO - Tudo no namespace deletado
  - Confirmação: SIM (tripla confirmação)

- [ ] `kubectl delete pod --all` - Deleta todos pods
  - Perigo: Serviço cai
  - Confirmação: SIM

- [ ] `kubectl patch secret` - Modifica secrets
  - Perigo: Aplicação quebrada
  - Confirmação: SIM

### Infrastructure as Code

- [ ] `terraform destroy` - Deleta infraestrutura
  - Perigo: ⚠️ CRÍTICO - Recursos destruídos
  - Confirmação: SIM (tripla confirmação)
  - Backup state: SIM
  - Apenas: Dev/staging

- [ ] `gcloud projects delete` - Deleta projeto GCP
  - Perigo: ⚠️ CRÍTICO - Projeto inteiro
  - Confirmação: SIM (quadrupla confirmação)
  - Apenas: Dev

- [ ] `aws ec2 terminate-instances` - Termina instâncias
  - Perigo: Serviço offline
  - Confirmação: SIM
  - Apenas: Dev/staging

## ✅ PROCESSO DE CONFIRMAÇÃO

### Level 1: Avisos (MEDIUM Threat)
1. ⚠️ Mostrar comando
2. ℹ️ Mostrar risco
3. ❓ Perguntar: Tem certeza? (S/N)

### Level 2: Confirmação (HIGH Threat)
1. 🛑 COMANDO PERIGOSO DETECTADO
2. 📋 Listar comando completo
3. 📊 Mostrar risco específico
4. ❓ Digitar "CONFIRMO" para continuar
5. 🔐 Validar confirmação

### Level 3: Dupla Confirmação (CRITICAL Threat)
1. 🛑 ⚠️ COMANDO CRÍTICO
2. 📋 Listar comando e todas consequências
3. ❓ Primeira confirmação: Digitar comando completo
4. ❓ Segunda confirmação: Digitar motivo (business case)
5. 🔐 Validar ambas
6. 📞 Opcionalmente: Notificar equipe
7. 🎯 Executar com auditoria completa

## 📝 AUDITORIA

Cada comando bloqueado/confirmado registra:
- Timestamp
- Comando completo
- Usuário/Agent
- Ambiente (dev/staging/prod)
- Threat level
- Ação (bloqueado/confirmado/executado)
- Resultado (sucesso/falha)

Localização: `.ai/logs/guardrails-audit.log`

## 🚀 EXCEÇÕES PERMITIDAS

### Desenvolvimento Local
- Development: Menos restritivo
- Staging: Moderado
- Production: Máximo restritivo

### Exemplos de Contexto Seguro
- `rm` em diretório temporário (`/tmp`, `.temp`)
- `docker system prune` em dev local
- `git reset` em branch feature pessoal
- Testes automatizados com mock data

## 🔒 REGRAS UNIVERSAIS

1. ❌ NUNCA executar em production sem aprovação
2. ❌ NUNCA ignorar avisos de segurança
3. ❌ NUNCA usar `--force` sem entender
4. ❌ NUNCA com dados do cliente
5. ✅ SEMPRE backup antes de operações destrutivas
6. ✅ SEMPRE testar em dev primeiro
7. ✅ SEMPRE comunicar com time
8. ✅ SEMPRE manter logs de auditoria

## 📊 Matriz de Risco

| Comando | Dev | Staging | Prod | Ação |
|---------|-----|---------|------|------|
| rm | Avisar | Avisar | BLOQUEAR | Confirmação |
| rm -rf | Avisar | BLOQUEAR | BLOQUEAR | Dupla Confirmação |
| DROP DATABASE | BLOQUEAR | BLOQUEAR | BLOQUEAR | Admin + Backup |
| git push --force | Avisar | BLOQUEAR | BLOQUEAR | Tripla Confirmação |
| docker system prune | Permitir | Avisar | BLOQUEAR | Confirmação |
| terraform destroy | BLOQUEAR | BLOQUEAR | BLOQUEAR | Admin + Team |

---

**Antes de executar qualquer comando desta lista, PARE e revise este checklist.**

**Dúvidas? Pergunte ao time. Segurança em primeiro lugar.**
