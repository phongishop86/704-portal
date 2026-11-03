# Kiểm tra sức khỏe máy chủ 704-assets:  powershell -ExecutionPolicy Bypass -File doctor.ps1
$root = $PSScriptRoot
$cfg = @{}; if (Test-Path "$root\.env") { Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() } } }
function Row($ok, $name, $msg) { $c = if ($ok -eq $true) { "Green" } elseif ($ok -eq $false) { "Red" } else { "Yellow" }; $tag = if ($ok -eq $true) { "[ OK ]" } elseif ($ok -eq $false) { "[LỖI ]" } else { "[ -- ]" }; Write-Host "$tag $name  $msg" -ForegroundColor $c }
$port = if ($cfg["PORT"]) { $cfg["PORT"] } else { 3000 }
foreach ($t in "704-assets","704-assets-backup","704-assets-telegram","704-assets-https","704-assets-remind") {
  $x = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  if ($x) { Row ($x.State -in "Running","Ready") $t "trạng thái: $($x.State)" } else { Row $null $t "chưa đăng ký" }
}
try { $r = Invoke-WebRequest "http://127.0.0.1:$port/api/auth/me" -UseBasicParsing -TimeoutSec 5; Row $true "Ứng dụng" "phản hồi HTTP $($r.StatusCode) tại cổng $port" } catch { if ($_.Exception.Response) { Row $true "Ứng dụng" "phản hồi (cần đăng nhập) tại cổng $port" } else { Row $false "Ứng dụng" "không phản hồi tại cổng $port - xem logs\app.err.log" } }
$d = "$root\data\data.json"
if (Test-Path $d) { $i = Get-Item $d; Row $true "Dữ liệu" ("{0:N1} MB, sửa lần cuối {1}" -f ($i.Length/1MB), $i.LastWriteTime) } else { Row $false "Dữ liệu" "chưa có data.json" }
$b = Get-ChildItem "$root\data\backups" -Filter "data-*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($b) { Row ((Get-Date) - $b.LastWriteTime).TotalHours -lt 30 "Sao lưu" "bản mới nhất $($b.Name) ($($b.LastWriteTime))" } else { Row $false "Sao lưu" "chưa có bản nào" }
$drv = Get-PSDrive -Name ($root.Substring(0,1)); Row ($drv.Free -gt 2GB) "Ổ đĩa" ("{0:N1} GB trống" -f ($drv.Free/1GB))
Row ($cfg["COOKIE_SECURE"] -eq "1") "HTTPS" $(if ($cfg["COOKIE_SECURE"] -eq "1") { "đã bật (COOKIE_SECURE=1)" } else { "chưa bật - camera quét QR và cài ứng dụng chưa dùng được (chạy setup-https.ps1)" })
if ($cfg["TELEGRAM_BOT_TOKEN"]) {
  try { $me = Invoke-RestMethod "https://api.telegram.org/bot$($cfg['TELEGRAM_BOT_TOKEN'])/getMe" -TimeoutSec 10; Row $true "Telegram" "bot @$($me.result.username)" } catch { Row $false "Telegram" "token sai hoặc không ra được Internet" }
  if (Test-Path "$root\logs\telegram.log") { Write-Host "       log cuối: $(Get-Content "$root\logs\telegram.log" -Tail 1)" }
} else { Row $null "Telegram" "chưa cấu hình (chạy setup-telegram.ps1)" }
if ($cfg["LDAP_URL"]) { Row $true "Active Directory" "bật: $($cfg['LDAP_URL']) (miền $($cfg['LDAP_DOMAIN']))" } else { Row $null "Active Directory" "chưa bật (chạy setup-ldap.ps1)" }
if ($cfg["COOKIE_SECURE"] -eq "1") { Write-Host "       Lưu ý: COOKIE_SECURE=1 chỉ đúng khi truy cập bằng https://. Nếu vào http://IP:3000 mà không đăng nhập được, đặt COOKIE_SECURE=0 rồi chạy restart.ps1" -ForegroundColor Yellow }
if ($cfg["SESSION_SECRET"] -and $cfg["SESSION_SECRET"].Length -ge 32) { Row $true "Khóa phiên" "đã đặt" } else { Row $false "Khóa phiên" "SESSION_SECRET thiếu/ngắn" }
