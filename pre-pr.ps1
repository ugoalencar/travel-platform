#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Pre-PR Quality Checks

.DESCRIPTION
    Executa verificações obrigatórias antes de abrir um Pull Request:
    - Tests (completos)
    - Coverage (validation)
    - Dependency Audit (vulnerabilities)
    - Secret Scan (detectar secrets)
    - Migration Validation (DB migrations)
    - Build (compilação)

.PARAMETER Verbose
    Mostra detalhes de cada check

.EXAMPLE
    .\pre-pr.ps1                        # Executar todos checks
    .\pre-pr.ps1 -Verbose               # Com detalhes
#>

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$WarningPreference = "Continue"

# Cores para output
$colors = @{
    Success = [System.ConsoleColor]::Green
    Error   = [System.ConsoleColor]::Red
    Warning = [System.ConsoleColor]::Yellow
    Info    = [System.ConsoleColor]::Cyan
    Debug   = [System.ConsoleColor]::Gray
}

function Write-Status {
    param(
        [string]$Message,
        [string]$Status = "Info",
        [int]$Indent = 0
    )

    $prefix = "  " * $Indent
    $symbol = @{
        Success = "✅"
        Error   = "❌"
        Warning = "⚠️"
        Info    = "ℹ️"
        Debug   = "🔍"
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
        if ($Verbose) {
            Write-Status "Comando: $Command" -Status Debug -Indent 1
        }

        $result = Invoke-Expression $Command 2>&1

        if ($Verbose -and $result) {
            Write-Host $result -ForegroundColor $colors.Debug
        }

        Write-Status "$Name passou" -Status Success -Indent 1
        return $true
    } catch {
        Write-Status $ErrorMessage -Status Error -Indent 1
        if ($result) {
            Write-Host $result -ForegroundColor $colors.Error
        }
        Write-Host $_.Exception.Message -ForegroundColor $colors.Error
        return $false
    }
}

# Header
Write-Host "`n" + ("=" * 60) -ForegroundColor $colors.Info
Write-Host "🚀 PRÉ-PR CHECKS" -ForegroundColor $colors.Info
Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host "Verificações obrigatórias antes de Pull Request" -ForegroundColor $colors.Info
Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host ""

$startTime = Get-Date
$passed = @()
$failed = @()

# 1. TESTS
Write-Host "1️⃣  TESTES" -ForegroundColor $colors.Info
if (Run-Command "Vitest - Unit Tests" "npm run test -- --passWithNoTests") {
    $passed += "Tests"
} else {
    $failed += "Tests"
    Write-Status "Dica: Use 'npm run test -- --watch' para debugar" -Status Warning -Indent 1
}
Write-Host ""

# 2. COVERAGE
Write-Host "2️⃣  COBERTURA DE TESTES" -ForegroundColor $colors.Info
if (Run-Command "Coverage Validation" "npm run test:coverage") {
    $passed += "Coverage"
} else {
    $failed += "Coverage"
    Write-Status "Cobertura abaixo de 80%" -Status Warning -Indent 1
    Write-Status "Adicione testes para linhas não cobertas" -Status Warning -Indent 1
}
Write-Host ""

# 3. DEPENDENCY AUDIT
Write-Host "3️⃣  AUDITORIA DE DEPENDÊNCIAS" -ForegroundColor $colors.Info
if (Run-Command "npm audit" "npm audit --audit-level=moderate") {
    $passed += "Audit"
} else {
    $failed += "Audit"
    Write-Status "Vulnerabilidades encontradas" -Status Warning -Indent 1
    Write-Status "Execute: npm audit fix" -Status Warning -Indent 1
}
Write-Host ""

# 4. SECRET SCAN
Write-Host "4️⃣  VERIFICAÇÃO DE SECRETS" -ForegroundColor $colors.Info
$secretPatterns = @(
    'password\s*[=:]',
    'api_key\s*[=:]',
    'secret\s*[=:]',
    'token\s*[=:]',
    'credentials\s*[=:]',
    'private_key\s*[=:]',
    'AWS_SECRET',
    'GITHUB_TOKEN'
)

