<#
 Bật đăng nhập bằng Active Directory / LDAP (domain ICBV) rồi khởi động lại dịch vụ.
   powershell -ExecutionPolicy Bypass -File setup-ldap.ps1 -Url "ldap://icbv.com" -Domain ICBV [-UpnSuffix icbv.com] [-CaFile C:\704-assets\ad-ca.crt] [-AutoCreate] [-LocalUsers "admin"]
 Tắt LDAP: setup-ldap.ps1 -Off
#>
param([string]$Url = "", [string]$Domain = "ICBV", [string]$UpnSuffix = "", [string]$CaFile = "", [switch]$AutoCreate, [string]$LocalUsers = "admin", [switch]$Off)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot; $envFile = "$root\.env"
if (-not (Test-Path "$root\.env") -and (Test-Path "C:\704-assets\.env")) { $root = "C:\704-assets" }  # chạy từ thư mục nguồn thì dùng bản đã cài
if (-not (Test-Path $envFile)) { throw "Không thấy .env - chạy install.ps1 trước." }
if (-not $Off -and -not $Url) { throw "Thiếu -Url, ví dụ -Url ldap://icbv.com (nên dùng ldaps://...:636 nếu AD hỗ trợ)." }
$t = Get-Content $envFile -Raw -Encoding UTF8
function SetKey($text, $k, $v) { if ($text -match "(?m)^#?\s*$k=") { return ($text -replace "(?m)^#?\s*$k=.*$", "$k=$v") } else { return $text.TrimEnd() + "`r`n$k=$v`r`n" } }
if ($Off) { $t = SetKey $t "LDAP_URL" "" }
else {
  $t = SetKey $t "LDAP_URL" $Url; $t = SetKey $t "LDAP_DOMAIN" $Domain; $t = SetKey $t "LDAP_LOCAL_USERS" $LocalUsers
  $t = SetKey $t "LDAP_AUTOCREATE" $(if ($AutoCreate) { "1" } else { "0" })
  if ($UpnSuffix) { $t = SetKey $t "LDAP_UPN_SUFFIX" $UpnSuffix }
  if ($CaFile) { $t = SetKey $t "LDAP_CA_FILE" $CaFile }
}
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))
if ($Url -like "ldap://*") { Write-Host "Lưu ý: ldap:// gửi mật khẩu không mã hóa. Nên dùng ldaps://<máy-chủ-AD>:636 nếu có." -ForegroundColor Yellow }
& "$root\restart.ps1"
Write-Host "Xong. Thử đăng nhập bằng tài khoản AD (gõ tên hoặc ICBV\tên). Tài khoản '$LocalUsers' vẫn dùng mật khẩu trong ứng dụng." -ForegroundColor Green
