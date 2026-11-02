<#
 CÀI ĐẶT MỘT LẦN BẤM trên PC làm máy chủ (Windows 10/11 hoặc Windows Server), cần Internet ở lần cài đầu.
 Chạy trong thư mục đã giải nén gói 704-assets-pc-server.zip:  bấm đúp CAI-DAT.bat
 hoặc (PowerShell Run as Administrator):
   powershell -ExecutionPolicy Bypass -File deploy\CAI-DAT-TU-DONG.ps1 [-InstallDir C:\704-assets] [-Port 3000]
        [-AdminPassword "..."] [-Https] [-TelegramToken "..."] [-TelegramGroupId "-100..."] [-DataFile D:\backup.json]
 Các bước: kiểm tra quyền -> cài Node.js -> npm install + build -> cài dịch vụ (install.ps1)
           -> [tùy chọn] nạp dữ liệu -> [tùy chọn] HTTPS -> [tùy chọn] bot Telegram -> kiểm tra (doctor.ps1)
 Chạy lại lệnh này để NÂNG CẤP bản mới (giữ .env và dữ liệu).
#>
param(
  [string]$InstallDir = "C:\704-assets", [int]$Port = 3000, [string]$AdminUser = "admin", [string]$AdminPassword = "",
  [switch]$Https, [string]$HostName = "", [string]$TelegramToken = "", [string]$TelegramGroupId = "", [string]$DataFile = "",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$deploy = $PSScriptRoot
$repo = Split-Path $deploy -Parent
function Step($n, $m) { Write-Host ""; Write-Host "===== BƯỚC ${n}: ${m} =====" -ForegroundColor Cyan }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Hãy chạy bằng quyền Administrator (bấm đúp CAI-DAT.bat)." }
if (-not (Test-Path "$repo\package.json")) { throw "Không thấy package.json ở $repo - hãy giải nén đủ gói zip và giữ nguyên thư mục deploy\." }

Step 1 "Kiểm tra máy"
$os = (Get-CimInstance Win32_OperatingSystem).Caption; Write-Host "Hệ điều hành: $os"
$free = (Get-PSDrive -Name $InstallDir.Substring(0,1)).Free / 1GB; Write-Host ("Ổ đĩa cài đặt còn trống: {0:N1} GB" -f $free)
powercfg /change standby-timeout-ac 0 | Out-Null; powercfg /change hibernate-timeout-ac 0 | Out-Null; powercfg /change monitor-timeout-ac 15 | Out-Null; Write-Host "Đã tắt chế độ ngủ/ngủ đông khi cắm điện (máy chủ phải luôn thức)."
if ($free -lt 3) { throw "Cần tối thiểu ~3 GB trống để build." }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if (-not $SkipBuild) {
  try { Invoke-WebRequest "https://registry.npmjs.org/npm" -UseBasicParsing -TimeoutSec 20 | Out-Null; Write-Host "Kết nối npm: OK" }
  catch { if ($_.Exception.Response) { Write-Host "Kết nối npm: OK" } else { Write-Host "CẢNH BÁO: kiểm tra trước không ra được registry.npmjs.org ($($_.Exception.Message)). Vẫn thử build; nếu npm install lỗi thì mới là mất kết nối thật (proxy/tường lửa cơ quan)." -ForegroundColor Yellow } }
}

Step 2 "Cài Node.js (nếu chưa có)"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($node) { $v = [version]((& $node -v).TrimStart("v")); Write-Host "Node $v" } else { $v = [version]"0.0" }
if ($v.Major -lt 20) {
  Write-Host "Tải và cài Node.js 22 LTS..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $msi = Join-Path $env:TEMP "node-x64.msi"
  Invoke-WebRequest "https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi" -OutFile $msi
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Cài Node.js chưa thành công. Cài thủ công từ https://nodejs.org rồi chạy lại." }
}

Step 3 "Build ứng dụng (vài phút)"
$bundle = "$repo\dist-win\bundle"
if ($SkipBuild -and (Test-Path "$bundle\app\server.js")) { Write-Host "Bỏ qua build (dùng bản đã build)" }
else { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$deploy\build-package.ps1"; if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$bundle\app\server.js")) { throw "Build lỗi - xem thông báo phía trên." } }

Step 4 "Cài dịch vụ, sao lưu tự động, tường lửa, tài khoản admin"
$args2 = @("-NoProfile","-ExecutionPolicy","Bypass","-File","$bundle\install.ps1","-InstallDir",$InstallDir,"-Port",$Port,"-AdminUser",$AdminUser)
if ($AdminPassword) { $args2 += @("-AdminPassword",$AdminPassword) }
& powershell.exe @args2
if ($LASTEXITCODE -ne 0) { throw "install.ps1 báo lỗi (mã $LASTEXITCODE)." }

if ($DataFile) {
  Step 5 "Nạp dữ liệu từ $DataFile"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$InstallDir\import-excel.ps1" -File $DataFile
} else { Write-Host "(Bỏ qua nạp dữ liệu - dùng -DataFile hoặc chạy import-excel.ps1 sau)" }

if ($Https) {
  Step 6 "Bật HTTPS nội bộ (Caddy)"
  $a = @("-NoProfile","-ExecutionPolicy","Bypass","-File","$InstallDir\setup-https.ps1"); if ($HostName) { $a += @("-HostName",$HostName) }
  & powershell.exe @a
}
if ($TelegramToken) {
  Step 7 "Bật bot Telegram"
  $a = @("-NoProfile","-ExecutionPolicy","Bypass","-File","$InstallDir\setup-telegram.ps1","-Token",$TelegramToken); if ($TelegramGroupId) { $a += @("-GroupId",$TelegramGroupId) }
  & powershell.exe @a
}

Step 8 "Kiểm tra sức khỏe"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$InstallDir\doctor.ps1"
Write-Host ""
Write-Host "HOÀN TẤT. Việc tiếp theo: đọc HUONG_DAN_TRIEN_KHAI_PC.md (đổi mật khẩu admin, tạo người dùng, HTTPS cho điện thoại)." -ForegroundColor Green
