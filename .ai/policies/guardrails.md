# Guard Rails Policy

## Objetivo
Implementar proteção automática contra comandos destrutivos e perigosos.

## Camada de Proteção

Antes de executar qualquer comando, validar contra lista de padrões perigosos:

### Comandos Destrutivos - BLOQUEADOS

#### Filesystem
```bash
rm              # Remove files/directories
rm -rf          # Força remover recursivamente
rmdir           # Remove directories
shred           # Sobrescreve dados
dd              # Disk dump - cópia byte-to-byte
```

#### Database
```bash
drop database   # Deleta banco inteiro
drop table      # Deleta tabela
truncate        # Remove todos registros
delete from *   # Delete sem WHERE
```

#### Git
```bash
git reset --hard    # Descarta mudanças local
git push --force    # Força push (altera histórico)
git rebase --force  # Força rebase
git clean -fd       # Remove arquivos não rastreados
```

#### Docker
```bash
docker system prune  # Remove volumes, images, containers não usados
docker rmi           # Remove imagens
docker volume rm     # Remove volumes
docker container rm  # Remove containers
```

#### Kubernetes
```bash
kubectl delete namespace    # Deleta namespace
kubectl delete pod --all    # Deleta todos pods
kubectl patch secret        # Modifica secrets
```

#### Infrastructure
```bash
terraform destroy   # Deleta infraestrutura
gcloud projects delete   # Deleta projeto GCP
aws ec2 terminate-instances  # Termina instâncias AWS
```

## Protocolo de Proteção

### 1. Detecção
- Interceptar comando ANTES de executar
- Validar contra regex patterns de comandos perigosos
- Case-insensitive matching

### 2. Validação
- Se comando matches padrão perigoso:
  - ❌ BLOQUEAR imediatamente
  - ⚠️ Exigir confirmação EXPLÍCITA
  - 📝 Log do comando solicitado (auditoria)

### 3. Confirmação
```
⚠️ COMANDO PERIGOSO DETECTADO

Comando: rm -rf /path/to/data
Risco: Apagará tudo recursivamente

Digite a senha de confirmação ou "CONFIRMO" para continuar:
```

### 4. Auditoria
- Log todos os comandos bloqueados
- Log confirmações de comandos perigosos
- Incluir timestamp e contexto
- Arquivo: `.ai/logs/guardrails-audit.log`

## Padrões de Detecção

```javascript
const DESTRUCTIVE_PATTERNS = [
  // Filesystem
  /\brm\s+-rf\b/i,
  /\brm\b/i,
  /\brmdir\b/i,

  // Database
  /\bdrop\s+(database|table|view|schema)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from.*(?<!where)/i,

  // Git
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+rebase\s+--force\b/i,
  /\bgit\s+clean\s+-fd\b/i,

  // Docker
  /\bdocker\s+system\s+prune\b/i,
  /\bdocker\s+(rmi|volume\s+rm|container\s+rm)\b/i,

  // Kubernetes
  /\bkubectl\s+delete\s+(namespace|pod|all)\b/i,

  // Infrastructure
  /\bterraform\s+destroy\b/i,
  /\b(gcloud|aws)\s+.*\s+delete\b/i,
];
```

## Whitelist (Exceções)

Alguns contextos podem ser seguros:

```javascript
const SAFE_CONTEXTS = [
  // Comentários não executam
  { pattern: /^#/, type: 'comment' },

  // Documentação/exemplos
  { pattern: /```/, type: 'code-block' },
  { pattern: /echo|cat|grep.*rm/, type: 'text-output' },

  // Commands específicas seguras
  { pattern: /rm --help/, type: 'help' },
  { pattern: /git reset --hard origin\/main/, context: 'revertTo', safe: true },
];
```

## Integração com Sistema

### No Terminal
Antes de `run_in_terminal`:
```typescript
async function executeCommand(command: string) {
  const threat = detectThreat(command);

  if (threat.level === 'CRITICAL') {
    return await requestConfirmation(command, threat);
  }

  if (threat.level === 'HIGH') {
    console.warn(`⚠️ ${threat.message}`);
  }

  return executeWithAudit(command);
}
```

### Antes de File Operations
- Delete operations: Requer confirmação
- Move/rename de production files: Requer confirmação
- Overwrite existing files: Aviso

### Em Database Operations
- DROP/TRUNCATE: Requer confirmação
- DELETE sem WHERE: Bloquear
- Alter table estrutura: Requer confirmação

## Configuração por Ambiente

### Development
- ✅ Mais permissivo
- ⚠️ Avisos sobre commands
- 📝 Auditoria local

### Staging
- ⚠️ Requer confirmação
- 📞 Notifica team
- 🔐 Auditoria remota

### Production
- 🛑 Máximo restritivo
- 📞 Requer aprovação de 2+ pessoas
- 🔐 Auditoria obrigatória
- 🚨 Alertas em tempo real

## Resposta a Ameaças

```
THREAT_LEVEL_CRITICAL = "BLOQUEAR E ALERTAR"
THREAT_LEVEL_HIGH = "REQUER CONFIRMAÇÃO"
THREAT_LEVEL_MEDIUM = "AVISAR"
THREAT_LEVEL_LOW = "PERMITIR"
```

## Overrides Seguro

Apenas para situações extremas:

```bash
# Requer múltiplas confirmações
FORCE_OVERRIDE=true CONFIRM_DESTRUCTIONS=I_UNDERSTAND_THE_RISKS command
```

## Monitoramento

Rastrear:
- Comandos bloqueados
- Confirmações dadas
- Executados com sucesso
- Execuções falhadas
- Padrões de uso

Arquivo de auditoria:
```json
{
  "timestamp": "2026-08-17T10:30:00Z",
  "command": "rm -rf /production",
  "threat_level": "CRITICAL",
  "action": "BLOCKED",
  "user": "agent-name",
  "environment": "production"
}
```

## Verificações de Implementação

- [ ] Padrões de detecção configurados
- [ ] Confirmação interativa funciona
- [ ] Auditoria gravando eventos
- [ ] Whitelist revisado
- [ ] Testes em development
- [ ] Testes em staging
- [ ] Production configurado
- [ ] Team alertado
