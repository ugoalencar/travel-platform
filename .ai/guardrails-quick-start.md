# Guard Rails - Guia de Implementação

## 📋 Resumo

Camada de proteção automática contra comandos destrutivos no agente. Impede acidentalmente danificar produção ou perder dados.

## 🚀 Quick Start

### 1. Estrutura Criada

```
.ai/
├── checklists/
│   └── destructive-commands.md      # Checklist de comandos perigosos
├── policies/
│   ├── guardrails.md                # Política de proteção
│   ├── guardrails-implementation.md # Implementação técnica
│   └── README.md                    # Guia de policies
├── hooks/
│   ├── guardrails-hook.js           # Hook executável (Node.js)
│   └── README.md                    # Documentação dos hooks
└── logs/                            # Auditoria de comandos (criada em runtime)
    └── guardrails-audit.log         # Eventos de segurança
```

### 2. Testes Rápidos

Abra um terminal PowerShell:

```powershell
# Teste 1: Comando seguro
cd d:\travel-platform
node .ai\hooks\guardrails-hook.js "echo test"

# Teste 2: Comando MEDIUM (aviso)
node .ai\hooks\guardrails-hook.js "rm test.txt"

# Teste 3: Comando HIGH (confirmação)
# (Será preciso confirmar ou pressionar Ctrl+C)
node .ai\hooks\guardrails-hook.js "git push --force"

# Teste 4: Ver auditoria
cat .ai\logs\guardrails-audit.log | findstr "BLOCKED"
```

### 3. Integração com Agente

Adicionar ao seu agente/prompt principal:

```javascript
// Antes de run_in_terminal
const guardrails = require('./.ai/hooks/guardrails-hook.js');

async function executeCommand(command) {
  const environment = process.env.ENVIRONMENT || 'development';
  const result = await guardrails.validateCommand(command, environment);

  if (!result.approved) {
    throw new Error(`Comando bloqueado: ${result.threat.description}`);
  }

  // Executar comando seguro
  return await run_in_terminal({ command });
}
```

## 🎯 Como Funciona

### Fluxo de Decisão

```
Comando solicitado
    ↓
Detectar ameaça (regex patterns)
    ↓
    ├─ SAFE → ✅ Permitir
    ├─ MEDIUM → ⚠️ Avisar
    ├─ HIGH → ❓ Confirmar
    └─ CRITICAL → 🛑 Bloquear (ou tripla confirmação)
    ↓
Registrar em auditoria
    ↓
Executar ou rejeitar
```

### Níveis de Ameaça

| Nível | Ação | Exemplos |
|-------|------|----------|
| **SAFE** | ✅ Permitir | `echo`, `cat`, `ls` |
| **MEDIUM** | ⚠️ Avisar | `rm`, `rmdir`, `docker rmi` |
| **HIGH** | ❓ Confirmar | `git push --force`, `DROP TABLE` |
| **CRITICAL** | 🛑 Bloquear* | `rm -rf`, `DROP DATABASE`, `dd` |

*Production: bloqueado automaticamente

## 📊 Padrões Detectados

### 🔴 CRITICAL (Tripla Confirmação)
```bash
rm -rf /path                # Remove recursivo forçado
DROP DATABASE name          # Deleta banco inteiro
DROP SCHEMA name            # Deleta schema inteiro
TRUNCATE TABLE name         # Remove todos registros
git push --force            # Força push (altera histórico)
git reset --hard main       # Reset da branch principal
terraform destroy           # Destroi infraestrutura
gcloud projects delete      # Deleta projeto GCP
docker volume rm vol        # Remove volume persistido
kubectl delete namespace    # Deleta namespace inteiro
dd if=/dev/zero of=...      # Disk dump (CRÍTICO)
```

### 🟠 HIGH (Confirmação Simples)
```bash
rm /file                    # Remove arquivo
git reset --hard            # Reset
git clean -fd               # Remove não rastreados
git branch -D branch        # Delete branch forçado
DROP TABLE name             # Deleta tabela
docker system prune         # Remove volumes, imagens
kubectl delete pod --all    # Deleta todos pods
```

### 🟡 MEDIUM (Avisos)
```bash
rmdir dir                   # Remove diretório
docker rmi image            # Remove imagem
shred /file                 # Sobrescreve arquivo
```

## 🔍 Exemplos de Funcionamento

### Exemplo 1: Comando Seguro (Permitido)
```powershell
PS> node .ai\hooks\guardrails-hook.js "echo 'Hello World'"

✅ Comando aprovado
(exit 0)
```

### Exemplo 2: Ameaça MEDIUM (Aviso)
```powershell
PS> node .ai\hooks\guardrails-hook.js "rm test.txt"

⚠️ Aviso: Remove arquivos
📋 Comando: rm test.txt

Tem certeza? (S/N): S
✅ Comando aprovado
```

