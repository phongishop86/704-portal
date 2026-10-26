<#
 Chạy trên MÁY CÓ INTERNET (Windows, đã cài Node.js 20 hoặc 22 LTS) tại thư mục gốc dự án:
     powershell -ExecutionPolicy Bypass -File deploy\build-package.ps1
 Kết quả: dist-win\704-assets-win.zip  (gói chạy sẵn, KHÔNG cần npm install trên máy chủ)
#>
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
node -v
if ($LASTEXITCODE -ne 0) { throw "Chưa cài Node.js. Tải LTS tại https://nodejs.org" }

Write-Host "==> npm install" -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install lỗi" }

Write-Host "==> next build (standalone)" -ForegroundColor Cyan
$env:BUILD_STANDALONE = "1"
npm run build
if ($LASTEXITCODE -ne 0) { throw "next build lỗi" }

$out = "dist-win"; $pkg = "$out\app"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $pkg | Out-Null
Copy-Item ".next\standalone\*" $pkg -Recurse -Force
New-Item -ItemType Directory -Path "$pkg\.next" -Force | Out-Null
Copy-Item ".next\static" "$pkg\.next\static" -Recurse -Force
Copy-Item "public" "$pkg\public" -Recurse -Force
New-Item -ItemType Directory -Path "$pkg\scripts" -Force | Out-Null
Copy-Item "scripts\import-backup.mjs","scripts\excel-to-backup.mjs" "$pkg\scripts" -Force
Copy-Item "scripts\lib" "$pkg\scripts\lib" -Recurse -Force

# gói cài đặt = app + script triển khai + mẫu cấu hình
$bundle = "$out\bundle"
New-Item -ItemType Directory -Path $bundle | Out-Null
Move-Item $pkg "$bundle\app"
Copy-Item "deploy\*" $bundle -Recurse -Force -Exclude "build-package.ps1"
Compress-Archive -Path "$bundle\*" -DestinationPath "$out\704-assets-win.zip" -Force
Write-Host "==> Xong: $out\704-assets-win.zip" -ForegroundColor Green
Write-Host "Chép file zip sang máy chủ, giải nén, rồi chạy install.ps1 (xem HUONG_DAN_WINDOWS_SERVER.md)."
