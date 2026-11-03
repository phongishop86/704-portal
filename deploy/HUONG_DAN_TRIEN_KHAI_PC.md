# Kịch bản triển khai 704-ASSETS lên PC làm máy chủ (mạng LAN)

Mục tiêu: một PC Windows trong cơ quan chạy 704-ASSETS cho mọi người truy cập qua mạng nội bộ, **không dùng Firebase nên không còn giới hạn lượt đọc**; dữ liệu nằm trong một file trên ổ đĩa của PC và được sao lưu tự động mỗi ngày.

Thời gian: khoảng 45–60 phút cho lần đầu. Phần lớn là chờ cài đặt tự chạy.

## Cần chuẩn bị

| Hạng mục | Yêu cầu |
|---|---|
| PC máy chủ | Windows 10/11 Pro hoặc Windows Server 2019+, RAM ≥ 4 GB, trống ≥ 5 GB, **bật 24/7**, nên cắm UPS |
| Mạng | Cắm dây mạng LAN; có **IP tĩnh** (hoặc IP đặt trước trong router/DHCP) |
| Internet | Chỉ cần ở lần cài đầu (tải Node.js, thư viện) và nếu dùng bot Telegram/HTTPS tự tải Caddy |
| Quyền | Tài khoản Administrator trên PC máy chủ |
| Gói cài | `704-assets-pc-server.zip` |
| Tùy chọn | Token bot Telegram (từ @BotFather), file sao lưu dữ liệu cũ (.json) |

---

## Bước 1. Đặt IP tĩnh cho PC

Cài đặt › Mạng › Ethernet › Chỉnh sửa gán IP › Thủ công (hoặc nhờ quản trị mạng đặt IP cố định cho PC theo địa chỉ MAC). Ghi lại IP, ví dụ `192.168.1.50`. Mọi người sẽ dùng IP này để truy cập.

## Bước 2. Lấy dữ liệu từ hệ thống hiện tại (nếu đang chạy trên Vercel/Firebase)

1. Đăng nhập bằng tài khoản **admin** trên bản đang chạy.
2. Vào mục sao lưu của admin, tải file **Backup JSON** về (tên dạng `VietinBank_Assets_FullBackup_….json`).
3. Chép file đó sang PC máy chủ (USB hoặc chia sẻ mạng).

Nếu Firebase đang vượt hạn mức và không đăng nhập được: hạn mức tự làm mới khoảng **15:00 giờ Việt Nam** hằng ngày; đợi đến lúc đó rồi tải backup. Nếu còn bản backup cũ ở máy nào, dùng bản đó.

> File backup chứa dữ liệu thật: không gửi qua kênh công khai, xóa bản sao tạm sau khi nạp xong.

## Bước 3. Giải nén gói cài