$foundSecrets = $false
foreach ($pattern in $secretPatterns) {
    $matches = Get-ChildItem -Recurse -File -Exclude @('node_modules', '.git', 'dist', 'build') |
        Select-String -Pattern $pattern -ErrorAction SilentlyContinue

    if ($matches) {
        Write-Status "⚠️ Padrão detectado: $pattern" -Status Warning -Indent 1
        foreach ($match in $matches | Select-Object -First 3) {
            Write-Status "$($match.Path):$($match.LineNumber)" -Status Warning -Indent 2
        }
        $foundSecrets = $true
    }
}

if (-not $foundSecrets) {
    Write-Status "Secret Scan passou" -Status Success -Indent 1
    $passed += "Secrets"
} else {
    Write-Status "REMOVA SECRETS IMEDIATAMENTE" -Status Error -Indent 1
    $failed += "Secrets"
}
Write-Host ""

# 5. MIGRATION VALIDATION (se migrations existem)
Write-Host "5️⃣  VALIDAÇÃO DE MIGRAÇÕES" -ForegroundColor $colors.Info
if (Test-Path "infrastructure/migrations" -PathType Container) {
    if (Run-Command "Migration Validation" "npm run migrations:validate") {
        $passed += "Migrations"
    } else {
        $failed += "Migrations"
        Write-Status "Verifique UP/DOWN migrations" -Status Warning -Indent 1
    }
} else {
    Write-Status "Nenhuma migration encontrada (OK)" -Status Info -Indent 1
    $passed += "Migrations"
}
Write-Host ""

# 6. BUILD
Write-Host "6️⃣  BUILD" -ForegroundColor $colors.Info
if (Run-Command "Production Build" "npm run build") {
    $passed += "Build"
} else {
    $failed += "Build"
    Write-Status "Corrija os errors de build" -Status Warning -Indent 1
}
Write-Host ""

# Summary
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host "📊 RESUMO" -ForegroundColor $colors.Info
Write-Host ("=" * 60) -ForegroundColor $colors.Info
Write-Host ""

if ($passed.Count -gt 0) {
    Write-Status "Passou ($($passed.Count)): $($passed -join ', ')" -Status Success
}

if ($failed.Count -gt 0) {
    Write-Status "Falhou ($($failed.Count)): $($failed -join ', ')" -Status Error
}

Write-Status "Tempo total: ${duration:F2}s" -Status Info
Write-Host ""

# Checklist
if ($failed.Count -eq 0) {
    Write-Host "✅ TODOS OS CHECKS PASSARAM!" -ForegroundColor $colors.Success
    Write-Host "✨ Pronto para abrir Pull Request!" -ForegroundColor $colors.Success
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor $colors.Info
    Write-Host "  1. git push origin seu-branch" -ForegroundColor $colors.Info
    Write-Host "  2. Abrir PR no GitHub/GitLab" -ForegroundColor $colors.Info
    Write-Host "  3. Adicionar descrição clara" -ForegroundColor $colors.Info
    Write-Host "  4. Pedir code review" -ForegroundColor $colors.Info
    Write-Host ""
    exit 0
} else {
    Write-Host "❌ ALGUNS CHECKS FALHARAM" -ForegroundColor $colors.Error
    Write-Host "🚫 Não é seguro abrir PR agora" -ForegroundColor $colors.Error
    Write-Host ""

    Write-Host "Ações necessárias:" -ForegroundColor $colors.Warning

    if ($failed -contains "Tests") {
        Write-Host "  • Tests: npm run test -- --watch" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Coverage") {
        Write-Host "  • Coverage: Adicionar testes para cobertura >= 80%" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Audit") {
        Write-Host "  • Audit: npm audit fix (ou npm audit fix --force)" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Secrets") {
        Write-Host "  • Secrets: REMOVA IMEDIATAMENTE (git filter-branch se commitado)" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Migrations") {
        Write-Host "  • Migrations: Verifique UP/DOWN e teste localmente" -ForegroundColor $colors.Warning
    }
    if ($failed -contains "Build") {
        Write-Host "  • Build: npm run typecheck && npm run lint && npm run build" -ForegroundColor $colors.Warning
    }

    Write-Host ""
    exit 1
}
