# Chạy 704-assets (do Task Scheduler gọi). Đọc .env cạnh file này rồi chạy node server.js, ghi log xoay vòng đơn giản.
$root = $PSScriptRoot
Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"'), "Process") }
}
$logs = "$root\logs"; New-Item -ItemType Directory -Force $logs | Out-Null
foreach ($f in "app.log","app.err.log") { if ((Test-Path "$logs\$f") -and ((Get-Item "$logs\$f").Length -gt 10MB)) { Move-Item "$logs\$f" "$logs\$f.old" -Force } }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
Set-Location "$root\app"
& $node server.js >> "$logs\app.log" 2>> "$logs\app.err.log"
exit $LASTEXITCODE
