[CmdletBinding()]
param(
  [string]$Url = 'http://127.0.0.1:5000/api/health',
  [int]$TimeoutSeconds = 90,
  [Parameter(Mandatory = $true)]
  [string]$ResultFile
)

$ErrorActionPreference = 'SilentlyContinue'
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$lastMessage = 'PhoneFlow did not respond.'

while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($response.ok -eq $true -and $response.database -eq 'connected') {
      [System.IO.File]::WriteAllText($ResultFile, 'PhoneFlow is running and connected to the database.', [System.Text.UTF8Encoding]::new($false))
      exit 0
    }
    $lastMessage = 'PhoneFlow responded, but its database is not connected.'
  } catch {
    if ($_.Exception.Message) { $lastMessage = $_.Exception.Message }
  }
  Start-Sleep -Seconds 2
}

[System.IO.File]::WriteAllText($ResultFile, "PhoneFlow failed its startup check: $lastMessage", [System.Text.UTF8Encoding]::new($false))
exit 1
