# AI Policies

Políticas de segurança e proteção para o projeto Travel Platform.

## Proteção Contra Comandos Destrutivos

### 📋 Arquivos

1. **[guardrails.md](guardrails.md)** - Política de Guard Rails
   - Objetivo e camada de proteção
   - Comandos bloqueados por categoria
   - Protocolo de proteção (detecção, validação, confirmação, auditoria)
   - Padrões de detecção com regex
   - Configuração por ambiente
   - Monitoramento e auditoria

2. **[guardrails-implementation.md](guardrails-implementation.md)** - Implementação Técnica
   - Arquivo de configuração JSON
   - Código TypeScript/JavaScript
   - Como integrar com `run_in_terminal`
   - Exemplos de uso

### ⚡ Quick Start

**Antes de executar qualquer comando, o agente deve:**

1. ✅ Verificar contra padrões de comandos perigosos
2. ✅ Se detectado, validar threat level
3. ✅ Se CRITICAL/HIGH, solicitar confirmação explícita
4. ✅ Registrar em auditoria
5. ✅ Executar com logging

### 🛑 Comandos Críticos (SEMPRE Bloqueados)

```bash
rm -rf               # Remove recursivo forçado
drop database        # Deleta banco inteiro
git push --force     # Força push (altera histórico)
terraform destroy    # Destroi infraestrutura
docker volume rm     # Remove volume persistido
kubectl delete namespace  # Deleta namespace inteiro
dd                   # Cópia byte-to-byte (risco de disco)
gcloud projects delete    # Deleta projeto GCP
```

### ⚠️ Níveis de Ameaça

| Nível | Ação | Exemplo |
|-------|------|---------|
| LOW | Permitir com aviso | Comentários sobre `rm` |
| MEDIUM | Avisar e perguntar | `rm` em local normal |
| HIGH | Requer confirmação | `git push --force` |
| CRITICAL | Tripla confirmação | `rm -rf`, `DROP DATABASE` |

### 🔒 Ambientes

- **Development**: Mais permissivo, avisos locais
- **Staging**: Confirmação requerida, notificação ao time
- **Production**: Máximo restritivo, aprovação necessária

### 📝 Auditoria

Todos os comandos são registrados em:
```
.ai/logs/guardrails-audit.log
```

Com informações:
- Timestamp
- Comando completo
- Threat level
- Ação (bloqueado/confirmado/executado)
- Resultado
- Usuário/Agent

### 🚀 Integração com Agente

```typescript
// Antes de executar comando
const guardrails = new GuardRails("./.ai/policies/guardrails.config.json");
const approved = await guardrails.validateAndExecute(command);

if (!approved) {
  throw new Error(`Comando bloqueado por segurança: ${command}`);
}
```

## Checklist de Segurança

Veja [../checklists/destructive-commands.md](../checklists/destructive-commands.md) para:
- Lista completa de comandos perigosos
- Threat levels específicos
- Matriz de risco por ambiente
- Exceções permitidas

## Configuração

1. Copiar `guardrails.config.json` (do guardrails-implementation.md)
2. Colocar em raiz do projeto
3. Ajustar níveis por ambiente (dev/staging/prod)
4. Integrar na plataforma de agentes
5. Testar em dev local

## Exceções

Exceções são permitidas APENAS em casos extremos:

```bash
# Requer múltiplas confirmações e aprovação
FORCE_OVERRIDE=true CONFIRM_DESTRUCTIONS=I_UNDERSTAND_THE_RISKS command
```

- Documentar exceção
- Requer aprovação de lead
- Audit log em destaque
- Notificar equipe

## Monitoramento

Verificar regularmente:
1. Logs de auditoria
2. Padrões de uso
3. Falhas de segurança
4. Exceções usadas
5. Atualizações necessárias

## Exemplos de Proteção

### ❌ Bloqueado
```bash
$ rm -rf /production/database
🛑 COMANDO CRÍTICO DETECTADO
Risco: Remove tudo recursivamente em production
Digite "CONFIRMO" para continuar:
```

### ❌ Bloqueado
```bash
$ git push --force origin main
🛑 COMANDO PERIGOSO DETECTADO
Risco: Altera histórico da branch principal
Digite o comando completo para confirmar:
```

### ❌ Bloqueado
```bash
$ terraform destroy
🛑 ⚠️ COMANDO CRÍTICO - ÚLTIMA CHANCE
Ambiente: production
Passo 1: Digite comando completo
Passo 2: Digite motivo da operação
Passo 3: Confirme digitando 'ENTENDO OS RISCOS'
```

### ✅ Permitido (dev)
```bash
$ rm /tmp/cache
⚠️ Aviso: Remove arquivos
Continuando em contexto seguro...
```

---

**Segurança em primeiro lugar. Dúvidas? Pergunte ao time.**
