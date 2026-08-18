# Guard Rails Configuration

Configuração técnica para implementar proteção automática contra comandos destrutivos.

## Arquivo de Configuração: `guardrails.config.json`

```json
{
  "enabled": true,
  "auditLog": ".ai/logs/guardrails-audit.log",
  "environments": {
    "development": {
      "level": "MEDIUM",
      "requireConfirmation": false,
      "showWarnings": true,
      "blockCritical": false
    },
    "staging": {
      "level": "HIGH",
      "requireConfirmation": true,
      "showWarnings": true,
      "blockCritical": true,
      "notifyTeam": false
    },
    "production": {
      "level": "CRITICAL",
      "requireConfirmation": true,
      "requireDoubleConfirmation": true,
      "blockCritical": true,
      "notifyTeam": true,
      "approvalRequired": true,
      "approvalCount": 2
    }
  },
  "patterns": {
    "filesystem": [
      {
        "pattern": "^\\s*rm\\s+-rf",
        "threat": "CRITICAL",
        "description": "Remove recursivo forçado",
        "safeContexts": ["test/", "temp/", ".temp/"]
      },
      {
        "pattern": "^\\s*rm\\b",
        "threat": "HIGH",
        "description": "Remove arquivos"
      },
      {
        "pattern": "^\\s*rmdir\\b",
        "threat": "MEDIUM",
        "description": "Remove diretórios"
      }
    ],
    "database": [
      {
        "pattern": "DROP\\s+(DATABASE|SCHEMA)\\b",
        "threat": "CRITICAL",
        "requiresBackup": true,
        "description": "Deleta banco/schema"
      },
      {
        "pattern": "DROP\\s+TABLE\\b",
        "threat": "HIGH",
        "requiresBackup": true,
        "description": "Deleta tabela"
      },
      {
        "pattern": "TRUNCATE\\s+TABLE\\b",
        "threat": "HIGH",
        "requiresBackup": true,
        "description": "Remove todos registros"
      },
      {
        "pattern": "DELETE\\s+FROM\\s+\\w+\\s*;?\\s*$",
        "threat": "CRITICAL",
        "description": "Delete sem WHERE (remove tudo)"
      }
    ],
    "git": [
      {
        "pattern": "git\\s+reset\\s+--hard",
        "threat": "HIGH",
        "dangerousBranches": ["main", "master"],
        "description": "Descarta mudanças"
      },
      {
        "pattern": "git\\s+push\\s+--force",
        "threat": "CRITICAL",
        "dangerousBranches": ["main", "master"],
        "description": "Força push (altera histórico)"
      },
      {
        "pattern": "git\\s+clean\\s+-f[d]?",
        "threat": "MEDIUM",
        "description": "Remove arquivos não rastreados"
      },
      {
        "pattern": "git\\s+branch\\s+-D",
        "threat": "MEDIUM",
        "description": "Força delete de branch"
      }
    ],
    "docker": [
      {
        "pattern": "docker\\s+system\\s+prune",
        "threat": "HIGH",
        "description": "Remove volumes, imagens, containers"
      },
      {
        "pattern": "docker\\s+volume\\s+rm",
        "threat": "CRITICAL",
        "requiresBackup": true,
        "description": "Remove volume (perda de dados)"
      },
      {
        "pattern": "docker\\s+rmi",
        "threat": "MEDIUM",
        "description": "Remove imagem"
      }
    ],
    "kubernetes": [
      {
        "pattern": "kubectl\\s+delete\\s+namespace",
        "threat": "CRITICAL",
        "dangerousNamespaces": ["production", "prod"],
        "description": "Deleta namespace inteiro"
      },
      {
        "pattern": "kubectl\\s+delete\\s+(pod|service|deployment)\\s+--all",
        "threat": "CRITICAL",
        "description": "Deleta todos recursos"
      },
      {
        "pattern": "kubectl\\s+patch\\s+secret",
        "threat": "HIGH",
        "description": "Modifica secrets"
      }
    ],
    "infrastructure": [
      {
        "pattern": "terraform\\s+destroy",
        "threat": "CRITICAL",
        "requiresBackup": true,
        "dangerousEnv": ["production"],
        "description": "Destroi infraestrutura"
      },
      {
        "pattern": "gcloud\\s+projects\\s+delete",
        "threat": "CRITICAL",
        "requiresBackup": true,
        "dangerousEnv": ["production"],
        "description": "Deleta projeto GCP"
      },
      {
        "pattern": "aws\\s+ec2\\s+terminate-instances",
        "threat": "CRITICAL",
        "dangerousEnv": ["production"],
        "description": "Termina instâncias AWS"
      }
    ]
  },
  "whitelists": {
    "safeCommands": [
      "rm --help",
      "rm -h",
      "git reset --help",
      "echo",
      "cat",
      "grep"
    ],
    "safeContexts": [
      { "path": "/tmp", "allowDestructive": true },
      { "path": ".temp", "allowDestructive": true },
      { "path": "test/", "allowDestructive": true },
      { "path": "dist/", "allowDestructive": true }
    ],
    "safeBranches": [
      "feature/*",
      "fix/*",
      "refactor/*"
    ],
    "dangerousBranches": [
      "main",
      "master",
      "develop",
      "production"
    ]
  },
  "confirmationMessages": {
    "LOW": {
      "template": "⚠️ Aviso: {{command}}\nRisco: {{description}}",
      "requiresInput": false,
      "timeout": null
    },
    "MEDIUM": {
      "template": "⚠️ COMANDO POTENCIALMENTE PERIGOSO\n\nComando: {{command}}\nRisco: {{description}}\n\nTem certeza? (S/N)",
      "requiresInput": true,
      "inputOptions": ["S", "N"],
      "timeout": 30000
    },
    "HIGH": {
      "template": "🛑 COMANDO PERIGOSO DETECTADO\n\nComando: {{command}}\nRisco: {{description}}\n\nDigite \"CONFIRMO\" para continuar:",
      "requiresInput": true,
      "requiresExactMatch": "CONFIRMO",
      "timeout": 60000
    },
    "CRITICAL": {
      "template": "🛑 ⚠️ COMANDO CRÍTICO - ÚLTIMA CHANCE\n\nComando: {{command}}\nRisco: {{description}}\nAmbiente: {{environment}}\n\n⚠️ AÇÕES IRREVERSÍVEIS ⚠️\n\nPrimeiro: Confirme digitando o comando completo\nSegundo: Digite o motivo/business case\nTerceiro: Confirme digitando \"ENTENDO OS RISCOS\"",
      "requiresInput": true,
      "requiresMultipleConfirmations": [
        { "step": 1, "prompt": "Digite o comando completo:", "validate": "exact" },
        { "step": 2, "prompt": "Motivo da operação:", "validate": "length", "minLength": 10 },
        { "step": 3, "prompt": "Confirme digitando 'ENTENDO OS RISCOS':", "validate": "exact", "value": "ENTENDO OS RISCOS" }
      ],
      "timeout": 120000,
      "notifyTeam": true,
      "requiresApproval": true
    }
  },
  "audit": {
    "enabled": true,
    "logFile": ".ai/logs/guardrails-audit.log",
    "format": "json",
    "fields": [
      "timestamp",
      "command",
      "threatLevel",
      "action",
      "environment",
      "user",
      "result",
      "duration",
      "details"
    ],
    "rotation": {
      "enabled": true,
      "maxSize": "10MB",
      "maxFiles": 10,
      "compress": true
    }
  },
  "notifications": {
    "slack": {
      "enabled": false,
      "webhook": "${SLACK_WEBHOOK_URL}",
      "threatLevels": ["CRITICAL"],
      "environments": ["staging", "production"]
    },
    "email": {
      "enabled": false,
      "recipients": ["team@example.com"],
      "threatLevels": ["CRITICAL"],
      "environments": ["production"]
    },
    "pagerduty": {
      "enabled": false,
      "integrationKey": "${PAGERDUTY_KEY}",
      "threatLevels": ["CRITICAL"],
      "environments": ["production"]
    }
  },
  "exceptions": {
    "allowOverride": true,
    "requireReason": true,
    "approvalRequired": true,
    "logOverrides": true,
    "exceptionLifetime": 3600
  }
}
```

