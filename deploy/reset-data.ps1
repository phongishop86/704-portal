<#
 XÓA TRẮNG DỮ LIỆU để thử cài từ đầu (giữ nguyên ứng dụng, .env, dịch vụ). Tạo lại tài khoản admin.
   powershell -ExecutionPolicy Bypass -File reset-data.ps1 [-AdminPassword "MatKhauMoi@2026"] [-AdminUser admin] [-Yes]
 An toàn: trước khi xóa, script sao lưu data.json vào data\backups\truoc-khi-xoa-<thời gian>.json.
 Người dùng, tài sản, phiếu, nhật ký... đều bị xóa. Trình duyệt cần xóa dữ liệu trang sau đó (Ctrl+Shift+Delete).
#>
param([string]$AdminPassword = "", [string]$AdminUser = "admin", [switch]$Yes)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not (Test-Path "$root\.env") -and (Test-Path "C:\704-assets\.env")) { $root = "C:\704-assets" }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Hãy chạy bằng quyền Administrator." }
if (-not $Yes) { $c = Read-Host "Việc này XÓA TOÀN BỘ dữ liệu trong $root\data. Gõ XOA để xác nhận"; if ($c -ne "XOA") { Write-Host "Đã hủy."; exit 0 } }
if (-not $AdminPassword) { $AdminPassword = "Adm!" + (-join ((48..57) + (97..122) | Get-Random -Count 8 | ForEach-Object { [char]$_ })) }
$cfg = @{}; Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() } }
$port = $cfg["PORT"]
foreach ($t in "704-assets-telegram","704-assets") { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*tg-poll.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 3
$d = "$root\data"; New-Item -ItemType Directory -Force "$d\backups" | Out-Null
if (Test-Path "$d\data.json") { Copy-Item "$d\data.json" ("$d\backups\truoc-khi-xoa-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json") -Force; Write-Host "Đã sao lưu dữ liệu cũ vào $d\backups" }
Remove-Item "$d\data.json","$d\data.json.bak","$d\data.json.tmp" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "704-assets"
$ok = $false
for ($i = 0; $i -lt 30; $i++) { Start-Sleep 2; try { Invoke-WebRequest "http://localhost:$port/api/auth/me" -UseBasicParsing -TimeoutSec 4 | Out-Null; $ok = $true; break } catch { if ($_.Exception.Response) { $ok = $true; break } } }
if (-not $ok) { throw "Ứng dụng chưa chạy lại - xem $root\logs\app.err.log" }
$body = @{ username = $AdminUser; password = $AdminPassword; full_name = "Quản trị hệ thống" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:$port/api/admin/bootstrap" -Headers @{ "x-admin-key" = $cfg["ADMIN_KEY"] } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
if (Get-ScheduledTask -TaskName "704-assets-telegram" -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName "704-assets-telegram" }
[IO.File]::WriteAllText("$root\TAI_KHOAN_BAN_DAU.txt", "Tài khoản quản trị: $AdminUser / $AdminPassword`r`n(Hãy đổi mật khẩu sau khi đăng nhập rồi xóa file này)", (New-Object Text.UTF8Encoding($true)))
Write-Host ""
Write-Host "ĐÃ XÓA TRẮNG. Tài khoản quản trị: $AdminUser / $AdminPassword" -ForegroundColor Green
Write-Host "Việc tiếp theo: xóa dữ liệu trang của trình duyệt, đăng nhập, nạp dữ liệu bằng import-excel.ps1."
