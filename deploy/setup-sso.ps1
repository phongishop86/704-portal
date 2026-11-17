<#
 Bật đăng nhập một lần (SSO) từ Portal: Portal đã xác thực AD thì trang con không hỏi lại.
   powershell -ExecutionPolicy Bypass -File setup-sso.ps1 [-Issuer icbv-portal] [-HeaderMode] [-Rotate] [-Off]
 Mặc định sinh khóa SSO_SECRET (JWT HS256) để dán vào Portal. -HeaderMode: bật thêm chế độ header (IIS/Nginx/Caddy gắn X-Remote-*), sinh SSO_PROXY_SECRET.
 Cần đã chạy setup-ldap.ps1 với -RoleMap để phân quyền theo nhóm AD.
#>
param([string]$Issuer = "", [switch]$HeaderMode, [switch]$Rotate, [switch]$Off)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot; $envFile = "$root\.env"
if (-not (Test-Path $envFile) -and (Test-Path "C:\704-assets\.env")) { $root = "C:\704-assets"; $envFile = "$root\.env" }
if (-not (Test-Path $envFile)) { throw "Không thấy .env - chạy install.ps1 trước." }
$t = Get-Content $envFile -Raw -Encoding UTF8
function SetKey($text, $k, $v) { if ($text -match "(?m)^#?\s*$k=") { return ($text -replace "(?m)^#?\s*$k=.*$", "$k=$v") } else { return $text.TrimEnd() + "`r`n$k=$v`r`n" } }
function GetKey($text, $k) { if ($text -match "(?m)^$k=(\S+)") { return $Matches[1] } else { return "" } }
function NewSecret($n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return ([Convert]::ToBase64String($b) -replace "[^A-Za-z0-9]", "").Substring(0, $n) }
if ($Off) { $t = SetKey $t "SSO_SECRET" ""; $t = SetKey $t "SSO_PROXY_SECRET" "" }
else {
  $s = GetKey $t "SSO_SECRET"; if (-not $s -or $Rotate) { $s = NewSecret 48 }
  $t = SetKey $t "SSO_SECRET" $s
  if ($Issuer) { $t = SetKey $t "SSO_ISSUER" $Issuer }
  if ($HeaderMode) { $p = GetKey $t "SSO_PROXY_SECRET"; if (-not $p -or $Rotate) { $p = NewSecret 32 }; $t = SetKey $t "SSO_PROXY_SECRET" $p }
}
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))
& "$root\restart.ps1"
if (-not $Off) {
  Write-Host ""; Write-Host "SSO đã bật." -ForegroundColor Green
  Write-Host "Khóa dùng chung với Portal (SSO_SECRET) nằm trong $envFile - CHỈ gửi cho quản trị Portal qua kênh an toàn, không dán vào chat/email." -ForegroundColor Yellow
  if ($HeaderMode) { Write-Host "Chế độ header: proxy phải gắn header x-sso-secret = SSO_PROXY_SECRET (xem trong .env)." -ForegroundColor Yellow }
  Write-Host "Liên kết từ Portal:  https://<máy-chủ>/api/auth/sso?token=<JWT>&next=/"
}
