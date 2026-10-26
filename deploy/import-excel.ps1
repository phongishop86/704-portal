# Nạp dữ liệu từ file backup JSON (do scripts\excel-to-backup.mjs hoặc xuất từ VTB-ASSETS tạo ra).
#   powershell -File import-excel.ps1 -File D:\du-lieu-RS-CCDC-TSCD.json
param([Parameter(Mandatory=$true)][string]$File)
$root = $PSScriptRoot
$cfg = @{}; Get-Content "$root\.env" -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() } }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
& $node "$root\app\scripts\import-backup.mjs" "http://localhost:$($cfg['PORT'])" $cfg["ADMIN_KEY"] $File
