# Triển khai 704-ASSETS trên PC làm máy chủ (mạng LAN) — hướng dẫn từ đầu đến cuối

Chạy hoàn toàn trên PC trong cơ quan, **không dùng Firebase/Vercel** nên không còn giới hạn lượt đọc. Dữ liệu nằm trong một file trên ổ đĩa PC, sao lưu tự động mỗi ngày. Tùy chọn: HTTPS nội bộ, bot Telegram, đăng nhập bằng Active Directory (ICBV).

Thời gian lần đầu: khoảng 45–60 phút, phần lớn là chờ build.

## Tóm tắt các bước

| # | Việc | Làm bằng |
|---|---|---|
| 1 | Chuẩn bị PC, IP tĩnh | Thủ công |
| 2 | Lấy file dữ liệu cũ | Thủ công |
| 3 | Giải nén gói zip | Thủ công |
| 4 | Cài đặt | `deploy\CAI-DAT.bat` |
| 5 | Kiểm tra, vào được từ máy khác | `C:\704-assets\KIEM-TRA.bat` |
| 6 | Đổi mật khẩu admin | Giao diện web |
| 7 | Nạp dữ liệu | `import-excel.ps1` |
| 8 | Bật Active Directory (ICBV) | `setup-ldap.ps1` |
| 9 | Bật HTTPS (camera QR, cài ứng dụng) | `setup-https.ps1` |
| 10 | Bật bot Telegram | `setup-telegram.ps1` |
| 11 | Dọn dữ liệu, phân quyền | Giao diện web |
| 12 | Vận hành, sao lưu, nâng cấp | các file `.bat` |

---

## Bước 1. Chuẩn bị PC

- Windows 10/11 Pro hoặc Windows Server 2019+, RAM ≥ 4 GB, trống ≥ 5 GB. Bật 24/7, nên có UPS. Cắm dây mạng LAN.
- **IP tĩnh** (Cài đặt › Mạng › Ethernet › Chỉnh sửa gán IP › Thủ công, hoặc nhờ quản trị mạng đặt IP cố định theo địa chỉ MAC). Ghi lại IP, ví dụ `192.168.1.18`.
- Có Internet ở lần cài đầu (tải Node.js và thư viện).
- Tài khoản Administrator.

## Bước 2. Lấy dữ liệu cũ

- **Từ bản Vercel đang chạy:** đăng nhập admin, tải file **Backup JSON**. Nếu Firebase hết hạn mức, đợi đến khoảng 15:00 giờ Việt Nam rồi tải.
- **Hoặc** dùng file `du-lieu-RS-CCDC-TSCD.json` (3.088 tài sản, 18 phòng ban, 75 danh mục, tạo từ Excel; không có người dùng, phiếu, nhật ký).

Chép file vào PC máy chủ, ví dụ `D:\AI_app\`. File dữ liệu là dữ liệu thật: không gửi qua kênh công khai.

## Bước 3. Giải nén gói cài

Giải nén `704-assets-pc-server.zip` vào thư mục có đường dẫn ngắn, không dấu, ví dụ `D:\AI_app\704-portal`. Giữ nguyên cấu trúc (có `package.json`, `deploy\`, `lib\`, `app\`…).

## Bước 4. Cài đặt

Bấm đúp **`deploy\CAI-DAT.bat`**, chọn *Yes* khi Windows hỏi quyền quản trị. Màn hình có thể đứng yên vài phút ở `npm install` và build; cứ để chạy (khoảng 5–15 phút, có thể lâu hơn nếu ổ cứng chậm hoặc có phần mềm diệt virus quét).

Muốn cài đủ trong một lệnh (PowerShell *Run as Administrator*):

```powershell
cd D:\AI_app\704-portal\deploy
powershell -ExecutionPolicy Bypass -File .\CAI-DAT-TU-DONG.ps1 `
   -AdminPassword "MatKhauManh@2026" `
   -DataFile "D:\AI_app\du-lieu-RS-CCDC-TSCD.json" `
   -LdapUrl "ldap://icbv.com" -LdapDomain "ICBV" `
   -Https `
   -TelegramToken "123456:ABC..." -TelegramGroupId "-100123456789"
```
Mọi tham số đều tùy chọn, bỏ tham số nào thì làm bước đó sau cũng được.

Script tự làm: tắt chế độ ngủ của máy → cài Node.js 22 nếu thiếu → `npm install` + build → chép ứng dụng vào `C:\704-assets` → sinh khóa bí mật ngẫu nhiên trong `.env` → đăng ký dịch vụ khởi động cùng Windows (tự chạy lại nếu lỗi) → sao lưu 02:00 mỗi ngày (giữ 30 bản) → mở tường lửa cổng 3000 (mọi loại mạng, chỉ từ mạng con nội bộ) → tạo tài khoản admin → kiểm tra sức khỏe.

