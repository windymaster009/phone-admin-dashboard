[CmdletBinding()]
param(
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $PSScriptRoot 'output'
}

$gradleRoot = Join-Path $env:USERPROFILE '.gradle\wrapper\dists'
$gradleExecutable = Get-ChildItem -Path (Join-Path $gradleRoot 'gradle-*-bin\*\gradle-*\bin\gradle.bat') -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        if ($_.FullName -match '\\gradle-(\d+\.\d+(?:\.\d+)?)\\bin\\gradle\.bat$') {
            [PSCustomObject]@{ File = $_; Version = [version]$Matches[1] }
        }
    } |
    Where-Object { $_.Version -ge [version]'9.2' } |
    Sort-Object Version -Descending |
    Select-Object -First 1

if (-not $gradleExecutable) {
    throw 'Gradle 9.2 or newer was not found. Open android-app in Android Studio once, then run this command again.'
}

if (-not $env:ANDROID_HOME) {
    $androidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (-not (Test-Path -LiteralPath $androidSdk -PathType Container)) {
        throw 'Android SDK was not found. Install Android SDK Platform 36 in Android Studio.'
    }
    $env:ANDROID_HOME = $androidSdk
}

& $gradleExecutable.File.FullName --project-dir $PSScriptRoot :app:testShopUnitTest :app:lintShop :app:assembleShop
if ($LASTEXITCODE -ne 0) {
    throw "Android shop build failed with exit code $LASTEXITCODE."
}

$sourceApk = Join-Path $PSScriptRoot 'app\build\outputs\apk\shop\app-shop.apk'
if (-not (Test-Path -LiteralPath $sourceApk -PathType Leaf)) {
    throw "Gradle completed but the shop APK was not found at $sourceApk."
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$versionMatch = Select-String -LiteralPath (Join-Path $PSScriptRoot 'app\build.gradle') -Pattern 'versionName\s+"([^"]+)"' | Select-Object -First 1
if (-not $versionMatch) {
    throw 'Could not read the Android versionName from app/build.gradle.'
}
$versionName = $versionMatch.Matches[0].Groups[1].Value
$destinationApk = Join-Path $OutputDirectory "PhoneFlow-Shop-$versionName.apk"
Copy-Item -LiteralPath $sourceApk -Destination $destinationApk -Force

$hash = (Get-FileHash -LiteralPath $destinationApk -Algorithm SHA256).Hash
Write-Output "PhoneFlow Shop APK: $destinationApk"
Write-Output "SHA256: $hash"
