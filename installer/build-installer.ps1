[CmdletBinding()]
param(
  [string]$InnoCompiler = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$installerRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $installerRoot '..'))
$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $installerRoot '.build'))
$cacheRoot = [System.IO.Path]::GetFullPath((Join-Path $installerRoot '.cache'))

if (-not $buildRoot.StartsWith($installerRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to clean a build directory outside the installer folder.'
}

$package = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "package.json version must use numeric major.minor.patch format; found '$version'."
}

$nodeVersion = '24.21.0'
$nodeArchiveName = "node-v$nodeVersion-win-x64.zip"
$nodeArchiveHash = '158F7685B44DE51F6C0DF1D153526CBCD3E1BC739A8DFC607721CEF75DE9E541'
$nodeArchiveUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeArchiveName"
$winSwVersion = '2.12.0'
$winSwHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

function Get-VerifiedDownload {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$Sha256
  )

  if (Test-Path -LiteralPath $Destination) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
    if ($actual -ne $Sha256) {
      Remove-Item -LiteralPath $Destination -Force
    }
  }

  if (-not (Test-Path -LiteralPath $Destination)) {
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination
  }

  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
  if ($actual -ne $Sha256) {
    throw "SHA-256 verification failed for $Destination."
  }
}

if (Test-Path -LiteralPath $buildRoot) {
  Remove-Item -LiteralPath $buildRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $buildRoot, $cacheRoot | Out-Null

Push-Location $repositoryRoot
try {
  Write-Host "Building PhoneFlow $version frontend..."
  Invoke-CheckedCommand 'npm.cmd' 'run' 'build'
} finally {
  Pop-Location
}

$stageRoot = Join-Path $buildRoot 'stage'
$releaseRoot = Join-Path $stageRoot 'release'
$applicationRoot = Join-Path $releaseRoot 'app'
$runtimeRoot = Join-Path $releaseRoot 'runtime'
$serviceRoot = Join-Path $stageRoot 'service'
New-Item -ItemType Directory -Force -Path $applicationRoot, $runtimeRoot, $serviceRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $repositoryRoot 'dist') -Destination (Join-Path $applicationRoot 'dist') -Recurse
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'server') -Destination (Join-Path $applicationRoot 'server') -Recurse
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'package.json') -Destination $applicationRoot
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'package-lock.json') -Destination $applicationRoot

Push-Location $applicationRoot
try {
  Write-Host 'Installing production dependencies into the release payload...'
  Invoke-CheckedCommand 'npm.cmd' 'ci' '--omit=dev' '--no-audit' '--no-fund'
} finally {
  Pop-Location
}

$nodeArchive = Join-Path $cacheRoot $nodeArchiveName
Get-VerifiedDownload -Url $nodeArchiveUrl -Destination $nodeArchive -Sha256 $nodeArchiveHash
$nodeExtractRoot = Join-Path $buildRoot 'node-runtime'
Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtractRoot -Force
$nodeDistribution = Join-Path $nodeExtractRoot "node-v$nodeVersion-win-x64"
Copy-Item -LiteralPath (Join-Path $nodeDistribution 'node.exe') -Destination $runtimeRoot
Copy-Item -LiteralPath (Join-Path $nodeDistribution 'LICENSE') -Destination (Join-Path $runtimeRoot 'NODE_LICENSE.txt')

$winSwCache = Join-Path $cacheRoot "WinSW-x64-v$winSwVersion.exe"
Get-VerifiedDownload -Url $winSwUrl -Destination $winSwCache -Sha256 $winSwHash
Copy-Item -LiteralPath $winSwCache -Destination (Join-Path $serviceRoot 'PhoneFlowService.exe')

$serviceTemplate = Get-Content -LiteralPath (Join-Path $installerRoot 'PhoneFlowService.xml.template') -Raw
$serviceXml = $serviceTemplate.Replace('{{VERSION}}', $version)
[System.IO.File]::WriteAllText(
  (Join-Path $serviceRoot 'PhoneFlowService.xml'),
  $serviceXml,
  [System.Text.UTF8Encoding]::new($false)
)

if (-not $InnoCompiler) {
  $compilerCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $InnoCompiler = $compilerCandidates | Select-Object -First 1
}

if (-not $InnoCompiler -or -not (Test-Path -LiteralPath $InnoCompiler -PathType Leaf)) {
  throw 'Inno Setup 6 compiler was not found. Install Inno Setup or pass -InnoCompiler C:\path\to\ISCC.exe.'
}

Write-Host 'Compiling the Windows installer...'
Push-Location $installerRoot
try {
  Invoke-CheckedCommand $InnoCompiler '/Qp' "/DMyAppVersion=$version" 'PhoneFlow.iss'
} finally {
  Pop-Location
}

$installer = Join-Path $buildRoot "output\PhoneFlow-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw 'Inno Setup completed without producing the expected installer.'
}

$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash
Write-Host ''
Write-Host "Installer: $installer"
Write-Host "SHA-256:  $installerHash"