Sau khi cài, trong `C:\704-assets` có các file bấm đúp tiện dụng: `KHOI-DONG-LAI.bat`, `KIEM-TRA.bat`, `SAO-LUU-NGAY.bat`, `DAT-LAI-MAT-KHAU-ADMIN.bat`.

## Bước 5. Kiểm tra

1. Trên máy chủ: `http://localhost:3000` thấy màn hình đăng nhập.
2. Trên máy khác cùng mạng: `http://<IP máy chủ>:3000`.
3. Bấm đúp `C:\704-assets\KIEM-TRA.bat`: các dòng `[ OK ]` là tốt.

Nếu máy khác ping được nhưng không vào được cổng 3000, thường là tường lửa. Chạy trên máy chủ (PowerShell Administrator):
```powershell
Get-NetFirewallRule -DisplayName "704-assets" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "704-assets" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -RemoteAddress LocalSubnet
```
Kiểm tra từ máy khách: `Test-NetConnection <IP> -Port 3000` phải `TcpTestSucceeded : True`. Nếu có phần mềm diệt virus kèm tường lửa riêng, thêm luật cho cổng 3000 ở đó.

## Bước 6. Đổi mật khẩu admin

Mật khẩu ban đầu ở `C:\704-assets\TAI_KHOAN_BAN_DAU.txt` (nếu không đặt `-AdminPassword`). Đăng nhập, đổi mật khẩu, xóa file này.

**Quên mật khẩu admin:** bấm đúp `DAT-LAI-MAT-KHAU-ADMIN.bat` (hỏi mật khẩu mới, tối thiểu 8 ký tự), hoặc:
```
powershell -ExecutionPolicy Bypass -File C:\704-assets\reset-admin.ps1 -Password "MatKhauMoi@2026"
```

## Bước 7. Nạp dữ liệu

```
powershell -ExecutionPolicy Bypass -File C:\704-assets\import-excel.ps1 -File "D:\AI_app\du-lieu-RS-CCDC-TSCD.json"
```
- Dùng **đường dẫn thật** của file (kiểm tra: `dir D:\AI_app\*.json`). Lỗi `ENOENT` = file không có ở đường dẫn đó.
- Nạp lại nhiều lần vẫn an toàn (ghi đè theo mã, không xóa).
- Tài khoản người dùng cũ sau khi nạp từ backup có mật khẩu `123456`: đổi hết, hoặc dùng Active Directory (bước 8).
- Sau khi nạp: trên trình duyệt đăng xuất, xóa cookie và dữ liệu trang của địa chỉ máy chủ (Ctrl+Shift+Delete), đăng nhập lại để tải đủ dữ liệu. Kiểm tra tổng số tài sản đủ 3.088.

## Bước 8. Đăng nhập bằng Active Directory (domain ICBV)

Người dùng đăng nhập bằng tên và mật khẩu Windows: gõ `an.nguyen`, `ICBV\an.nguyen` hoặc `an.nguyen@icbv.com` đều được. Mật khẩu do AD kiểm tra, ứng dụng không lưu mật khẩu AD. Vai trò, phòng ban, Telegram ID vẫn do ứng dụng quản lý.

```
powershell -ExecutionPolicy Bypass -File C:\704-assets\setup-ldap.ps1 -Url "ldap://icbv.com" -Domain ICBV
```
Tùy chọn: `-UpnSuffix icbv.com` (nếu bind `ICBV\tên` bị từ chối, dùng dạng `tên@icbv.com`), `-CaFile C:\704-assets\ad-ca.crt` (CA nội bộ khi dùng `ldaps://`), `-AutoCreate` (tự tạo tài khoản vai trò `user` ở lần đăng nhập AD đầu tiên; mặc định chỉ cho người đã được tạo sẵn), `-LocalUsers "admin"`. Tắt: `setup-ldap.ps1 -Off`.

