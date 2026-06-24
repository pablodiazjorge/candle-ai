# session-start.ps1
# Logs the start of an AI coding session for token tracking.
# Run at the beginning of each conversation.

$sessionDir = Join-Path $PSScriptRoot ".." ".prompt-forge" "logs"
if (-not (Test-Path $sessionDir)) {
    New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$sessionId = [guid]::NewGuid().ToString()

$logEntry = @{
    sessionId  = $sessionId
    startedAt  = $timestamp
    hostname   = $env:COMPUTERNAME
    user       = $env:USERNAME
    cwd        = Get-Location | Select-Object -ExpandProperty Path
} | ConvertTo-Json -Compress

$logFile = Join-Path $sessionDir "session-$sessionId.json"
$logEntry | Set-Content -Path $logFile

Write-Host "Session started: $timestamp" -ForegroundColor Green
Write-Host "Session ID: $sessionId" -ForegroundColor Gray
Write-Host "Log: $logFile" -ForegroundColor Gray

# Export session ID for session-end.ps1 to pick up
$env:PROMPT_FORGE_SESSION_ID = $sessionId
