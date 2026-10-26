# Gỡ dịch vụ (GIỮ NGUYÊN thư mục dữ liệu). Xóa hẳn: xóa tay thư mục cài đặt sau khi sao lưu.
foreach ($t in "704-assets","704-assets-backup","704-assets-remind") {
  Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
}
$port = 3000; if (Test-Path "$PSScriptRoot\.env") { Get-Content "$PSScriptRoot\.env" | ForEach-Object { if ($_ -match '^PORT=(\d+)') { $port = [int]$Matches[1] } } }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-NetFirewallRule -DisplayName "704-assets" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host "Đã gỡ tác vụ và luật tường lửa. Dữ liệu còn nguyên trong thư mục cài đặt."
