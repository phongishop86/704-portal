<#
 Bật / đổi bot Telegram cho máy chủ nội bộ (cần máy chủ có Internet đi ra, KHÔNG cần mở cổng vào).
   powershell -ExecutionPolicy Bypass -File setup-telegram.ps1 -Token "123456:ABC..." [-GroupId "-100123456789"]
 Lấy Token từ @BotFather. Nếu token từng bị lộ, tạo token mới (/revoke) rồi chạy lại lệnh này.
#>
param([Parameter(Mandatory=$true)][string]$Token, [string]$GroupId = "")
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$envFile = "$root\.env"
if (-not (Test-Path $envFile)) { throw "Không thấy $envFile - hãy chạy install.ps1 trước." }
$t = Get-Content $envFile -Raw -Encoding UTF8
function SetKey($text, $k, $v) { if ($text -match "(?m)^$k=") { return ($text -replace "(?m)^$k=.*$", "$k=$v") } else { return $text.TrimEnd() + "`r`n$k=$v`r`n" } }
$t = SetKey $t "TELEGRAM_BOT_TOKEN" $Token
if ($GroupId) { $t = SetKey $t "TG_GROUP_ID" $GroupId }
if ($t -notmatch "(?m)^TG_SECRET=\S") { $b = New-Object byte[] 16; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $t = SetKey $t "TG_SECRET" (($b | ForEach-Object { $_.ToString("x2") }) -join "") }
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))

try { $me = Invoke-RestMethod "https://api.telegram.org/bot$Token/getMe" -TimeoutSec 15; Write-Host "Bot hợp lệ: @$($me.result.username)" -ForegroundColor Green }
catch { throw "Token không hợp lệ hoặc máy chủ không ra được Internet (api.telegram.org): $($_.Exception.Message)" }

$pri = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\start-telegram.ps1`"" -WorkingDirectory $root
Register-ScheduledTask -TaskName "704-assets-telegram" -Action $act -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $pri -Settings $set -Force | Out-Null
if ($GroupId) {
  $a3 = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\cron-remind.ps1`""
  Register-ScheduledTask -TaskName "704-assets-remind" -Action $a3 -Trigger (New-ScheduledTaskTrigger -Daily -At 8:00am) -Principal $pri -Force | Out-Null
}
# Ứng dụng đọc lại .env -> khởi động lại cả hai
Stop-ScheduledTask -TaskName "704-assets-telegram" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*tg-poll.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Stop-ScheduledTask -TaskName "704-assets" -ErrorAction SilentlyContinue
$port = 3000; Get-Content $envFile | ForEach-Object { if ($_ -match '^PORT=(\d+)') { $port = [int]$Matches[1] } }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
Start-ScheduledTask -TaskName "704-assets"
Start-ScheduledTask -TaskName "704-assets-telegram"
Write-Host "Đã bật bot. Nhắn /start cho bot trên Telegram để thử. Log: $root\logs\telegram.log" -ForegroundColor Green
Write-Host "Mỗi người dùng cần được gán Telegram ID trong hồ sơ (quản trị > Người dùng) thì bot mới nhận ra."
