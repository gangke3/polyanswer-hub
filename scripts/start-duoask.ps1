$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$sharedBrowserDir = Join-Path $projectRoot "data\sessions\shared-browser-native"
$electronPath = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"
$builtMainPath = Join-Path $projectRoot "apps\desktop\dist\apps\desktop\electron\main\index.js"

function Stop-ProcessTreeById {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
  )

  try {
    & taskkill /PID $ProcessId /T /F | Out-Null
  } catch {
    Write-Host "Failed to stop PID ${ProcessId}: $($_.Exception.Message)"
  }
}

function Stop-DuoAskProcesses {
  Write-Host "Stopping existing DuoAsk processes..."

  $projectPattern = $projectRoot.ToLower()
  $browserProfilePattern = $sharedBrowserDir.ToLower()

  $electronProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "electron.exe" -and (
        ($_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $electronPath.ToLower()) -or
        ($_.CommandLine -and $_.CommandLine.ToLower().Contains($projectPattern))
      )
    }

  $nodeProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -and
      $_.CommandLine.ToLower().Contains($projectPattern)
    }

  $browserProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      @("chrome.exe", "msedge.exe") -contains $_.Name -and
      $_.CommandLine -and
      $_.CommandLine.ToLower().Contains($browserProfilePattern)
    }

  $allProcesses = @($electronProcesses) + @($nodeProcesses) + @($browserProcesses) |
    Sort-Object ProcessId -Unique

  foreach ($process in $allProcesses) {
    Write-Host ("Stopping {0} PID={1}" -f $process.Name, $process.ProcessId)
    Stop-ProcessTreeById -ProcessId $process.ProcessId
  }

  Start-Sleep -Seconds 2
}

function Build-DuoAsk {
  Write-Host "Building DuoAsk workspace..."
  Push-Location $projectRoot
  try {
    & npm.cmd run build -w @multi-ai/desktop
    if ($LASTEXITCODE -ne 0) {
      throw "Desktop build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $builtMainPath)) {
    throw "Build finished, but main entry was still not found: $builtMainPath"
  }
}

function Start-DuoAsk {
  Write-Host "Starting 多问 DuoAsk..."
  Start-Process -FilePath $electronPath `
    -ArgumentList $builtMainPath `
    -WorkingDirectory $projectRoot
}

Stop-DuoAskProcesses
Build-DuoAsk
Start-DuoAsk

Write-Host "多问 DuoAsk restart command completed."