## Implementação em TypeScript/JavaScript

```typescript
import * as fs from "fs";
import * as path from "path";

interface ThreatPattern {
  pattern: string;
  threat: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  requiresBackup?: boolean;
  dangerousBranches?: string[];
  dangerousEnv?: string[];
}

interface GuardRailsConfig {
  enabled: boolean;
  patterns: Record<string, ThreatPattern[]>;
  whitelists: Record<string, any>;
  confirmationMessages: Record<string, any>;
  environments: Record<string, any>;
}

class GuardRails {
  private config: GuardRailsConfig;
  private currentEnv: string;

  constructor(configPath: string, env: string = "development") {
    this.config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    this.currentEnv = env;
  }

  detectThreat(command: string): {
    detected: boolean;
    threatLevel: string;
    pattern: ThreatPattern;
  } | null {
    if (!this.config.enabled) return null;

    for (const [category, patterns] of Object.entries(this.config.patterns)) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.pattern, "i");
        if (regex.test(command)) {
          // Validar whitelist
          if (this.isWhitelisted(command)) {
            return null;
          }

          // Validar ambiente
          if (
            pattern.dangerousEnv &&
            pattern.dangerousEnv.includes(this.currentEnv)
          ) {
            return {
              detected: true,
              threatLevel: pattern.threat,
              pattern,
            };
          }

          return {
            detected: true,
            threatLevel: pattern.threat,
            pattern,
          };
        }
      }
    }

    return null;
  }

  private isWhitelisted(command: string): boolean {
    // Check safeCommands
    if (this.config.whitelists.safeCommands.includes(command)) {
      return true;
    }

    // Check safeContexts
    for (const ctx of this.config.whitelists.safeContexts) {
      if (command.includes(ctx.path) && ctx.allowDestructive) {
        return true;
      }
    }

    return false;
  }

  async validateAndExecute(command: string): Promise<boolean> {
    const threat = this.detectThreat(command);

    if (!threat) {
      return true; // Safe to execute
    }

    const envConfig = this.config.environments[this.currentEnv];

    // CRITICAL threat in production - always block
    if (threat.threatLevel === "CRITICAL" && envConfig.requireDoubleConfirmation) {
      return await this.requestDoubleConfirmation(command, threat);
    }

    // HIGH threat - requires confirmation
    if (
      ["HIGH", "CRITICAL"].includes(threat.threatLevel) &&
      envConfig.requireConfirmation
    ) {
      return await this.requestConfirmation(command, threat);
    }

    // MEDIUM threat - show warning
    if (threat.threatLevel === "MEDIUM" && envConfig.showWarnings) {
      console.warn(`⚠️ ${threat.pattern.description}`);
    }

    return true;
  }

  private async requestConfirmation(
    command: string,
    threat: any
  ): Promise<boolean> {
    // Implementation of confirmation dialog
    console.log(
      `🛑 COMANDO PERIGOSO: ${threat.pattern.description}\nComando: ${command}`
    );
    return await this.getUserConfirmation();
  }

  private async requestDoubleConfirmation(
    command: string,
    threat: any
  ): Promise<boolean> {
    // Implementation of multi-step confirmation
    console.log(`🛑 ⚠️ COMANDO CRÍTICO\nComando: ${command}`);
    return await this.getMultiStepConfirmation(command);
  }

  private async getUserConfirmation(): Promise<boolean> {
    // Prompt user for confirmation
    return true; // Simplified
  }

  private async getMultiStepConfirmation(command: string): Promise<boolean> {
    // Multi-step confirmation process
    return true; // Simplified
  }

  logAudit(
    command: string,
    action: string,
    result: string,
    threatLevel?: string
  ): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      command,
      action,
      result,
      threatLevel,
      environment: this.currentEnv,
      duration: 0,
    };

    const logPath = this.config.audit.logFile;
    const logEntry = JSON.stringify(auditEntry);

    fs.appendFileSync(logPath, logEntry + "\n");
  }
}

export default GuardRails;
```

