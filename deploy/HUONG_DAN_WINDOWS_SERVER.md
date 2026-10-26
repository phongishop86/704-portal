# Triển khai 704-assets nội bộ trên Windows Server 2019

Bản nội bộ chạy **độc lập**, không cần Vercel/Firebase: ứng dụng Node.js (Next.js) + dữ liệu lưu thành một file JSON
(`C:\704-assets\data\data.json`, tự sao lưu hằng ngày). Dành cho **chạy thử trong nhóm nhỏ**; xem mục 8 về giới hạn.

## 1. Tổng quan

| Thành phần | Chi tiết |
|---|---|
| Ứng dụng | `C:\704-assets\app` (Next.js standalone, `node server.js`) |
| Dữ liệu | `C:\704-assets\data\data.json` (+ `.bak` tự động) |
| Cấu hình | `C:\704-assets\.env` (khóa ngẫu nhiên tạo lúc cài) |
| Dịch vụ | Task Scheduler `704-assets` (chạy bằng SYSTEM khi máy khởi động, tự khởi động lại nếu lỗi) |
| Sao lưu | Task `704-assets-backup` 02:00 hằng ngày → `C:\704-assets\backups` (giữ 30 bản) |
| Cổng | TCP 3000 (mở Windows Firewall cho mạng Domain/Private) |
| Log | `C:\704-assets\logs\app.log`, `app.err.log` |

## 2. Chuẩn bị gói cài đặt (làm 1 lần, trên máy CÓ Internet)

Cần Windows + Node.js 20/22 LTS + mã nguồn (clone `https://github.com/phongishop86/704-portal`).

```powershell
cd 704-portal
powershell -ExecutionPolicy Bypass -File deploy\build-package.ps1
```
Ra file `dist-win\704-assets-win.zip`. (Tùy chọn: bỏ thêm `node-v22.x-x64.msi` tải từ nodejs.org vào thư mục `deploy\`
trước khi build, nếu máy chủ không có Internet.)

## 3. Cài trên Windows Server 2019

1. Chép `704-assets-win.zip` sang máy chủ, giải nén (ví dụ `D:\setup`).
2. Mở **PowerShell → Run as Administrator**:
   ```powershell
   cd D:\setup
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
   Tùy chọn: `-InstallDir D:\704-assets -Port 8080 -AdminUser admin -AdminPassword "MatKhau@2026"`
3. Script tự làm: cài Node.js (nếu chưa có), chép ứng dụng, sinh `.env`, đăng ký dịch vụ và sao lưu, mở tường lửa,
   khởi động, kiểm tra, tạo tài khoản admin.
4. Cuối script in địa chỉ `http://<IP máy chủ>:3000`. Mật khẩu admin ban đầu nằm ở `C:\704-assets\TAI_KHOAN_BAN_DAU.txt`
   (nếu không đặt `-AdminPassword`). Đăng nhập, **đổi mật khẩu rồi xóa file này**.

Chạy lại `install.ps1` với gói mới = **nâng cấp** (giữ `.env` và dữ liệu).

## 4. Nạp dữ liệu có sẵn

```powershell
cd C:\704-assets
powershell -File import-excel.ps1 -File D:\du-lieu-RS-CCDC-TSCD.json
```
File JSON tạo từ Excel ngân hàng bằng `node scripts\excel-to-backup.mjs` (đã làm trước đó: 3.088 tài sản), hoặc xuất từ VTB-ASSETS.
Nạp lại nhiều lần vẫn an toàn (ghi đè theo id).

## 5. Kiểm tra sau cài

- Trên máy chủ: mở `http://localhost:3000` → thấy màn hình đăng nhập.
- Từ máy trạm cùng mạng: `http://<IP máy chủ>:3000`. Không vào được → kiểm tra Firewall (`Get-NetFirewallRule -DisplayName 704-assets`) và profile mạng (nếu máy chủ ở profile *Public*, đổi sang *Private/Domain* hoặc chạy lại `install.ps1` kèm sửa luật).
- `Get-ScheduledTask 704-assets | Get-ScheduledTaskInfo`, và đọc `C:\704-assets\logs\app.err.log`.

## 6. Vận hành

| Việc | Lệnh |
|---|---|
| Khởi động / dừng | `Start-ScheduledTask 704-assets` / `Stop-ScheduledTask 704-assets` |
| Sao lưu tay | `powershell -File C:\704-assets\backup.ps1` |
| Khôi phục | `powershell -File C:\704-assets\restore.ps1 -File C:\704-assets\backups\data-YYYYMMDD-HHmm.json` |
| Đổi cổng / khóa | sửa `C:\704-assets\.env` rồi `Stop-` + `Start-ScheduledTask 704-assets` (và cập nhật luật Firewall) |
| Gỡ | `powershell -File C:\704-assets\uninstall.ps1` (giữ dữ liệu) |

Nên sao chép thư mục `backups` ra ổ/NAS khác định kỳ.

## 7. Tùy chọn

- **HTTPS / tên miền nội bộ**: đặt IIS (URL Rewrite + ARR) hoặc Nginx làm reverse proxy tới `http://localhost:3000`, rồi đặt `COOKIE_SECURE=1` trong `.env`.
- **Telegram bot + AI**: cần Internet ra ngoài và một URL **HTTPS công khai** để Telegram gọi webhook (máy chủ nội bộ thường không có). Nếu cần, điền `TELEGRAM_BOT_TOKEN`, `TG_SECRET`, `TG_GROUP_ID`, `GEMINI_API_KEY` vào `.env`, đặt webhook bằng `scripts/set-webhook.sh`, và chạy lại `install.ps1` để đăng ký nhắc việc 08:00. Khi chạy thử nội bộ thuần túy có thể bỏ qua.
- **Ghi nhật ký IT**: dùng ngay trên giao diện web, không cần Telegram.

## 8. Giới hạn của bản nội bộ (đọc trước khi dùng thật)

- Lưu bằng một file JSON trong bộ nhớ + ghi xuống đĩa: phù hợp vài chục người dùng, vài chục nghìn bản ghi. **Chỉ chạy MỘT tiến trình** (không chạy nhiều bản song song hay cân bằng tải).
- Mất điện đột ngột có thể mất tối đa ~0,3 giây thao tác cuối (file ghi nguyên tử, có bản `.bak`).
- Chưa mã hóa dữ liệu ở trạng thái nghỉ; hãy giới hạn quyền thư mục `C:\704-assets` cho Administrators/SYSTEM (script đã siết quyền cho `.env`).
- Muốn chạy chính thức lâu dài nên chuyển sang CSDL thật (Firestore hoặc SQL) — đề xuất làm ở giai đoạn sau khi test xong.

## 9. Xử lý sự cố nhanh

| Hiện tượng | Cách xử lý |
|---|---|
| `install.ps1` báo thiếu `app\server.js` | Giải nén đủ zip, chạy script từ đúng thư mục giải nén |
| Không tải được Node.js | Bỏ file `node-v22.x-x64.msi` cạnh `install.ps1` rồi chạy lại |
| Trang trắng / lỗi 500 | Xem `logs\app.err.log`; kiểm tra `.env` có `DB_MODE=local`, `SESSION_SECRET` |
| Đăng nhập xong bị đá ra | Đang truy cập HTTP mà `COOKIE_SECURE=1` → đặt `0`, hoặc dùng HTTPS |
| Quên mật khẩu admin | `Invoke-RestMethod -Method Post http://localhost:3000/api/admin/bootstrap -Headers @{"x-admin-key"="<ADMIN_KEY trong .env>"} -ContentType application/json -Body '{"username":"admin","password":"MatKhauMoi@2026"}'` |
