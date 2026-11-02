# Chạy bot Telegram (getUpdates) - do Task Scheduler gọi. Tự chờ ứng dụng sẵn sàng.
$root = $PSScriptRoot
Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"'), "Process") }
}
$logs = "$root\logs"; New-Item -ItemType Directory -Force $logs | Out-Null
if ((Test-Path "$logs\telegram.log") -and ((Get-Item "$logs\telegram.log").Length -gt 5MB)) { Move-Item "$logs\telegram.log" "$logs\telegram.log.old" -Force }
if (-not $env:TELEGRAM_BOT_TOKEN) { "Chưa có TELEGRAM_BOT_TOKEN trong .env" | Out-File "$logs\telegram.log" -Append; exit 2 }
for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest "http://127.0.0.1:$($env:PORT)/api/auth/me" -UseBasicParsing -TimeoutSec 3 | Out-Null; break } catch { if ($_.Exception.Response) { break }; Start-Sleep 2 } }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
& $node "$root\app\scripts\tg-poll.mjs" >> "$logs\telegram.log" 2>&1
exit $LASTEXITCODE
