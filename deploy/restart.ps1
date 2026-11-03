# Khởi động lại 704-assets nhanh (ứng dụng + bot Telegram + HTTPS nếu có). Dùng sau khi sửa .env.
$root = $PSScriptRoot
if (-not (Test-Path "$root\.env") -and (Test-Path "C:\704-assets\.env")) { $root = "C:\704-assets" }  # chạy từ thư mục nguồn thì dùng bản đã cài
$port = 3000; if (Test-Path "$root\.env") { Get-Content "$root\.env" | ForEach-Object { if ($_ -match '^PORT=(\d+)') { $port = [int]$Matches[1] } } }
foreach ($t in "704-assets-telegram","704-assets") { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*tg-poll.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 3
Start-ScheduledTask -TaskName "704-assets"
if (Get-ScheduledTask -TaskName "704-assets-telegram" -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName "704-assets-telegram" }
if (Get-ScheduledTask -TaskName "704-assets-https" -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName "704-assets-https" -ErrorAction SilentlyContinue; Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force; Start-ScheduledTask -TaskName "704-assets-https" }
$ok = $false
for ($i = 0; $i -lt 30; $i++) { Start-Sleep 2; try { Invoke-WebRequest "http://localhost:$port/api/auth/me" -UseBasicParsing -TimeoutSec 4 | Out-Null; $ok = $true; break } catch { if ($_.Exception.Response) { $ok = $true; break } } }
if ($ok) { Write-Host "Đã khởi động lại - ứng dụng phản hồi tại http://localhost:$port" -ForegroundColor Green } else { Write-Host "Chưa phản hồi sau 60 giây. Xem $root\logs\app.err.log" -ForegroundColor Yellow; exit 1 }
