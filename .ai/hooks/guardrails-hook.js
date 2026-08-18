#!/usr/bin/env node

/**
 * Guard Rails Hook - Proteção contra comandos destrutivos
 *
 * Execute ANTES de qualquer terminal command no agente
 *
 * Uso:
 * const guardrails = require('./.ai/hooks/guardrails-hook.js');
 * await guardrails.validateCommand(command, environment);
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Padrões de comando perigoso
const DESTRUCTIVE_PATTERNS = {
  CRITICAL: [
    // Filesystem
    { regex: /\brm\s+-rf\b/i, desc: 'Remove recursivo forçado', category: 'filesystem' },
    { regex: /\bdd\b/i, desc: 'Disk dump - CRÍTICO', category: 'filesystem' },

    // Database
    { regex: /\bdrop\s+(database|schema)\b/i, desc: 'Deleta banco/schema', category: 'database' },
    { regex: /\btruncate\s+table\b/i, desc: 'Remove todos registros', category: 'database' },
    { regex: /\bdelete\s+from\s+\w+\s*(?:where\s+1=1)?\s*[;]?\s*$/i, desc: 'Delete sem WHERE', category: 'database' },

    // Git
    { regex: /\bgit\s+push\s+--force\b/i, desc: 'Força push - altera histórico', category: 'git' },
    { regex: /\bgit\s+reset\s+--hard\s+(main|master)\b/i, desc: 'Reset --hard na branch principal', category: 'git' },

    // Infrastructure
    { regex: /\bterraform\s+destroy\b/i, desc: 'Destroi infraestrutura', category: 'terraform' },
    { regex: /\bgcloud\s+projects\s+delete\b/i, desc: 'Deleta projeto GCP', category: 'gcp' },
    { regex: /\bkubectl\s+delete\s+namespace\b/i, desc: 'Deleta namespace inteiro', category: 'k8s' },
    { regex: /\bdocker\s+volume\s+rm\b/i, desc: 'Remove volume (perda de dados)', category: 'docker' },
  ],
  HIGH: [
    { regex: /\brm\b(?!\s+--help)/i, desc: 'Remove arquivos', category: 'filesystem' },
    { regex: /\bgit\s+reset\s+--hard\b/i, desc: 'Descarta mudanças locais', category: 'git' },
    { regex: /\bgit\s+clean\s+-f[d]?\b/i, desc: 'Remove arquivos não rastreados', category: 'git' },
    { regex: /\bgit\s+branch\s+-D\b/i, desc: 'Força delete de branch', category: 'git' },
    { regex: /\bdrop\s+table\b/i, desc: 'Deleta tabela', category: 'database' },
    { regex: /\bdocker\s+system\s+prune\b/i, desc: 'Remove volumes, imagens, containers', category: 'docker' },
    { regex: /\bkubectl\s+delete\s+(pod|service).*--all\b/i, desc: 'Deleta recursos', category: 'k8s' },
  ],
  MEDIUM: [
    { regex: /\brmdir\b/i, desc: 'Remove diretório', category: 'filesystem' },
    { regex: /\bdocker\s+rmi\b/i, desc: 'Remove imagem Docker', category: 'docker' },
    { regex: /\bshred\b/i, desc: 'Sobrescreve dados', category: 'filesystem' },
  ],
};

// Contextos seguros
const SAFE_CONTEXTS = [
  /^(echo|cat|grep|ls|find|locate)/i,
  /rm.*--help/i,
  /git.*--help/i,
  /rm\s+(.+\/)?\.(temp|tmp|cache)\//i,
];

class GuardRails {
  constructor(configPath = '.ai/policies/guardrails.config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.auditLog = '.ai/logs/guardrails-audit.log';
    this.ensureAuditLog();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch {
      console.warn('⚠️ Não foi possível carregar guardrails.config.json');
    }
    return {};
  }

  ensureAuditLog() {
    const logDir = path.dirname(this.auditLog);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(this.auditLog)) {
      fs.writeFileSync(this.auditLog, '');
    }
  }

  /**
   * Detecta ameaça em comando
   * @returns { threat: string | null, level: string, description: string }
   */
  detectThreat(command) {
    // Verificar whitelists
    for (const safe of SAFE_CONTEXTS) {
      if (safe.test(command)) {
        return { threat: null, level: 'SAFE', description: 'Contexto seguro' };
      }
    }

    // Procurar em CRITICAL
    for (const pattern of DESTRUCTIVE_PATTERNS.CRITICAL) {
      if (pattern.regex.test(command)) {
        return {
          threat: command.substring(0, 50),
          level: 'CRITICAL',
          description: pattern.desc,
          category: pattern.category,
        };
      }
    }

    // Procurar em HIGH
    for (const pattern of DESTRUCTIVE_PATTERNS.HIGH) {
      if (pattern.regex.test(command)) {
        return {
          threat: command.substring(0, 50),
          level: 'HIGH',
          description: pattern.desc,
          category: pattern.category,
        };
      }
    }

    // Procurar em MEDIUM
    for (const pattern of DESTRUCTIVE_PATTERNS.MEDIUM) {
      if (pattern.regex.test(command)) {
        return {
          threat: command.substring(0, 50),
          level: 'MEDIUM',
          description: pattern.desc,
          category: pattern.category,
        };
      }
    }

    return { threat: null, level: 'SAFE', description: 'Comando seguro' };
  }

  /**
   * Valida comando baseado em ameaça detectada
   */
  async validateCommand(command, environment = 'development') {
    const threat = this.detectThreat(command);

    // Comando seguro
    if (threat.level === 'SAFE') {
      this.logAudit(command, 'ALLOWED', 'SUCCESS', environment);
      return { approved: true, threat };
    }

    // Production: always restrict CRITICAL
    if (environment === 'production' && threat.level === 'CRITICAL') {
      this.logAudit(command, 'BLOCKED', 'PRODUCTION_CRITICAL', environment);
      return {
        approved: false,
        threat,
        reason: '🛑 Comando CRÍTICO bloqueado em PRODUCTION',
      };
    }

    // Staging: requer confirmação para HIGH/CRITICAL
    if (
      environment === 'staging' &&
      ['HIGH', 'CRITICAL'].includes(threat.level)
    ) {
      const approved = await this.confirmCommand(command, threat);
      const action = approved ? 'CONFIRMED' : 'DENIED';
      this.logAudit(command, 'BLOCKED', action, environment);
      return { approved, threat, reason: `Confirmação do usuário: ${action}` };
    }

    // Development: aviso
    if (environment === 'development') {
      if (threat.level === 'MEDIUM') {
        console.warn(`⚠️ Aviso: ${threat.description}`);
        return { approved: true, threat, warned: true };
      }

      if (['HIGH', 'CRITICAL'].includes(threat.level)) {
        const approved = await this.confirmCommand(command, threat);
        const action = approved ? 'CONFIRMED' : 'DENIED';
        this.logAudit(command, 'BLOCKED', action, environment);
        return { approved, threat, reason: `Confirmação do usuário: ${action}` };
      }
    }

    return { approved: true, threat, warned: false };
  }

  /**
   * Solicita confirmação do usuário
   */
  async confirmCommand(command, threat) {
    if (threat.level === 'CRITICAL') {
      return await this.criticalConfirmation(command, threat);
    } else if (threat.level === 'HIGH') {
      return await this.highConfirmation(command, threat);
    } else {
      return await this.standardConfirmation(command, threat);
    }
  }

  /**
   * Confirmação para ameaça CRITICAL
   */
  async criticalConfirmation(command, threat) {
    console.log('\n🛑 ⚠️ COMANDO CRÍTICO DETECTADO ⚠️\n');
    console.log(`📋 Comando: ${command}`);
    console.log(`⚡ Risco: ${threat.description}`);
    console.log(`📂 Categoria: ${threat.category}\n`);

    const confirmCommand = await this.prompt(
      'Passo 1 - Digite o comando completo para confirmar:\n> '
    );

    if (confirmCommand.trim() !== command.trim()) {
      console.log('❌ Comando não confere. Operação cancelada.\n');
      return false;
    }

    const reason = await this.prompt(
      'Passo 2 - Motivo da operação (mínimo 10 caracteres):\n> '
    );

    if (reason.length < 10) {
      console.log('❌ Motivo muito curto. Operação cancelada.\n');
      return false;
    }

    const finalConfirm = await this.prompt(
      'Passo 3 - Digite "ENTENDO OS RISCOS" para confirmar:\n> '
    );

    if (finalConfirm.trim() !== 'ENTENDO OS RISCOS') {
      console.log('❌ Confirmação não confere. Operação cancelada.\n');
      return false;
    }

    console.log('✅ Comando aprovado com confirmação tripla.\n');
    return true;
  }

  /**
   * Confirmação para ameaça HIGH
   */
  async highConfirmation(command, threat) {
    console.log('\n🛑 COMANDO PERIGOSO DETECTADO\n');
    console.log(`📋 Comando: ${command}`);
    console.log(`⚡ Risco: ${threat.description}\n`);

    const confirm = await this.prompt(
      'Digite "CONFIRMO" para continuar (ou Enter para cancelar):\n> '
    );

    return confirm.trim() === 'CONFIRMO';
  }

  /**
   * Confirmação padrão
   */
  async standardConfirmation(command, threat) {
    console.log(`\n⚠️ Aviso: ${threat.description}`);
    console.log(`📋 Comando: ${command}\n`);

    const confirm = await this.prompt('Tem certeza? (S/N): ');
    return confirm.toUpperCase() === 'S';
  }

  /**
   * Prompt para entrada do usuário
   */
  prompt(question) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Registra auditoria
   */
  logAudit(command, action, result, environment = 'unknown') {
    const entry = {
      timestamp: new Date().toISOString(),
      command: command.substring(0, 100),
      action,
      result,
      environment,
      pid: process.pid,
    };

    fs.appendFileSync(this.auditLog, JSON.stringify(entry) + '\n');
  }

  /**
   * Exibe relatório de auditoria
   */
  showAuditReport(lines = 50) {
    if (!fs.existsSync(this.auditLog)) {
      console.log('Sem eventos registrados.');
      return;
    }

    const content = fs
      .readFileSync(this.auditLog, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .slice(-lines);

    console.log(`\n📋 Últimos ${content.length} eventos de auditoria:\n`);
    for (const line of content) {
      const entry = JSON.parse(line);
      const icon =
        entry.result === 'BLOCKED' ? '🛑' : entry.result === 'DENIED' ? '❌' : '✅';
      console.log(
        `${icon} [${entry.timestamp}] ${entry.action} - ${entry.command} (${entry.environment})`
      );
    }
    console.log();
  }
}

// Export
module.exports = new GuardRails();

// CLI
if (require.main === module) {
  const command = process.argv.slice(2).join(' ');
  const environment = process.env.ENVIRONMENT || 'development';

  if (!command) {
    console.log('Guard Rails - Proteção contra comandos destrutivos\n');
    console.log('Uso:');
    console.log('  node guardrails-hook.js <comando>');
    console.log('  ENVIRONMENT=production node guardrails-hook.js <comando>\n');
    console.log('Exemplos:');
    console.log('  node guardrails-hook.js "rm -rf /"');
    console.log('  node guardrails-hook.js "git push --force"\n');
    process.exit(0);
  }

  module.exports.validateCommand(command, environment).then((result) => {
    if (result.approved) {
      console.log('✅ Comando aprovado');
      process.exit(0);
    } else {
      console.log('❌ Comando bloqueado');
      process.exit(1);
    }
  });
}
