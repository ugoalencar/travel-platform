#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Pre-Commit Quality Checks

.DESCRIPTION
    Executa verificações obrigatórias antes de fazer commit:
    - Lint (ESLint)
    - Typecheck (TypeScript)
    - Unit Tests (Vitest)
    - Secret Detection (API keys, passwords, tokens)
    - Security Checks (npm audit)

.PARAMETER Fix
    Auto-corrige problemas de lint

.EXAMPLE
    .\pre-commit.ps1                    # Executar todos checks
    .\pre-commit.ps1 -Fix               # Auto-fix lint issues
#>

param(
    [switch]$Fix
)

$ErrorActionPreference = "Stop"
$WarningPreference = "Continue"

# Cores para output
$colors = @{
    Success = [System.ConsoleColor]::Green
    Error   = [System.ConsoleColor]::Red
    Warning = [System.ConsoleColor]::Yellow
    Info    = [System.ConsoleColor]::Cyan
}

function Write-Status {
    param(
        [string]$Message,
        [string]$Status = "Info",
        [int]$Indent = 0
    )

    $prefix = "  " * $Indent
    $symbol = @{
        Success = "?"
        Error   = "?"
        Warning = "??"
        Info    = "??"
    }[$Status]

    Write-Host "$prefix$symbol $Message" -ForegroundColor $colors[$Status]
}

function Run-Command {
    param(
        [string]$Name,
        [string]$Command,
        [string]$ErrorMessage = "Falhou: $Name"
    )

    Write-Status "Executando: $Name..." -Status Info

    try {
        $result = Invoke-Expression $Command 2>&1
        Write-Status "$Name passou" -Status Success -Indent 1
        return $true
    } catch {
        Write-Status $ErrorMessage -Status Error -Indent 1
        Write-Host $result -ForegroundColor $colors.Error
        return $false
    }
}

# Header
Write-Host "`n" + ("=" * 60) -ForegroundColor $colors.Info
Write-Host "?? PR?-COMMIT CHECKS" -ForegroundColor $colors.Info
Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host ""

# Tracking
$passed = @()
$failed = @()

# 1. LINT
Write-Host "1??  LINT" -ForegroundColor $colors.Info
if ($Fix) {
    $cmd = "npm run lint:fix"
    if (Run-Command "ESLint (Auto-Fix)" $cmd "ESLint auto-fix falhou") {
        $passed += "Lint"
    } else {
        $failed += "Lint"
    }
} else {
    $cmd = "npm run lint"
    if (Run-Command "ESLint" $cmd) {
        $passed += "Lint"
    } else {
        $failed += "Lint"
        Write-Status "Dica: Use -Fix para auto-corrigir" -Status Warning -Indent 1
    }
}
Write-Host ""

# 2. TYPECHECK
Write-Host "2??  TYPECHECK" -ForegroundColor $colors.Info
if (Run-Command "TypeScript" "npm run typecheck") {
    $passed += "Typecheck"
} else {
    $failed += "Typecheck"
}
Write-Host ""

# 3. UNIT TESTS
Write-Host "3??  UNIT TESTS" -ForegroundColor $colors.Info
if (Run-Command "Vitest" "npm run test -- --passWithNoTests") {
    $passed += "Tests"
} else {
    $failed += "Tests"
    Write-Status "Dica: Use 'npm run test -- --watch' para debugar" -Status Warning -Indent 1
}
Write-Host ""

# 4. SECRET DETECTION
Write-Host "4️⃣  SECRET DETECTION" -ForegroundColor $colors.Info
$secretPatterns = @(
    '(?i)API_KEY\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-]{16,}',
    '(?i)SECRET\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-]{16,}',
    '(?i)PASSWORD\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-]{8,}',
    '(?i)TOKEN\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-]{16,}',
    '(?i)PRIVATE_KEY\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-]{16,}',
    '(?i)AWS_SECRET_ACCESS_KEY\s*[=:]\s*["\x27]?[a-zA-Z0-9/+=]{40}',
    '(?i)DATABASE_URL\s*[=:]\s*["\x27]?[a-zA-Z0-9_\-:/@.]{20,}'
)

