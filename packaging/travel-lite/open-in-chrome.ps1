function Open-InChrome {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  $chrome = @(
    $env:ProgramFiles
    ${env:ProgramFiles(x86)}
    $env:LOCALAPPDATA
  ) | Where-Object { $_ } | ForEach-Object {
    Join-Path $_ 'Google\Chrome\Application\chrome.exe'
  } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if (-not $chrome) {
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
      )) {
      try {
        $chrome = Get-ItemPropertyValue -Path $key -Name '(default)' -ErrorAction Stop
        break
      }
      catch {
        $chrome = $null
      }
    }
  }

  if (-not $chrome) {
    Write-Warning "Google Chrome não encontrado. Abra manualmente: $Url"
    return
  }

  Start-Process -FilePath $chrome -ArgumentList $Url | Out-Null
}
