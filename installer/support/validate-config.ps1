[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [Parameter(Mandatory = $true)]
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'

function Write-Result {
  param([string]$Message)
  [System.IO.File]::WriteAllText($ResultFile, $Message, [System.Text.UTF8Encoding]::new($false))
}

function Test-Placeholder {
  param([string]$Value)
  return $Value -match '<[^>]+>|YOUR_|GENERATE_|CHANGE_ME|REPLACE_ME'
}

function Test-Base64Key {
  param([string]$Value)
  try {
    return [Convert]::FromBase64String($Value).Length -eq 32
  } catch {
    return $false
  }
}

try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw 'Select a valid .env configuration file.'
  }

  $values = @{}
  $lineNumber = 0
  foreach ($rawLine in [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Path))) {
    $lineNumber += 1
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    if ($line.StartsWith('export ')) { $line = $line.Substring(7).TrimStart() }

    $match = [regex]::Match($line, '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
    if (-not $match.Success) {
      throw "Invalid configuration syntax on line $lineNumber."
    }

    $name = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      } else {
        $value = ($value -replace '\s+#.*$', '').TrimEnd()
      }
    } else {
      $value = ($value -replace '\s+#.*$', '').TrimEnd()
    }

    if ($values.ContainsKey($name)) {
      throw "Configuration key $name is declared more than once."
    }
    $values[$name] = $value
  }

  $required = @('MONGO_URI', 'JWT_SECRET', 'AUTH_BOOTSTRAP_TOKEN', 'TWO_FACTOR_ENCRYPTION_KEY', 'DOCUMENT_ENCRYPTION_KEY')
  foreach ($name in $required) {
    if (-not $values.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($values[$name])) {
      throw "$name is required."
    }
    if (Test-Placeholder $values[$name]) {
      throw "$name still contains a placeholder value."
    }
  }

  if ($values.MONGO_URI -notmatch '^mongodb(?:\+srv)?://') {
    throw 'MONGO_URI must start with mongodb:// or mongodb+srv://.'
  }
  if ($values.JWT_SECRET.Length -lt 32) {
    throw 'JWT_SECRET must contain at least 32 characters.'
  }
  if ($values.AUTH_BOOTSTRAP_TOKEN.Length -lt 32) {
    throw 'AUTH_BOOTSTRAP_TOKEN must contain at least 32 characters.'
  }
  if (-not (Test-Base64Key $values.TWO_FACTOR_ENCRYPTION_KEY)) {
    throw 'TWO_FACTOR_ENCRYPTION_KEY must be a base64 value that decodes to exactly 32 bytes.'
  }
  if (($values.DOCUMENT_ENCRYPTION_KEY -notmatch '^[a-fA-F0-9]{64}$') -and
      -not (Test-Base64Key $values.DOCUMENT_ENCRYPTION_KEY)) {
    throw 'DOCUMENT_ENCRYPTION_KEY must be 64 hexadecimal characters or base64 that decodes to exactly 32 bytes.'
  }

  if ($values.ContainsKey('TRUST_PROXY') -and $values.TRUST_PROXY.Trim().ToLowerInvariant() -eq 'true') {
    throw 'TRUST_PROXY=true is unsafe. Use false, a trusted address, or a proxy hop count.'
  }

  if ($values.ContainsKey('PAYWAY_ENABLED') -and $values.PAYWAY_ENABLED.Trim().ToLowerInvariant() -eq 'true') {
    foreach ($name in @('PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY')) {
      if (-not $values.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($values[$name]) -or (Test-Placeholder $values[$name])) {
        throw "$name must be configured when PayWay is enabled."
      }
    }
    if ($values.ContainsKey('PAYWAY_CALLBACK_URL') -and $values.PAYWAY_CALLBACK_URL -and
        $values.PAYWAY_CALLBACK_URL -notmatch '^https://') {
      throw 'PAYWAY_CALLBACK_URL must use HTTPS.'
    }
  }

  Write-Result 'Configuration is valid.'
  exit 0
} catch {
  Write-Result $_.Exception.Message
  exit 1
}
