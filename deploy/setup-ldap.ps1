<#
 Bật đăng nhập bằng Active Directory / LDAP (domain ICBV) rồi khởi động lại dịch vụ.
   powershell -ExecutionPolicy Bypass -File setup-ldap.ps1 -Url "ldap://icbv.com" -Domain ICBV [-UpnSuffix icbv.com] [-CaFile C:\704-assets\ad-ca.crt] [-AutoCreate] [-LocalUsers "admin"]
 Phân quyền theo nhóm AD (tùy chọn):
   -BaseDn "dc=icbv,dc=com" -RoleMap "admin=704-Admin;tcth=704-TCTH;it=704-IT;manager=704-LDP;user=704-User" [-RequireGroup] [-Nested] [-DeptAttr department] [-BindDn "CN=svc-ro,OU=Service,DC=icbv,DC=com" -BindPassword "..."]
   RequireGroup: người không thuộc nhóm nào trong RoleMap thì không được vào. Nested: tính cả nhóm lồng nhau.
 Tắt LDAP: setup-ldap.ps1 -Off
#>
param([string]$Url = "", [string]$Domain = "ICBV", [string]$UpnSuffix = "", [string]$CaFile = "", [switch]$AutoCreate, [string]$LocalUsers = "admin", [string]$BaseDn = "", [string]$RoleMap = "", [switch]$RequireGroup, [switch]$Nested, [string]$DeptAttr = "", [string]$BindDn = "", [string]$BindPassword = "", [switch]$Off)
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
  if ($BaseDn) { $t = SetKey $t "LDAP_BASE_DN" $BaseDn }
  if ($RoleMap) { $t = SetKey $t "LDAP_ROLE_MAP" $RoleMap; $t = SetKey $t "LDAP_REQUIRE_GROUP" $(if ($RequireGroup) { "1" } else { "0" }); $t = SetKey $t "LDAP_NESTED_GROUPS" $(if ($Nested) { "1" } else { "0" }) }
  if ($RoleMap -and -not $BaseDn -and $t -notmatch "(?m)^LDAP_BASE_DN=\S") { throw "Dùng -RoleMap thì phải có -BaseDn (ví dụ dc=icbv,dc=com)." }
  if ($DeptAttr) { $t = SetKey $t "LDAP_DEPT_ATTR" $DeptAttr }
  if ($BindDn) { $t = SetKey $t "LDAP_BIND_DN" $BindDn; $t = SetKey $t "LDAP_BIND_PASSWORD" $BindPassword }
}
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding($false)))
if ($Url -like "ldap://*") { Write-Host "Lưu ý: ldap:// gửi mật khẩu không mã hóa. Nên dùng ldaps://<máy-chủ-AD>:636 nếu có." -ForegroundColor Yellow }
& "$root\restart.ps1"
Write-Host "Xong. Thử đăng nhập bằng tài khoản AD (gõ tên hoặc ICBV\tên). Tài khoản '$LocalUsers' vẫn dùng mật khẩu trong ứng dụng." -ForegroundColor Green