Quy tắc:
- Tài khoản **`admin` luôn dùng mật khẩu cục bộ** (dự phòng khi AD hỏng).
- Tên đăng nhập trong mục Người dùng phải **trùng tên đăng nhập AD** (không gồm `ICBV\`).
- `ldap://` (cổng 389) gửi mật khẩu **không mã hóa** trên mạng. Nên dùng `ldaps://<máy-chủ-AD>:636` nếu có.
- Khi AD khóa/vô hiệu hóa tài khoản, người đó không đăng nhập được, nhưng ứng dụng vẫn hiện họ "đang hoạt động" (và nếu dùng Telegram vẫn nhận thông báo) cho đến khi bạn tắt thủ công.

Thử kết nối AD ngoài ứng dụng (PowerShell trên máy chủ):
```powershell
Add-Type -AssemblyName System.DirectoryServices.Protocols
$c = New-Object System.DirectoryServices.Protocols.LdapConnection("icbv.com:389")
$c.SessionOptions.ProtocolVersion = 3; $c.AuthType = "Basic"
$c.Bind((New-Object System.Net.NetworkCredential("tên@icbv.com","mật khẩu"))); "Bind OK"
```
`The LDAP server is unavailable` = không với tới máy chủ AD; `The supplied credential is invalid` = sai tên/mật khẩu. Lỗi chi tiết khác nằm ở `logs\app.err.log`.

## Bước 9. HTTPS nội bộ (cần cho camera quét QR và cài ứng dụng lên điện thoại)

Trình duyệt chỉ cho dùng camera và cài ứng dụng trên HTTPS. Script dùng Caddy tự cấp chứng chỉ nội bộ.

1. Chạy: `powershell -ExecutionPolicy Bypass -File C:\704-assets\setup-https.ps1`
2. Địa chỉ mới: `https://<IP máy chủ>` (cổng 443). Cổng 3000 bị đóng với mạng LAN.
3. Mỗi thiết bị cần **tin cậy chứng chỉ gốc một lần**, tải từ `http://<IP máy chủ>:8081/704-root-ca.crt`:
   - **Windows:** mở file › Cài đặt chứng chỉ › Local Machine › *Trusted Root Certification Authorities*. Có Active Directory thì phát bằng Group Policy.
   - **iPhone/iPad:** mở link bằng Safari › Cài đặt hồ sơ; rồi Cài đặt › Cài đặt chung › Giới thiệu › Cài đặt tin cậy chứng nhận › bật tin cậy.
   - **Android:** Cài đặt › Bảo mật › Mã hóa & thông tin xác thực › Cài đặt từ bộ nhớ › Chứng chỉ CA.

**Quan trọng:** script đặt `COOKIE_SECURE=1`. Từ lúc đó **chỉ đăng nhập được qua `https://`**. Nếu còn truy cập `http://IP:3000` thì không đăng nhập được (trình duyệt từ chối cookie). Muốn quay về HTTP: đặt `COOKIE_SECURE=0` trong `C:\704-assets\.env`, mở lại cổng 3000 trong tường lửa, chạy `restart.ps1`.

## Bước 10. Bot Telegram (không cần địa chỉ công khai)

Bot hỏi Telegram bằng `getUpdates`: chỉ cần máy chủ ra được Internet, không mở cổng vào.

1. Lấy token ở @BotFather. **Token từng dán vào chat/tài liệu phải tạo lại** (`/revoke`).
2. `powershell -ExecutionPolicy Bypass -File C:\704-assets\setup-telegram.ps1 -Token "<token>" -GroupId "<id nhóm IT, tùy chọn>"`
3. Nhắn `/start` cho bot. Mỗi người cần được **gán Telegram ID trong hồ sơ người dùng**. Cán bộ IT cần vai trò `it` để nhận thông báo phiếu.
4. Một bot chỉ dùng một chế độ: khi bật trên PC thì bản Vercel không nhận được tin của bot.

## Bước 11. Dọn dữ liệu và phân quyền

- **Phòng ban trùng:** nếu thấy phòng ban hiện đôi (mã ngắn như `399001.0000000` và mã dài `399001.0000000-Ban giám đốc.Khong xac dinh`), sao lưu trước, kiểm tra phòng mã ngắn có tài sản/người dùng không (nhấp đúp dòng để xem người dùng), rồi mới bấm Xoá. Ứng dụng chỉ chặn xóa phòng đang có tài sản, **không** kiểm tra người dùng.
- Tạo người dùng, gán vai trò (admin / tcth / it / manager / user) và phòng ban. Chỉ admin tạo và xóa tài sản.
- Khóa bí mật nằm trong `C:\704-assets\.env` (chỉ Administrators/SYSTEM đọc được). Không gửi đi đâu. Nên bật BitLocker cho ổ chứa dữ liệu. Đặt giờ hoạt động Windows Update để máy không tự khởi động lại giữa giờ làm (sau khởi động lại, dịch vụ tự chạy).

## Bước 12. Vận hành

| Việc | Cách làm |
|---|---|
| **Khởi động lại nhanh** (sau khi sửa `.env`) | Bấm đúp `C:\704-assets\KHOI-DONG-LAI.bat` hoặc `powershell -ExecutionPolicy Bypass -File C:\704-assets\restart.ps1` |
| Kiểm tra sức khỏe | `KIEM-TRA.bat` |
| Sao lưu tay | `SAO-LUU-NGAY.bat` (tự động 02:00, giữ 30 bản trong `data\backups`) |
| Khôi phục | `powershell -ExecutionPolicy Bypass -File C:\704-assets\restore.ps1 -File C:\704-assets\data\backups\data-YYYYMMDD-HHmm.json` |
| Xem log | `Get-Content C:\704-assets\logs\app.err.log -Tail 50` (cũng có `telegram.log`, `caddy.log`) |
| Gỡ cài đặt | `uninstall.ps1` (giữ nguyên dữ liệu) |

**Sao lưu ra ngoài PC:** `data\backups` nằm cùng ổ với dữ liệu, nên mỗi tuần chép ra USB/NAS/ổ mạng khác. Sao lưu chỉ nằm trên cùng PC thì ổ hỏng là mất hết.

**Nâng cấp bản mới:** giải nén gói mới (hoặc chép đè file được gửi), chạy lại `deploy\CAI-DAT.bat`. `.env` và dữ liệu được giữ. Chạy `SAO-LUU-NGAY.bat` trước. Nếu đã bật HTTPS, chạy lại `setup-https.ps1` sau nâng cấp (cài lại sẽ mở lại cổng 3000).

**Chuyển hẳn từ Vercel sang máy chủ nội bộ:** (1) thông báo giờ chuyển, mọi người nhập xong và đăng xuất ở bản cũ; (2) tải backup mới nhất ở bản cũ, nạp vào máy chủ; (3) kiểm tra số tài sản, phiếu báo hỏng, nhật ký IT, đăng nhập vài vai trò, in tem QR, xuất biên bản Word; (4) bật Telegram trên máy chủ, gửi địa chỉ mới cho mọi người; (5) tắt hoặc đặt bản Vercel chỉ đọc để tránh nhập nhầm hai nơi; (6) giữ bản Vercel/Firebase làm đường lui.

## Giới hạn cần biết

- Chỉ chạy **một** tiến trình; phù hợp vài chục người dùng đồng thời và vài chục nghìn bản ghi.
- Máy chủ là điểm hỏng duy nhất: mất điện/ổ đĩa hỏng thì ngừng. Dùng UPS và sao lưu ra ngoài.
- Mất điện đột ngột có thể mất tối đa ~0,3 giây thao tác cuối.
- Người dùng ngoài cơ quan (4G) không vào được trừ khi có VPN. **Không mở cổng ra Internet** nếu chưa có biện pháp bảo mật và chưa được bộ phận an toàn thông tin duyệt.
- Các script Windows đã được chạy thử thật trên một máy Windows 11 trong quá trình triển khai (cài đặt, nạp dữ liệu, đăng nhập). Phần HTTPS (Caddy), Telegram trên Windows và đăng nhập AD thật **chưa được chạy thử**; hãy thử trên máy thử trước khi dùng chính thức.

## Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `File ... cannot be loaded because running scripts is disabled` | Luôn chạy qua `powershell -ExecutionPolicy Bypass -File ...` hoặc bấm đúp file `.bat` |
| `CAI-DAT.bat` báo lỗi cú pháp ngay | Dùng bản mới nhất của gói zip |
| Kẹt lâu ở `npm install` | Chờ 10–15 phút. Nếu vẫn đứng, nhấn Ctrl+C rồi chạy lại; kiểm tra mạng/proxy, tạm tắt quét virus thư mục `D:\AI_app` |
| Máy khác ping được nhưng không vào cổng 3000 | Xem bước 5 (tường lửa, loại mạng) |
| Vào được nhưng hiện "Chưa đăng nhập." không đăng nhập được | `COOKIE_SECURE=1` mà đang dùng `http://`. Đặt `COOKIE_SECURE=0`, chạy `restart.ps1`, xóa cookie trình duyệt |
| Chỉ hiện 800 tài sản | Cần bản mã đã sửa (`lib\localdb.ts` mới): chạy lại `CAI-DAT.bat`, rồi xóa dữ liệu trang của trình duyệt |
| `ENOENT ... du-lieu.json` khi nạp | Đường dẫn file sai/không tồn tại: kiểm tra bằng `dir` |
| Camera quét QR không mở | Chưa dùng HTTPS hoặc thiết bị chưa tin cậy chứng chỉ (bước 9) |
| Bot không trả lời | `KIEM-TRA.bat`; xem `logs\telegram.log`; token sai; người dùng chưa gán Telegram ID |
| "Không liên lạc được máy chủ Active Directory" | Kiểm tra `Test-NetConnection icbv.com -Port 389`, DNS, chứng chỉ (nếu ldaps); xem `logs\app.err.log` |
| Đăng nhập AD báo sai mật khẩu | Thử thêm `-UpnSuffix icbv.com` trong `setup-ldap.ps1`; kiểm tra tên đăng nhập trong ứng dụng trùng tên AD |
| Port 80/443 bị chiếm (IIS...) | Dừng IIS hoặc dùng cổng khác cho Caddy (sửa `https\Caddyfile`) |
