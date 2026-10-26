# Sao lưu data.json -> backups\data-YYYYMMDD-HHmm.json (giữ 30 bản). Chạy tay: powershell -File backup.ps1
$root = $PSScriptRoot
$src = "$root\data\data.json"
if (-not (Test-Path $src)) { Write-Host "Chưa có dữ liệu."; exit 0 }
$dst = "$root\data\backups"; New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item $src ("$dst\data-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".json")
Get-ChildItem $dst -Filter "data-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
Write-Host "Đã sao lưu vào $dst"
