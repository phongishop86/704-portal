# Nhắc việc hằng sáng (chỉ cần khi dùng Telegram).
$root = $PSScriptRoot
$cfg = @{}; Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() } }
Invoke-RestMethod -Uri "http://localhost:$($cfg['PORT'])/api/cron/remind" -Headers @{ Authorization = "Bearer $($cfg['CRON_SECRET'])" } | Out-Null
