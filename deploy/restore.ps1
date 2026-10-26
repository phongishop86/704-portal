# Khôi phục: powershell -File restore.ps1 -File backups\data-20261026-0200.json
param([Parameter(Mandatory=$true)][string]$File)
$root = $PSScriptRoot
if (-not (Test-Path $File)) { throw "Không thấy $File" }
Stop-ScheduledTask -TaskName "704-assets" -ErrorAction SilentlyContinue
$port = 3000; Get-Content "$root\.env" | ForEach-Object { if ($_ -match '^PORT=(\d+)') { $port = [int]$Matches[1] } }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
if (Test-Path "$root\data\data.json") { Copy-Item "$root\data\data.json" "$root\data\data.before-restore.json" -Force }
Copy-Item $File "$root\data\data.json" -Force
Remove-Item "$root\data\data.json.bak" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "704-assets"
Write-Host "Đã khôi phục và khởi động lại."