### Exemplo 3: Ameaça HIGH (Confirmação)
```powershell
PS> node .ai\hooks\guardrails-hook.js "DROP TABLE users"

🛑 COMANDO PERIGOSO DETECTADO

📋 Comando: DROP TABLE users
⚡ Risco: Deleta tabela

Digite "CONFIRMO" para continuar (ou Enter para cancelar):
> CONFIRMO
✅ Comando aprovado com confirmação
```

### Exemplo 4: CRITICAL (Bloqueado em Prod)
```powershell
PS> $env:ENVIRONMENT='production'; node .ai\hooks\guardrails-hook.js "rm -rf /"

🛑 ⚠️ COMANDO CRÍTICO BLOQUEADO ⚠️

📋 Comando: rm -rf /
⚡ Risco: Remove recursivo forçado
📊 Ambiente: production

❌ Comando CRÍTICO bloqueado em PRODUCTION
(exit 1)
```

## 📝 Arquivos Principais

### `.ai/policies/guardrails.md`
- Política de proteção
- Protocolo de confirmação
- Regras por ambiente
- Tratamento de ameaças

### `.ai/policies/guardrails-implementation.md`
- Código TypeScript
- Arquivo de configuração JSON
- Como integrar com agente

### `.ai/checklists/destructive-commands.md`
- Checklist de comandos perigosos
- Matriz de risco
- Exceções permitidas

### `.ai/hooks/guardrails-hook.js`
- Hook executável (Node.js)
- Detecta e valida comandos
- Registra auditoria
- Suporta confirmação interativa

### `.ai/logs/guardrails-audit.log`
- Log de auditoria (created at runtime)
- Todos os eventos registrados
- Formato: JSON por linha

## 🔒 Ambientes

### Development (Local)
- ✅ Menos restritivo
- ⚠️ Avisos para MEDIUM
- ❓ Confirmação para HIGH/CRITICAL
- 📝 Auditoria local

### Staging
- ⚠️ Avisos para MEDIUM
- 🛑 Bloqueia HIGH/CRITICAL
- 📞 Notificações ao time
- 🔐 Auditoria centralizada

### Production
- 🛑 Bloqueia CRITICAL automaticamente
- ❓ Confirmação para HIGH (com cuidado extra)
- 📞 Notificações obrigatórias
- 🔐 Auditoria rigorosa

## 🛠️ Comandos Úteis

```bash
# Teste um comando
node .ai/hooks/guardrails-hook.js "seu-comando"

# Com environment específico
$env:ENVIRONMENT='production'; node .ai/hooks/guardrails-hook.js "seu-comando"

# Ver auditoria completa
cat .ai/logs/guardrails-audit.log | ConvertFrom-Json

# Ver bloqueios
Select-String -Path .ai/logs/guardrails-audit.log "BLOCKED"

# Ver eventos recentes
Get-Content .ai/logs/guardrails-audit.log -Tail 10

# Análise por ambiente
Select-String -Path .ai/logs/guardrails-audit.log "production"
```

## 📊 Relatórios de Auditoria

O arquivo `.ai/logs/guardrails-audit.log` contém:

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

**Análise rápida:**
```powershell
# Contar bloqueios por environment
$content = Get-Content .ai/logs/guardrails-audit.log | ConvertFrom-Json
$content | Group-Object environment | Select-Object Name, Count

# Mostrar comandos bloqueados
$content | Where-Object { $_.action -eq 'BLOCKED' } | Select-Object timestamp, command, result
```

## 🚨 Troubleshooting

### Comando bloqueado mas não deveria
1. Verificar pattern em `.ai/policies/guardrails.md`
2. Adicionar comando ao whitelist em `guardrails-hook.js`
3. Atualizar padrão regex se necessário

### Auditoria não está sendo registrada
1. Verificar `.ai/logs/` existe
2. Verificar permissões de escrita
3. Criar pasta manualmente: `mkdir .ai/logs`

### Confirmação interativa não funciona
1. Verificar Node.js instalado
2. Verificar terminal suporta stdin
3. Não usar em scripts sem interação

## 🔄 Próximos Passos

1. **Integrar com agente:**
   - Adicionar chamada ao hook antes de `run_in_terminal`
   - Configurar environment (dev/staging/prod)

2. **Notificações:**
   - Ativar Slack/Email em staging/production
   - Configurar webhooks

3. **Monitoramento:**
   - Setup dashboard de auditoria
   - Alertas para eventos CRITICAL
   - Relatório semanal

4. **Customização:**
   - Adicionar padrões específicos do projeto
   - Ajustar mensagens
   - Adicionar contextos seguros

## 📚 Documentação

- `.ai/policies/guardrails.md` - Política completa
- `.ai/policies/guardrails-implementation.md` - Implementação técnica
- `.ai/checklists/destructive-commands.md` - Checklist de comandos
- `.ai/hooks/README.md` - Documentação dos hooks

---

**Perguntas? Veja os arquivos de documentação ou pergunte ao time.**

**Lembre-se: Segurança em primeiro lugar! 🔒**
