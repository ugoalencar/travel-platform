# Guard Rails Hooks

Hooks de segurança para proteger contra comandos destrutivos.

## Arquivos

### `guardrails-hook.js`

Hook executável que valida comandos antes de executá-los.

**Características:**
- ✅ Detecta comandos perigosos
- ✅ Múltiplos níveis de ameaça (LOW, MEDIUM, HIGH, CRITICAL)
- ✅ Confirmação interativa por nível
- ✅ Diferente por ambiente (dev/staging/prod)
- ✅ Auditoria completa em `.ai/logs/guardrails-audit.log`
- ✅ Contextos seguros permitidos

**Uso Direto:**

```bash
# Testar detecção
node .ai/hooks/guardrails-hook.js "rm -rf /"

# Com environment específico
ENVIRONMENT=production node .ai/hooks/guardrails-hook.js "terraform destroy"

# Ver auditoria
node .ai/hooks/guardrails-hook.js --audit
```

**Integração com Node.js:**

```javascript
const guardrails = require('./.ai/hooks/guardrails-hook.js');

// Validar comando
const result = await guardrails.validateCommand('rm -rf /data', 'production');

if (result.approved) {
  // Executar comando
  console.log('✅ Comando aprovado');
} else {
  // Bloquear comando
  console.log('❌ Comando bloqueado:', result.reason);
}

// Ver auditoria
guardrails.showAuditReport(50);
```

## Níveis de Ameaça

### 🟢 SAFE
- Não requer confirmação
- Exemplos: `echo`, `cat`, `grep`, `ls`

### 🟡 MEDIUM
- ⚠️ Aviso no console
- Permitido em dev
- Bloqueado em staging/production
- Exemplos: `rm`, `rmdir`, `docker rmi`

### 🟠 HIGH
- ❓ Requer confirmação
- Bloqueado em staging/production
- Aviso em dev
- Exemplos: `git reset --hard`, `git clean -fd`, `drop table`

### 🔴 CRITICAL
- 🛑 Tripla confirmação (comando + motivo + confirmação)
- Bloqueado em production
- Confirmação em todos ambientes
- Exemplos: `rm -rf`, `DROP DATABASE`, `git push --force`

## Confirmações por Ambiente

### Development
```
MEDIUM → Aviso (permitido)
HIGH/CRITICAL → Confirmação simples
```

### Staging
```
MEDIUM → Aviso
HIGH → Confirmação
CRITICAL → Bloqueado (exceto com aprovação)
```

### Production
```
CRITICAL → Bloqueado automaticamente
Exceções: Requer override e notificação
```

## Auditoria

Todos os eventos são registrados em:
```
.ai/logs/guardrails-audit.log
```

**Formato:**
```json
{
  "timestamp": "2026-08-17T10:30:00.000Z",
  "command": "rm -rf /production",
  "action": "BLOCKED",
  "result": "CRITICAL",
  "environment": "production",
  "pid": 12345
}
```

**Visualizar auditoria:**
```bash
# Ver últimas 50 linhas
tail -50 .ai/logs/guardrails-audit.log

# Ver bloqueios
grep "BLOCKED" .ai/logs/guardrails-audit.log

# Ver production
grep "production" .ai/logs/guardrails-audit.log

# Análise com jq
cat .ai/logs/guardrails-audit.log | jq '.[] | select(.result == "BLOCKED")'
```

## Padrões Detectados

### ❌ CRITICAL (Bloqueados)
```bash
rm -rf /path          # Remove recursivo
dd if=/dev/zero of=   # Disk dump
DROP DATABASE name    # Deleta banco
TRUNCATE TABLE name   # Remove registros
git push --force      # Força push
git reset --hard main # Reset main
terraform destroy     # Destruir infra
docker volume rm vol  # Remove volume
kubectl delete ns     # Deleta namespace
gcloud projects delete # Deleta projeto GCP
```

### ⚠️ HIGH
```bash
rm /file              # Remove arquivo
git reset --hard      # Reset
git clean -fd         # Remove não rastreados
git branch -D branch  # Delete branch
DROP TABLE name       # Delete tabela
docker system prune   # Prune Docker
kubectl delete pod --all  # Delete pods
```