## Uso

```typescript
const guardrails = new GuardRails("./guardrails.config.json", "production");

const command = "rm -rf /production/data";
const threat = guardrails.detectThreat(command);

if (threat) {
  console.log(`⚠️ Ameaça detectada: ${threat.threatLevel}`);
  const approved = await guardrails.validateAndExecute(command);

  if (approved) {
    guardrails.logAudit(command, "EXECUTED", "SUCCESS", threat.threatLevel);
    // Execute command
  } else {
    guardrails.logAudit(command, "BLOCKED", "USER_DECLINED", threat.threatLevel);
  }
} else {
  // Safe command
  guardrails.logAudit(command, "ALLOWED", "SUCCESS");
  // Execute command
}
```

## Integração com Run in Terminal

Adicionar hook antes de `run_in_terminal`:

```typescript
async function runCommandSafely(command: string, mode: "sync" | "async" = "sync") {
  const guardrails = new GuardRails(
    "./.ai/policies/guardrails.config.json",
    process.env.ENVIRONMENT || "development"
  );

  // Check for threats
  const threat = guardrails.detectThreat(command);
  if (threat) {
    // Get confirmation
    const approved = await guardrails.validateAndExecute(command);
    if (!approved) {
      guardrails.logAudit(command, "BLOCKED", "USER_DECLINED", threat.threatLevel);
      throw new Error(`Comando bloqueado: ${threat.pattern.description}`);
    }
  }

  // Execute with audit
  try {
    const result = await run_in_terminal({
      command,
      mode,
      explanation: `Executando: ${command}`,
    });
    guardrails.logAudit(command, "EXECUTED", "SUCCESS", threat?.threatLevel);
    return result;
  } catch (error) {
    guardrails.logAudit(command, "EXECUTED", "FAILED", threat?.threatLevel);
    throw error;
  }
}
```
