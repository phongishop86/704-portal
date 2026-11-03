<#
 Bật HTTPS nội bộ bằng Caddy (chứng chỉ do chính máy chủ tự cấp, "tls internal") để:
   - quét mã QR bằng camera trình duyệt hoạt động,   - cài ứng dụng (PWA) lên màn hình điện thoại.
 Chạy bằng PowerShell "Run as Administrator" sau khi đã chạy install.ps1:
   powershell -ExecutionPolicy Bypass -File setup-https.ps1 [-HostName may-chu-704] [-CaddyExe D:\caddy.exe]
 Cần caddy.exe: đặt cạnh script này, hoặc để script tự tải (cần Internet), hoặc chỉ đường dẫn bằng -CaddyExe.
 Kết quả: https://<tên-máy hoặc IP> ; chứng chỉ gốc để các máy tin cậy: https://<IP>:8081/704-root-ca.crt
#>
param([string]$HostName = "", [string]$CaddyExe = "", [int]$AppPort = 0, [int]$CertPort = 8081)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Hãy mở PowerShell bằng 'Run as Administrator'." }
$envFile = "$root\.env"; if (-not (Test-Path $envFile)) { throw "Không thấy .env - chạy install.ps1 trước." }
if (-not $AppPort) { $AppPort = 3000; Get-Content $envFile | ForEach-Object { if ($_ -match '^PORT=(\d+)') { $AppPort = [int]$Matches[1] } } }
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } | Select-Object -First 1).IPAddress
if (-not $HostName) { $HostName = $env:COMPUTERNAME.ToLower() }

# 1) caddy.exe
$dir = "$root\https"; New-Item -ItemType Directory -Force $dir, "$dir\data" | Out-Null
$caddy = "$dir\caddy.exe"
if ($CaddyExe) { Copy-Item $CaddyExe $caddy -Force }
elseif (Test-Path "$PSScriptRoot\caddy.exe") { Copy-Item "$PSScriptRoot\caddy.exe" $caddy -Force }
elseif (-not (Test-Path $caddy)) {
  Say "Tải Caddy (cần Internet)"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $env:TEMP "caddy.zip"
  Invoke-WebRequest "https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath "$env:TEMP\caddy-x" -Force
  Copy-Item "$env:TEMP\caddy-x\caddy.exe" $caddy -Force
}
if (-not (Test-Path $caddy)) { throw "Không có caddy.exe. Tải thủ công từ https://caddyserver.com/download (Windows amd64) rồi chạy lại với -CaddyExe." }

# 2) Caddyfile
$cf = @"
{
  admin off
  auto_https disable_redirects
}
https://${ip}, https://${HostName} {
  tls internal
  encode gzip
  reverse_proxy 127.0.0.1:$AppPort
}
http://:$CertPort {
  root * $($dir -replace '\\','/')/pub
  file_server
}
"@
New-Item -ItemType Directory -Force "$dir\pub" | Out-Null
[IO.File]::WriteAllText("$dir\Caddyfile", $cf, (New-Object Text.UTF8Encoding($false)))

# 3) Tác vụ nền (SYSTEM) - lưu chứng chỉ trong thư mục https\data
$cmd = "`$env:XDG_DATA_HOME='$dir\data'; `$env:APPDATA='$dir\data'; Set-Location '$dir'; & '$caddy' run --config '$dir\Caddyfile' --adapter caddyfile *>> '$root\logs\caddy.log'"
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`""
$pri = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Stop-ScheduledTask -TaskName "704-assets-https" -ErrorAction SilentlyContinue
Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
Register-ScheduledTask -TaskName "704-assets-https" -Action $act -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $pri -Settings $set -Force | Out-Null
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
Start-ScheduledTask -TaskName "704-assets-https"

# 4) Cookie Secure + tường lửa
$t = Get-Content $envFile -Raw -Encoding UTF8
if ($t -match "(?m)^COOKIE_SECURE=") { $t = $t -replace "(?m)^COOKIE_SECURE=.*$", "COOKIE_SECURE=1" } else { $t += "`r`nCOOKIE_SECURE=1`r`n" }
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))
foreach ($p in 443, $CertPort) {
  Get-NetFirewallRule -DisplayName "704-assets-https-$p" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName "704-assets-https-$p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
}
# Cổng ứng dụng chỉ cần cho chính máy này (Caddy chuyển tiếp) -> đóng cổng trực tiếp từ mạng LAN
Get-NetFirewallRule -DisplayName "704-assets" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# 5) Khởi động lại ứng dụng để nhận COOKIE_SECURE=1
Stop-ScheduledTask -TaskName "704-assets" -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 2; Start-ScheduledTask -TaskName "704-assets"

# 6) Chờ Caddy tạo chứng chỉ gốc rồi chép ra thư mục tải
$crt = $null
for ($i = 0; $i -lt 30 -and -not $crt; $i++) {
  Start-Sleep 2
  $crt = Get-ChildItem "$dir\data" -Recurse -Filter "root.crt" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($crt) {
  Copy-Item $crt.FullName "$dir\pub\704-root-ca.crt" -Force
  Import-Certificate -FilePath $crt.FullName -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Write-Host ""
  Write-Host "HTTPS đã bật." -ForegroundColor Green
  Write-Host "  Địa chỉ dùng cho người dùng : https://$ip   (hoặc https://$HostName nếu DNS nội bộ phân giải được)"
  Write-Host "  Chứng chỉ gốc               : $dir\pub\704-root-ca.crt  (tải từ máy khác: http://${ip}:$CertPort/704-root-ca.crt)"
  Write-Host "  Mỗi máy/điện thoại cần CÀI & TIN CẬY chứng chỉ này một lần (xem HUONG_DAN_TRIEN_KHAI_PC.md, bước 7)."
} else { Write-Host "Chưa thấy chứng chỉ - xem log: $root\logs\caddy.log" -ForegroundColor Yellow; exit 1 }
