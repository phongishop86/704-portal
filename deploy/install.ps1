<#
 CÀI ĐẶT 704-assets trên Windows Server 2019 (chạy bằng PowerShell "Run as Administrator",
 trong thư mục đã giải nén gói 704-assets-win.zip):
     powershell -ExecutionPolicy Bypass -File .\install.ps1
 Tham số:  -InstallDir C:\704-assets   -Port 3000   -AdminUser admin   -AdminPassword "..."
 Có thể chạy lại để NÂNG CẤP: giữ nguyên .env và dữ liệu, chỉ thay mã ứng dụng.
#>
param(
  [string]$InstallDir = "C:\704-assets",
  [int]$Port = 3000,
  [string]$AdminUser = "admin",
  [string]$AdminPassword = "",
  [switch]$SkipFirewall
)
$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function RandHex($n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString("x2") }) -join "" }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Hãy mở PowerShell bằng 'Run as Administrator'."
}
if (-not (Test-Path "$src\app\server.js")) { throw "Không thấy app\server.js cạnh install.ps1. Hãy giải nén đủ gói 704-assets-win.zip." }

# 1) Node.js -------------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $msi = Get-ChildItem "$src" -Filter "node-v*-x64.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $msi) {
    Say "Chưa có Node.js và không có file .msi kèm theo - thử tải về (cần Internet)"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $url = "https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi"
    $msiPath = Join-Path $env:TEMP "node-x64.msi"
    Invoke-WebRequest $url -OutFile $msiPath
  } else { $msiPath = $msi.FullName }
  Say "Cài Node.js"
  Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { throw "Cài Node.js không thành công. Cài thủ công rồi chạy lại." }
}
Say "Node: $(& $node -v)  ($node)"

# 2) Sao chép ứng dụng ----------------------------------------------------
$appDir = Join-Path $InstallDir "app"; $dataDir = Join-Path $InstallDir "data"; $logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force $InstallDir,$dataDir,$logDir | Out-Null
$task = Get-ScheduledTask -TaskName "704-assets" -ErrorAction SilentlyContinue
if ($task) { Say "Dừng dịch vụ cũ"; Stop-ScheduledTask -TaskName "704-assets" -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep 2 }
if (Test-Path $appDir) { Remove-Item $appDir -Recurse -Force }
Say "Chép mã ứng dụng vào $appDir"
Copy-Item "$src\app" $appDir -Recurse -Force
foreach ($f in "start.ps1","backup.ps1","restore.ps1","cron-remind.ps1","uninstall.ps1","import-excel.ps1") { if (Test-Path "$src\$f") { Copy-Item "$src\$f" $InstallDir -Force } }

# 3) Cấu hình .env (giữ nếu đã có) -----------------------------------------
$envFile = Join-Path $InstallDir ".env"
$firstTime = -not (Test-Path $envFile)
if ($firstTime) {
  Say "Tạo .env với khóa ngẫu nhiên"
  $t = Get-Content "$src\env.local.template" -Raw -Encoding UTF8
  $t = $t.Replace("__DATA_DIR__", $dataDir).Replace("__SESSION_SECRET__", (RandHex 32)).Replace("__ADMIN_KEY__", (RandHex 16)).Replace("__CRON_SECRET__", (RandHex 16))
  $t = $t -replace "(?m)^PORT=.*$", "PORT=$Port"
  [IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))
  icacls $envFile /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
} else { Say ".env đã có - giữ nguyên" }
$cfg = @{}; Get-Content $envFile -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } }
$Port = [int]$cfg["PORT"]

# 4) Dịch vụ (Task Scheduler, chạy nền khi khởi động, tự khởi động lại khi lỗi) ----
Say "Đăng ký tác vụ khởi động '704-assets'"
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\start.ps1`"" -WorkingDirectory $InstallDir
$trg = New-ScheduledTaskTrigger -AtStartup
$pri = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "704-assets" -Action $act -Trigger $trg -Principal $pri -Settings $set -Force | Out-Null

Say "Đăng ký sao lưu hằng ngày 02:00 (giữ 30 bản)"
$a2 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\backup.ps1`""
Register-ScheduledTask -TaskName "704-assets-backup" -Action $a2 -Trigger (New-ScheduledTaskTrigger -Daily -At 2:00am) -Principal $pri -Force | Out-Null

if ($cfg["TELEGRAM_BOT_TOKEN"] -and $cfg["TG_GROUP_ID"]) {
  Say "Đăng ký nhắc việc 08:00 (có Telegram)"
  $a3 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\cron-remind.ps1`""
  Register-ScheduledTask -TaskName "704-assets-remind" -Action $a3 -Trigger (New-ScheduledTaskTrigger -Daily -At 8:00am) -Principal $pri -Force | Out-Null
}

# 5) Tường lửa ---------------------------------------------------------------
if (-not $SkipFirewall) {
  Say "Mở cổng $Port trên Windows Firewall (mạng nội bộ)"
  Get-NetFirewallRule -DisplayName "704-assets" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName "704-assets" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain,Private | Out-Null
}

# 6) Chạy và kiểm tra ----------------------------------------------------------
Say "Khởi động dịch vụ"
Start-ScheduledTask -TaskName "704-assets"
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep 2
  try { $r = Invoke-WebRequest "http://localhost:$Port/api/auth/me" -UseBasicParsing -TimeoutSec 5; $ok = $true; break } catch { if ($_.Exception.Response) { $ok = $true; break } }
}
if (-not $ok) { Write-Host "Chưa phản hồi. Xem log: $logDir\app.log, $logDir\app.err.log" -ForegroundColor Yellow; exit 1 }

# 7) Tài khoản admin đầu tiên --------------------------------------------------
if ($firstTime) {
  if (-not $AdminPassword) { $AdminPassword = "Adm!" + (RandHex 5) }
  $body = @{ username = $AdminUser; password = $AdminPassword; full_name = "Quản trị hệ thống" } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "http://localhost:$Port/api/admin/bootstrap" -Headers @{ "x-admin-key" = $cfg["ADMIN_KEY"] } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  $info = "Tài khoản quản trị: $AdminUser / $AdminPassword`r`nADMIN_KEY: $($cfg['ADMIN_KEY'])`r`n(Hãy đổi mật khẩu sau khi đăng nhập lần đầu rồi xóa file này)"
  [IO.File]::WriteAllText("$InstallDir\TAI_KHOAN_BAN_DAU.txt", $info, (New-Object Text.UTF8Encoding($true)))
  icacls "$InstallDir\TAI_KHOAN_BAN_DAU.txt" /inheritance:r /grant:r "Administrators:F" | Out-Null
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "CÀI ĐẶT XONG." -ForegroundColor Green
Write-Host "  Truy cập trong mạng nội bộ : http://${ip}:$Port"
Write-Host "  Dữ liệu                    : $dataDir\data.json"
Write-Host "  Log                        : $logDir"
if ($firstTime) { Write-Host "  Tài khoản đầu tiên         : xem $InstallDir\TAI_KHOAN_BAN_DAU.txt" }
