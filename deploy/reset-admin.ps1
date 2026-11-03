<#
 Đặt lại mật khẩu admin (khi quên). Cần chạy trên máy chủ, bằng quyền Administrator.
   powershell -ExecutionPolicy Bypass -File reset-admin.ps1 -Password "MatKhauMoi@2026" [-User admin]
 Nếu bỏ trống -Password, script sẽ hỏi (nhập không hiện ký tự).
#>
param([string]$Password = "", [string]$User = "admin")
$root = $PSScriptRoot
if (-not (Test-Path "$root\.env") -and (Test-Path "C:\704-assets\.env")) { $root = "C:\704-assets" }  # chạy từ thư mục nguồn thì dùng bản đã cài
if (-not $Password) { $s = Read-Host "Mật khẩu mới (tối thiểu 8 ký tự)" -AsSecureString; $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
if ($Password.Length -lt 8) { throw "Mật khẩu tối thiểu 8 ký tự." }
$cfg = @{}; Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() } }
$body = @{ username = $User; password = $Password; full_name = "Quản trị hệ thống" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "http://localhost:$($cfg['PORT'])/api/admin/bootstrap" -Headers @{ "x-admin-key" = $cfg["ADMIN_KEY"] } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
if ($r.ok) { Write-Host "Đã đặt lại mật khẩu cho '$User' (vai trò admin, đang hoạt động)." -ForegroundColor Green }