$stagedFiles = @()
$isGitRepo = Test-Path .git
if ($isGitRepo) {
    $stagedFiles = git status --porcelain 2>$null | Where-Object { $_ -match '^[AM]\s+' } | ForEach-Object { ($_ -replace '^[AM]\s+', '') } | Where-Object { $_ -notmatch '\.env$' }
}
$secretsFound = @()

if ($stagedFiles.Count -gt 0) {
    foreach ($file in $stagedFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if ($content) {
                foreach ($pattern in $secretPatterns) {
                    if ($content -match $pattern) {
                        $secretsFound += "Possível segredo em $file"
                        break
                    }
                }
            }
        }
    }
} else {
    # Scan all source files if no git repo or no staged files
    $sourceExtensions = @('*.js', '*.ts', '*.jsx', '*.tsx', '*.json', '*.env', '*.yml', '*.yaml', '*.toml', '*.txt', '*.md', '*.config', '*.ini', '*.cfg')
    foreach ($ext in $sourceExtensions) {
        Get-ChildItem -Path . -Filter $ext -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '(node_modules|\.git|dist|build|\.env)' } |
        ForEach-Object {
            $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                foreach ($pattern in $secretPatterns) {
                    if ($content -match $pattern) {
                        $secretsFound += "Possível segredo em $($_.FullName)"
                        break
                    }
                }
            }
        }
    }
}

if ($secretsFound.Count -eq 0) {
    Write-Status "Secret Detection passou" -Status Success -Indent 1
    $passed += "Secrets"
} else {
    $failed += "Secrets"
    foreach ($secret in $secretsFound) {
        Write-Status $secret -Status Error -Indent 1
    }
    Write-Status "Dica: Use variáveis de ambiente ou .env para segredos" -Status Warning -Indent 1
}
Write-Host ""

# 5. SECURITY CHECKS
Write-Host "5??  SECURITY CHECKS" -ForegroundColor $colors.Info
if (Run-Command "npm audit" "npm audit --audit-level=moderate") {
    $passed += "Security"
} else {
    $failed += "Security"
    Write-Status "Dica: Use 'npm audit fix' para corrigir vulnerabilidades" -Status Warning -Indent 1
}
Write-Host ""

# Summary
Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host "?? RESUMO" -ForegroundColor $colors.Info
Write-Host ("=" * 60) -ForegroundColor $colors.Info

if ($passed.Count -gt 0) {
    Write-Status "Passou ($($passed.Count)): $($passed -join ', ')" -Status Success
}

if ($failed.Count -gt 0) {
    Write-Status "Falhou ($($failed.Count)): $($failed -join ', ')" -Status Error
}

Write-Host ""

# Result
if ($failed.Count -eq 0) {
    Write-Host "? Todos os checks passaram!" -ForegroundColor $colors.Success
    Write-Host "?? Pronto para commit!" -ForegroundColor $colors.Success
    Write-Host ""
    exit 0
} else {
    Write-Host "? Alguns checks falharam" -ForegroundColor $colors.Error
    Write-Host "?? N?o ? seguro commitar agora" -ForegroundColor $colors.Error
    Write-Host ""

    if ($failed -contains "Lint") {
        Write-Host "Lint: Execute 'npm run lint:fix' para auto-corrigir" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Typecheck") {
        Write-Host "Typecheck: Corrige os type errors no c?digo" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Tests") {
        Write-Host "Tests: Use 'npm run test -- --watch' para debugar" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Secrets") {
        Write-Host "Secrets: Remova dados sens?veis do c?digo e use vari?veis de ambiente" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Security") {
        Write-Host "Security: Use 'npm audit fix' para atualizar depend?ncias" -ForegroundColor $colors.Warning
    }

    Write-Host ""
    exit 1
}