### 🔸 MEDIUM
```bash
rmdir dir             # Remove dir
docker rmi image      # Remove image
shred /file           # Sobrescreve
```

## Contextos Seguros (Whitelist)

Estes comandos SÃO permitidos mesmo que contenham palavras-chave perigosas:

```bash
rm --help             # Help não executa
git --help            # Help não executa
echo "rm -rf"         # Apenas texto
grep "rm" file        # Buscar padrão
rm /tmp/cache         # Temp directory
rm ./.temp/file       # Local temp
find . -name "*.rm"   # Buscar arquivos
cat .gitignore        # Ver conteúdo
```

## Exemplos de Fluxo

### Exemplo 1: Comando Seguro
```
$ node .ai/hooks/guardrails-hook.js "ls -la"

✅ Comando aprovado
(exit 0)
```

### Exemplo 2: Ameaça MEDIUM
```
$ node .ai/hooks/guardrails-hook.js "rm /file"

⚠️ Aviso: Remove arquivos
📋 Comando: rm /file

Tem certeza? (S/N): S
✅ Comando aprovado
(exit 0)
```

### Exemplo 3: Ameaça HIGH
```
$ node .ai/hooks/guardrails-hook.js "git push --force"

🛑 COMANDO PERIGOSO DETECTADO

📋 Comando: git push --force
⚡ Risco: Força push - altera histórico

Digite "CONFIRMO" para continuar (ou Enter para cancelar):
> CONFIRMO
✅ Comando aprovado com confirmação
(exit 0)
```

### Exemplo 4: Ameaça CRITICAL (Bloqueada)
```
$ ENVIRONMENT=production node .ai/hooks/guardrails-hook.js "rm -rf /"

🛑 ⚠️ COMANDO CRÍTICO BLOQUEADO ⚠️

📋 Comando: rm -rf /
⚡ Risco: Remove recursivo forçado
📊 Ambiente: production

❌ Comando CRÍTICO bloqueado em PRODUCTION
(exit 1)
```

### Exemplo 5: CRITICAL com Confirmação Tripla
```
$ node .ai/hooks/guardrails-hook.js "DROP DATABASE production_db"

🛑 ⚠️ COMANDO CRÍTICO DETECTADO ⚠️

📋 Comando: DROP DATABASE production_db
⚡ Risco: Deleta banco/schema
📂 Categoria: database

Passo 1 - Digite o comando completo para confirmar:
> DROP DATABASE production_db

Passo 2 - Motivo da operação (mínimo 10 caracteres):
> Migração de dados completa, backup feito

Passo 3 - Digite "ENTENDO OS RISCOS" para confirmar:
> ENTENDO OS RISCOS

✅ Comando aprovado com confirmação tripla
(exit 0)
```

## Integração com Agente

### Antes de `run_in_terminal`

```typescript
import guardrails from './.ai/hooks/guardrails-hook.js';

async function runCommandSafely(command: string) {
  const environment = process.env.ENVIRONMENT || 'development';

  // Validar comando
  const result = await guardrails.validateCommand(command, environment);

  if (!result.approved) {
    throw new Error(`Comando bloqueado: ${result.reason}`);
  }

  // Executar comando
  return await run_in_terminal({
    command,
    explanation: `Executando: ${command}`,
    goal: 'Executar comando validado',
  });
}

// Uso
await runCommandSafely('rm /tmp/cache');
```

## Configuração Global

**Adicionar ao `.instructions.md` ou agente principal:**

```markdown
## Guard Rails Automáticos

Antes de executar qualquer comando:

1. Validar contra padrões perigosos
2. Se CRITICAL/HIGH: solicitar confirmação
3. Registrar em auditoria
4. Executar apenas se aprovado

Localização: `.ai/hooks/guardrails-hook.js`
Auditoria: `.ai/logs/guardrails-audit.log`
```

## Manutenção

- ✅ Revisar auditoria regularmente
- ✅ Atualizar padrões conforme necessário
- ✅ Testar em cada ambiente
- ✅ Documentar exceções
- ✅ Notificar equipe de mudanças

---

**Segurança > Velocidade. Melhor pedir permissão que pedir desculpas.**
