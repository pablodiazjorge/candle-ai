# session-end.ps1
# Logs the end of an AI coding session with token and cost estimates.
# Run at the end of each conversation.
# Accepts optional parameters for token counts if agent provides them.

param(
    [int]$InputTokens = 0,
    [int]$OutputTokens = 0,
    [int]$CachedTokens = 0,
    [int]$TurnCount = 0,
    [int]$FilesRead = 0,
    [string]$Provider = "deepseek-v3"
)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$sessionId = $env:PROMPT_FORGE_SESSION_ID

if (-not $sessionId) {
    Write-Host "WARNING: No session ID found. Run session-start.ps1 first." -ForegroundColor Yellow
    $sessionId = "unknown-" + [guid]::NewGuid().ToString().Substring(0, 8)
}

# Pricing per 1M tokens (USD, as of 2026-06-24)
# Sources: openai.com/api/pricing, platform.claude.com/docs/pricing,
#          api-docs.deepseek.com, platform.kimi.com/docs/pricing,
#          platform.minimax.io/docs/pricing
$pricing = @{
    # ── OpenAI ──
    "gpt-5.5"             = @{ input = 5.00;  output = 30.00; cached = 0.50 }
    "gpt-5.4"             = @{ input = 2.50;  output = 15.00; cached = 0.25 }
    "gpt-5.4-mini"        = @{ input = 0.75;  output = 4.50;  cached = 0.075 }
    # ── Anthropic Claude ──
    "claude-opus-4.8"     = @{ input = 5.00;  output = 25.00; cached = 0.50 }
    "claude-opus-4.7"     = @{ input = 5.00;  output = 25.00; cached = 0.50 }
    "claude-sonnet-4.6"   = @{ input = 3.00;  output = 15.00; cached = 0.30 }
    "claude-sonnet-4.5"   = @{ input = 3.00;  output = 15.00; cached = 0.30 }
    "claude-haiku-4.5"    = @{ input = 1.00;  output = 5.00;  cached = 0.10 }
    "claude-fable-5"      = @{ input = 10.00; output = 50.00; cached = 1.00 }
    # ── DeepSeek ──
    "deepseek-v4-flash"   = @{ input = 0.14;  output = 0.28;  cached = 0.0028 }
    "deepseek-v4-pro"     = @{ input = 0.435; output = 0.87;  cached = 0.003625 }
    # Aliases for backward compatibility
    "deepseek-v3"         = @{ input = 0.14;  output = 0.28;  cached = 0.0028 }
    "deepseek-r1"         = @{ input = 0.14;  output = 0.28;  cached = 0.0028 }
    # ── Kimi / Moonshot ──
    "kimi-k2.7-code"      = @{ input = 0.90;  output = 3.73;  cached = 0.18 }
    "kimi-k2.6"           = @{ input = 0.90;  output = 3.73;  cached = 0.15 }
    # ── MiniMax ──
    "minimax-m3"          = @{ input = 0.30;  output = 1.20;  cached = 0.06 }
    "minimax-m2.7"        = @{ input = 0.30;  output = 1.20;  cached = 0.06 }
    # ── GitHub Copilot (subscription-based, no per-token cost) ──
    "copilot"             = @{ input = 0;     output = 0;     cached = 0 }
}

$rate = $pricing[$Provider]
if (-not $rate) {
    Write-Host "Unknown provider '$Provider'. Using DeepSeek V3 pricing." -ForegroundColor Yellow
    $rate = $pricing["deepseek-v3"]
}

# Calculate cost
$inputCost  = [Math]::Round(($InputTokens / 1000000) * $rate.input, 4)
$outputCost = [Math]::Round(($OutputTokens / 1000000) * $rate.output, 4)
$cachedCost = [Math]::Round(($CachedTokens / 1000000) * $rate.cached, 4)
$totalCost  = [Math]::Round($inputCost + $outputCost + $cachedCost, 4)
$totalTokens = $InputTokens + $OutputTokens + $CachedTokens

# Update session log
$sessionDir = Join-Path $PSScriptRoot ".." ".prompt-forge" "logs"
$logFile = Join-Path $sessionDir "session-$sessionId.json"

if (Test-Path $logFile) {
    $log = Get-Content $logFile | ConvertFrom-Json
    $log | Add-Member -MemberType NoteProperty -Name "endedAt" -Value $timestamp -Force
    $log | Add-Member -MemberType NoteProperty -Name "inputTokens" -Value $InputTokens -Force
    $log | Add-Member -MemberType NoteProperty -Name "outputTokens" -Value $OutputTokens -Force
    $log | Add-Member -MemberType NoteProperty -Name "cachedTokens" -Value $CachedTokens -Force
    $log | Add-Member -MemberType NoteProperty -Name "totalTokens" -Value $totalTokens -Force
    $log | Add-Member -MemberType NoteProperty -Name "cost" -Value $totalCost -Force
    $log | Add-Member -MemberType NoteProperty -Name "provider" -Value $Provider -Force
    $log | Add-Member -MemberType NoteProperty -Name "turnCount" -Value $TurnCount -Force
    $log | Add-Member -MemberType NoteProperty -Name "filesRead" -Value $FilesRead -Force
    $log | ConvertTo-Json -Compress | Set-Content -Path $logFile
}

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SESSION TOKEN REPORT" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  Input tokens:  {0,8:N0}  (${1:F4})" -f $InputTokens, $inputCost)
Write-Host ("  Output tokens: {0,8:N0}  (${1:F4})" -f $OutputTokens, $outputCost)
Write-Host ("  Cached tokens: {0,8:N0}  (${1:F4})" -f $CachedTokens, $cachedCost)
Write-Host ("  ─────────────────────────────────" -f "")
Write-Host ("  Total tokens:  {0,8:N0}  (${1:F4})" -f $totalTokens, $totalCost)
Write-Host ""
Write-Host ("  Provider: {0}" -f $Provider)
Write-Host ("  Turns: {0}  |  Files read: {1}" -f $TurnCount, $FilesRead)
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

# Append to cumulative log
$cumulativeLog = Join-Path $sessionDir "cumulative.jsonl"
$cumulativeEntry = @{
    date         = $timestamp
    sessionId    = $sessionId
    inputTokens  = $InputTokens
    outputTokens = $OutputTokens
    cachedTokens = $CachedTokens
    totalTokens  = $totalTokens
    cost         = $totalCost
    provider     = $Provider
    turns        = $TurnCount
} | ConvertTo-Json -Compress

Add-Content -Path $cumulativeLog -Value $cumulativeEntry

# Cleanup env var
Remove-Item Env:\PROMPT_FORGE_SESSION_ID -ErrorAction SilentlyContinue
