$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$packageJsonPath = Join-Path $projectRoot "package.json"
$packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
$version = $packageJson.version

$electronDist = Join-Path $projectRoot "node_modules\electron\dist"
$releaseRoot = Join-Path $projectRoot "release"
$stageName = "DuoAsk-$version-win-x64-portable"
$stageRoot = Join-Path $releaseRoot $stageName
$appRoot = Join-Path $stageRoot "resources\app"
$nodeModulesRoot = Join-Path $appRoot "node_modules"
$scopedModulesRoot = Join-Path $nodeModulesRoot "@multi-ai"
$zipPath = Join-Path $releaseRoot "$stageName.zip"
$hashPath = "$zipPath.sha256"

function Assert-PathInside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Root
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root)

  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside release directory: $fullPath"
  }
}

function Remove-SafeItem {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (Test-Path -LiteralPath $Path) {
    Assert-PathInside -Path $Path -Root $releaseRoot
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Copy-Directory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing required path: $Source"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Copy-File {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing required file: $Source"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-WorkspacePackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackageName,
    [Parameter(Mandatory = $true)]
    [string]$SourceDirectory
  )

  $destination = Join-Path $scopedModulesRoot $PackageName
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-File -Source (Join-Path $SourceDirectory "package.json") -Destination (Join-Path $destination "package.json")
  Copy-Directory -Source (Join-Path $SourceDirectory "dist") -Destination (Join-Path $destination "dist")
}

if (-not (Test-Path -LiteralPath $electronDist)) {
  throw "Electron distribution was not found. Run npm install first: $electronDist"
}

Push-Location $projectRoot
try {
  Write-Host "Building DuoAsk..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Remove-SafeItem -Path $stageRoot
Remove-SafeItem -Path $zipPath
Remove-SafeItem -Path $hashPath

Write-Host "Staging Electron runtime..."
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
Copy-Item -Path (Join-Path $electronDist "*") -Destination $stageRoot -Recurse -Force

$defaultAppAsar = Join-Path $stageRoot "resources\default_app.asar"
if (Test-Path -LiteralPath $defaultAppAsar) {
  Remove-Item -LiteralPath $defaultAppAsar -Force
}

$electronExe = Join-Path $stageRoot "electron.exe"
$duoAskExe = Join-Path $stageRoot "DuoAsk.exe"
if (Test-Path -LiteralPath $electronExe) {
  Rename-Item -LiteralPath $electronExe -NewName "DuoAsk.exe"
}

if (-not (Test-Path -LiteralPath $duoAskExe)) {
  throw "Packaged executable was not created: $duoAskExe"
}

Write-Host "Staging application files..."
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null

$appPackage = [ordered]@{
  name = "duoask"
  version = $version
  description = $packageJson.description
  license = "MIT"
  type = "module"
  main = "apps/desktop/dist/apps/desktop/electron/main/index.js"
}

($appPackage | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath (Join-Path $appRoot "package.json") -Encoding UTF8
Copy-File -Source (Join-Path $projectRoot "LICENSE") -Destination (Join-Path $appRoot "LICENSE")
Copy-File -Source (Join-Path $projectRoot "README.md") -Destination (Join-Path $appRoot "README.md")
Copy-Directory -Source (Join-Path $projectRoot "apps\desktop\dist") -Destination (Join-Path $appRoot "apps\desktop\dist")

Write-Host "Staging workspace packages..."
New-Item -ItemType Directory -Force -Path $scopedModulesRoot | Out-Null
Copy-WorkspacePackage -PackageName "browser-runner" -SourceDirectory (Join-Path $projectRoot "packages\browser-runner")
Copy-WorkspacePackage -PackageName "orchestrator" -SourceDirectory (Join-Path $projectRoot "packages\orchestrator")
Copy-WorkspacePackage -PackageName "providers" -SourceDirectory (Join-Path $projectRoot "packages\providers")
Copy-WorkspacePackage -PackageName "shared" -SourceDirectory (Join-Path $projectRoot "packages\shared")
Copy-WorkspacePackage -PackageName "synthesizer" -SourceDirectory (Join-Path $projectRoot "packages\synthesizer")

Write-Host "Staging runtime dependencies..."
New-Item -ItemType Directory -Force -Path $nodeModulesRoot | Out-Null
Copy-Directory -Source (Join-Path $projectRoot "node_modules\nodemailer") -Destination (Join-Path $nodeModulesRoot "nodemailer")
Copy-Directory -Source (Join-Path $projectRoot "node_modules\playwright") -Destination (Join-Path $nodeModulesRoot "playwright")
Copy-Directory -Source (Join-Path $projectRoot "node_modules\playwright-core") -Destination (Join-Path $nodeModulesRoot "playwright-core")

Write-Host "Creating portable zip..."
Compress-Archive -Path $stageRoot -DestinationPath $zipPath -Force

$hash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
"$($hash.Hash)  $(Split-Path -Leaf $zipPath)" | Set-Content -LiteralPath $hashPath -Encoding ASCII

Write-Host "Portable package created:"
Write-Host "  $zipPath"
Write-Host "  $hashPath"