Chép `704-assets-pc-server.zip` sang PC máy chủ, **giải nén vào thư mục có đường dẫn ngắn, không dấu**, ví dụ `D:\setup\704-portal`. Giữ nguyên cấu trúc thư mục (có `package.json`, `deploy\`, `app\`…).

## Bước 4. Chạy cài đặt tự động

Có hai cách, chọn một:

**Cách A (đơn giản):** vào thư mục `deploy`, bấm đúp **`CAI-DAT.bat`**, chọn *Yes* khi Windows hỏi quyền quản trị. Sẽ cài bản cơ bản (HTTP).

**Cách B (cài đủ ngay một lệnh):** mở PowerShell bằng *Run as Administrator*:

```powershell
cd D:\setup\704-portal\deploy
powershell -ExecutionPolicy Bypass -File .\CAI-DAT-TU-DONG.ps1 `
   -AdminPassword "MatKhauManh@2026" `
   -DataFile "D:\setup\du-lieu-backup.json" `
   -Https `
   -TelegramToken "123456:ABC..." -TelegramGroupId "-100123456789"
```
Mỗi tham số đều tùy chọn (bỏ tham số nào thì bỏ bước đó, làm sau cũng được):

| Tham số | Ý nghĩa |
|---|---|
| `-InstallDir` | Thư mục cài (mặc định `C:\704-assets`) |
| `-Port` | Cổng ứng dụng (mặc định 3000) |
| `-AdminPassword` | Mật khẩu admin đầu tiên (bỏ trống: tự sinh, ghi ở `TAI_KHOAN_BAN_DAU.txt`) |
| `-DataFile` | Nạp dữ liệu từ file backup JSON ngay khi cài |
| `-Https` | Bật HTTPS nội bộ (xem Bước 7) |
| `-TelegramToken`, `-TelegramGroupId` | Bật bot Telegram (xem Bước 8) |

Script tự thực hiện: kiểm tra máy → cài Node.js 22 nếu thiếu → `npm install` + build → chép ứng dụng vào `C:\704-assets` → sinh khóa bí mật ngẫu nhiên trong `.env` → đăng ký dịch vụ khởi động cùng Windows (tự chạy lại nếu lỗi) → sao lưu 02:00 mỗi ngày (giữ 30 bản) → mở tường lửa → tạo tài khoản admin → tắt chế độ ngủ của máy → chạy kiểm tra sức khỏe.

Khi xong, cửa sổ in địa chỉ truy cập và kết quả kiểm tra. Mọi dòng `[ OK ]` là tốt.

## Bước 5. Kiểm tra nhanh

1. Trên PC máy chủ: mở trình duyệt vào `http://localhost:3000` → thấy màn hình đăng nhập.
2. Từ một máy khác cùng mạng: `http://<IP máy chủ>:3000`. Không vào được → xem phần Sự cố bên dưới.
3. Đăng nhập `admin` / mật khẩu ở Bước 4 → **đổi mật khẩu ngay** → xóa `C:\704-assets\TAI_KHOAN_BAN_DAU.txt`.
4. Chạy kiểm tra bất kỳ lúc nào: `powershell -ExecutionPolicy Bypass -File C:\704-assets\doctor.ps1`.

## Bước 6. Nạp dữ liệu (nếu chưa dùng `-DataFile`)

```powershell
powershell -ExecutionPolicy Bypass -File C:\704-assets\import-excel.ps1 -File D:\setup\du-lieu-backup.json
```
Nạp lại nhiều lần vẫn an toàn (ghi đè theo mã, không xóa gì). Sau đó đăng nhập kiểm tra số lượng tài sản, phòng ban, người dùng. Tài khoản cũ giữ nguyên mật khẩu.

## Bước 7. HTTPS nội bộ (bắt buộc nếu muốn quét QR bằng camera và cài ứng dụng lên điện thoại)

Trình duyệt chỉ cho dùng camera và cài ứng dụng trên địa chỉ HTTPS. Script dùng Caddy tự cấp chứng chỉ nội bộ.

1. Chạy (nếu chưa dùng `-Https`): `powershell -ExecutionPolicy Bypass -File C:\704-assets\setup-https.ps1`
2. Địa chỉ mới: **`https://<IP máy chủ>`** (cổng 443). Cổng 3000 bị đóng với mạng LAN, chỉ Caddy dùng.
3. Mỗi thiết bị cần **tin cậy chứng chỉ gốc một lần**. Tải từ `http://<IP máy chủ>:8081/704-root-ca.crt`:
   - **Windows**: mở file › Cài đặt chứng chỉ › Local Machine › đặt vào *Trusted Root Certification Authorities*. (Máy chủ tự cài sẵn.) Nếu có Active Directory, phát tán bằng Group Policy cho cả phòng.
   - **iPhone/iPad**: mở link bằng Safari › Cho phép tải hồ sơ › Cài đặt › Cài đặt hồ sơ; rồi Cài đặt › Cài đặt chung › Giới thiệu › Cài đặt tin cậy chứng nhận › bật tin cậy cho chứng chỉ vừa cài.
   - **Android**: Cài đặt › Bảo mật › Mã hóa & thông tin xác thực › Cài đặt từ bộ nhớ › Chứng chỉ CA. Tải file từ link trên rồi chọn.
4. Thử: mở `https://<IP>`, không còn cảnh báo, camera quét QR hoạt động, có mục *Thêm vào màn hình chính*.

Nếu muốn dùng tên (ví dụ `tai-san.noibo`), nhờ quản trị mạng tạo bản ghi DNS trỏ về IP máy chủ, rồi chạy lại `setup-https.ps1 -HostName tai-san.noibo`.

## Bước 8. Bot Telegram (không cần địa chỉ công khai)

Máy chủ nội bộ không có URL HTTPS công khai cho webhook, nên bot dùng chế độ **hỏi Telegram** (`getUpdates`): chỉ cần máy chủ truy cập Internet ra ngoài, không mở cổng vào.

1. Tạo bot hoặc lấy token ở @BotFather. **Token đã từng dán vào chat/tài liệu phải tạo lại** (`/revoke`).
2. Chạy: `powershell -ExecutionPolicy Bypass -File C:\704-assets\setup-telegram.ps1 -Token "<token>" -GroupId "<id nhóm IT, tùy chọn>"`
3. Script kiểm tra token, đăng ký tác vụ `704-assets-telegram`, tự gỡ webhook cũ ở Vercel và khởi động lại ứng dụng.
4. Nhắn `/start` cho bot để xem menu. Mỗi người cần được **gán Telegram ID trong hồ sơ người dùng** (admin vào Người dùng) thì bot mới nhận ra; cán bộ IT (ví dụ nguyen.thanhphong) cần vai trò `it` để nhận thông báo phiếu.
5. Muốn quay lại Vercel: đặt lại webhook ở bản Vercel (`scripts/set-webhook.sh`). Một bot chỉ dùng một chế độ tại một thời điểm.

Nhắc việc hằng sáng 08:00 được bật khi có `-GroupId`.

## Bước 9. Thiết lập người dùng và bảo mật

- Tạo người dùng, gán vai trò (admin / tcth / it / manager / user) và phòng ban. Chỉ admin tạo và xóa tài sản.
- Đổi mật khẩu admin; không dùng lại `A@123456`.
- Khóa bí mật (`SESSION_SECRET`, `ADMIN_KEY`, `CRON_SECRET`, `TG_SECRET`) nằm trong `C:\704-assets\.env`, chỉ Administrators/SYSTEM đọc được. Không gửi file này đi đâu.
- Thư mục `C:\704-assets` không chia sẻ mạng. Nên bật BitLocker cho ổ đĩa chứa dữ liệu.
- Windows Update: đặt giờ hoạt động để máy không tự khởi động lại giữa giờ làm. Sau khởi động lại, dịch vụ tự chạy.

## Đăng nhập bằng Active Directory (tùy chọn, domain ICBV)

Khi bật, người dùng đăng nhập bằng **tên và mật khẩu Windows**: gõ `an.nguyen`, `ICBV\an.nguyen` hoặc `an.nguyen@icbv.local` đều được. Mật khẩu do AD kiểm tra (bind), ứng dụng không lưu mật khẩu AD. Vai trò, phòng ban và Telegram ID vẫn do ứng dụng quản lý.

1. Trong `C:\704-assets\.env` điền:
   ```
   LDAP_URL=ldaps://<máy-chủ-AD>:636
   LDAP_DOMAIN=ICBV
   ```
   Nên dùng `ldaps://`. Nếu chứng chỉ của AD do CA nội bộ cấp, chép file CA vào máy chủ và đặt `LDAP_CA_FILE=C:\704-assets\ad-ca.crt`. Tùy chọn `LDAP_UPN_SUFFIX=icbv.local` nếu AD yêu cầu đăng nhập dạng `tên@icbv.local`.
2. Tài khoản **`admin` luôn dùng mật khẩu cục bộ** (dự phòng khi AD không truy cập được). Muốn thêm tài khoản cục bộ khác: `LDAP_LOCAL_USERS=admin,ten-khac`.
3. Tên đăng nhập của người dùng trong ứng dụng phải **trùng tên đăng nhập AD** (không gồm `ICBV\`). Người dùng phải được tạo sẵn trong mục Người dùng (kèm vai trò, phòng ban), hoặc đặt `LDAP_AUTOCREATE=1` để tự tạo tài khoản vai trò `user` ở lần đăng nhập AD đầu tiên.
4. Khởi động lại: `Stop-ScheduledTask 704-assets`, tắt tiến trình đang giữ cổng, `Start-ScheduledTask 704-assets`.
5. Thử bằng một tài khoản AD thường. Nếu báo "Không liên lạc được máy chủ Active Directory": kiểm tra máy chủ có truy cập được `<máy-chủ-AD>:636` (`Test-NetConnection`), tên máy, chứng chỉ; xem `logs\app.err.log`.

Lưu ý: khi AD khóa hoặc vô hiệu hóa tài khoản thì bind thất bại nên người đó không đăng nhập được. Nhưng tài khoản vẫn hiện "đang hoạt động" trong ứng dụng và nếu dùng Telegram vẫn nhận thông báo cho đến khi bạn tắt thủ công. Đổi mật khẩu của tài khoản AD thực hiện ở Windows, không đổi trong ứng dụng.

## Bước 10. Vận hành hằng ngày

| Việc | Lệnh (PowerShell Admin) |
|---|---|
| Kiểm tra sức khỏe | `C:\704-assets\doctor.ps1` |
| Khởi động / dừng | `Start-ScheduledTask 704-assets` / `Stop-ScheduledTask 704-assets` |
| Sao lưu tay | `C:\704-assets\backup.ps1` (tự động 02:00, giữ 30 bản ở `data\backups`) |
| Khôi phục | `C:\704-assets\restore.ps1 -File C:\704-assets\data\backups\data-YYYYMMDD-HHmm.json` |
| Xem log | `Get-Content C:\704-assets\logs\app.err.log -Tail 50` (cũng có `telegram.log`, `caddy.log`) |
| Gỡ cài đặt | `C:\704-assets\uninstall.ps1` (giữ nguyên dữ liệu) |

**Sao lưu ra ngoài PC**: thư mục `data\backups` nằm cùng ổ với dữ liệu, nên mỗi tuần chép ra USB/NAS/ổ mạng khác (có thể đặt thêm tác vụ `robocopy C:\704-assets\data\backups \\NAS\backup\704 /MIR`). Sao lưu chỉ nằm trên cùng PC thì ổ hỏng là mất hết.

**Nâng cấp bản mới**: giải nén gói mới vào thư mục mới, chạy lại `CAI-DAT.bat` (hoặc `CAI-DAT-TU-DONG.ps1`). Giữ nguyên `.env` và dữ liệu. Nên chạy `backup.ps1` trước. Nếu đã bật HTTPS, chạy lại `setup-https.ps1` sau nâng cấp (cài lại sẽ mở lại cổng 3000).

## Bước 11. Chuyển hẳn từ Vercel sang máy chủ nội bộ (cutover)

1. Thông báo giờ chuyển; yêu cầu mọi người nhập xong và đăng xuất ở bản cũ.
2. Tải backup mới nhất ở bản cũ → nạp vào máy chủ (Bước 6).
3. Kiểm tra: số tài sản, vài phiếu báo hỏng, nhật ký IT, đăng nhập vài vai trò, in tem QR, xuất biên bản Word.
4. Bật bot Telegram trên máy chủ (Bước 8). Gửi địa chỉ mới `https://<IP>` cho mọi người, hướng dẫn cài chứng chỉ (Bước 7).
5. Đặt bản Vercel ở chế độ chỉ đọc hoặc tắt để tránh nhập nhầm vào hai nơi.
6. **Quay lại bản cũ nếu cần**: bản Vercel/Firebase vẫn nguyên; khi đó chỉ cần đặt lại webhook của bot, và xuất dữ liệu phát sinh từ máy chủ nội bộ bằng backup để nạp ngược.

## Giới hạn cần biết

- Chỉ chạy **một** tiến trình ứng dụng; phù hợp vài chục người dùng đồng thời và vài chục nghìn bản ghi.
- Máy chủ là điểm hỏng duy nhất: mất điện/ổ đĩa hỏng thì hệ thống ngừng. Giảm rủi ro bằng UPS và sao lưu ra ngoài.
- Mất điện đột ngột có thể mất tối đa ~0,3 giây thao tác cuối (ghi file nguyên tử, có `.bak`).
- Người dùng ngoài cơ quan (4G, ở nhà) không vào được trừ khi có VPN của cơ quan. Không mở cổng ra Internet nếu chưa có biện pháp bảo mật.
- Các script Windows trong gói chưa được chạy thử trên máy Windows thật tại thời điểm đóng gói (phần ứng dụng và bot đã chạy thử trên Linux). Lần đầu nên chạy trên máy thử, ghi lại lỗi nếu có.

## Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `CAI-DAT.bat` không chạy / cửa sổ tắt ngay | Mở PowerShell Admin, chạy `CAI-DAT-TU-DONG.ps1` để xem lỗi |
| "Không ra được Internet" | Lần cài đầu cần Internet. Build ở máy khác bằng `deploy\build-package.ps1`, chép `dist-win\704-assets-win.zip` sang, giải nén và chạy `install.ps1` |
| Máy khác không vào được | `Get-NetFirewallRule -DisplayName "704-assets*"`; mạng của PC phải là *Private*/*Domain* (Cài đặt › Mạng › Thuộc tính › Private); thử `Test-NetConnection <IP> -Port 3000` |
| Trang trắng / lỗi 500 | Xem `logs\app.err.log`; `.env` phải có `DB_MODE=local` |
| Đăng nhập xong bị đá ra | Đang dùng HTTP mà `COOKIE_SECURE=1` → dùng HTTPS, hoặc đặt `COOKIE_SECURE=0` |
| Camera quét QR không mở | Chưa dùng HTTPS hoặc thiết bị chưa tin cậy chứng chỉ (Bước 7) |
| Bot không trả lời | `doctor.ps1`; xem `logs\telegram.log`; token sai; người dùng chưa gán Telegram ID; bot còn webhook ở nơi khác (script đã gỡ khi chạy) |
| Port 80/443 bị chiếm (IIS...) | Dừng IIS hoặc dùng cổng khác cho Caddy (sửa `https\Caddyfile`) |
| Quên mật khẩu admin | `Invoke-RestMethod -Method Post http://localhost:3000/api/admin/bootstrap -Headers @{"x-admin-key"="<ADMIN_KEY trong .env>"} -ContentType application/json -Body '{"username":"admin","password":"MatKhauMoi@2026","full_name":"Quản trị"}'` |
