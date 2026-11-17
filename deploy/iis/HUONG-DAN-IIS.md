# Page con (HTML) của Portal IIS dùng chung đăng nhập AD — hướng dẫn cho IIS

**Hiện trạng:** Portal chạy IIS, các page con là HTML tĩnh. Trang 704 chạy riêng bằng máy chủ 704 (Node) nên **không thể bỏ file HTML vào thư mục IIS** (trang cần máy chủ để lưu dữ liệu và kiểm tra quyền). Cách đúng: **IIS đứng trước làm cổng xác thực, chuyển tiếp (reverse proxy) vào máy chủ 704.**

```
Người dùng ──(đã đăng nhập Windows/AD)──► IIS site "assets.icbv.com" ──► máy chủ 704 (192.168.1.18:3000)
                 Windows Authentication      gắn header tên người dùng       tra nhóm AD → phân quyền
```
Người dùng vào từ Portal không phải nhập lại gì (trình duyệt tự gửi danh tính Windows). Chưa đăng nhập/không có danh tính thì IIS tự yêu cầu — không bao giờ thấy trang 704 mà không qua IIS.

## Chọn cách

| Portal xác thực bằng… | Dùng |
|---|---|
| **Windows Authentication** (máy tính trong domain, vào Portal là tự nhận) | **Cách B (IIS proxy)** — mục 1–5 bên dưới. Không cần sửa mã Portal. |
| Form đăng nhập tự viết (ASP.NET) kiểm tra LDAP | **Cách A (`sso.ashx`)** — mục 6. Thêm 1 file vào Portal. |

Chưa rõ Portal dùng loại nào: mở IIS Manager → site Portal → *Authentication*; nếu *Windows Authentication = Enabled* và *Anonymous = Disabled* thì dùng cách B.

## 1. Chuẩn bị trên máy chủ 704
1. Đã làm phân quyền theo nhóm (Phụ lục 1 của `HUONG_DAN_TRIEN_KHAI_PC.md`) và **xin tài khoản AD chỉ đọc** (ví dụ `svc-assets-ro`).
2. `powershell -ExecutionPolicy Bypass -File setup-ldap.ps1 -Url "ldap://icbv.com" -Domain ICBV -BaseDn "dc=icbv,dc=com" -RoleMap "admin=704-Admin;tcth=704-TCTH;it=704-IT;manager=704-LDP;user=704-User" -RequireGroup -DeptAttr department -BindDn "CN=svc-assets-ro,OU=Service,DC=icbv,DC=com" -BindPassword "<mật khẩu>"`
   (`-BindDn` bắt buộc với cách B: IIS chỉ báo tên người dùng, **máy chủ 704 tự tra nhóm** bằng tài khoản này.)
3. `powershell -ExecutionPolicy Bypass -File setup-sso.ps1 -HeaderMode` → trong `C:\704-assets\.env` có dòng `SSO_PROXY_SECRET=…` (sao chép giá trị này, **không gửi qua chat/email**).
4. **Chỉ IIS được vào cổng 3000:** nếu IIS cùng máy: trong `.env` đặt `HOSTNAME=127.0.0.1` rồi chạy `restart.ps1`. Nếu IIS ở máy khác (IP ví dụ `192.168.1.10`):
   `netsh advfirewall firewall delete rule name="704-assets"` rồi
   `netsh advfirewall firewall add rule name="704-assets-iis" dir=in action=allow protocol=TCP localport=3000 remoteip=192.168.1.10`
   *(nếu bỏ bước này, người dùng gõ thẳng `http://192.168.1.18:3000` + tự thêm header là giả mạo được người khác — tuy khó vì phải biết khóa, vẫn phải chặn.)*

## 2. Chuẩn bị IIS (một lần)
Cài **URL Rewrite** và **Application Request Routing (ARR)** (Web Platform Installer hoặc tải từ Microsoft). Rồi PowerShell quản trị:
```
$a = "$env:windir\system32\inetsrv\appcmd.exe"
& $a set config -section:system.webServer/proxy /enabled:"True" /commit:apphost
& $a set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_REMOTE_USER']" /commit:apphost
& $a set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_SSO_SECRET']" /commit:apphost
```
Bật tính năng Windows: *IIS → World Wide Web Services → Security → Windows Authentication*.

## 3. Tạo site cổng vào
1. Thư mục rỗng, ví dụ `C:\inetpub\assets704`. Chép `web.config` (cùng thư mục này) vào đó.
2. Sửa trong `web.config`: `CHANGE_ME_SSO_PROXY_SECRET` → giá trị `SSO_PROXY_SECRET`; `http://192.168.1.18:3000` → địa chỉ máy chủ 704.
3. IIS Manager → *Sites → Add Website*: tên `assets704`, đường dẫn trên, **Host name** `assets.icbv.com` (nhờ bên hạ tầng tạo bản ghi DNS trỏ về IIS), **HTTPS** với chứng chỉ nội bộ của ICBV.
4. Cấp quyền đọc `web.config` chỉ cho *Administrators* và *IIS_IUSRS* (trong file có khóa).
5. Trên máy 704 đặt `COOKIE_SECURE=1` (vì người dùng vào bằng HTTPS) rồi `restart.ps1`.

## 4. Gắn vào Portal
Trong trang HTML của Portal, đặt liên kết `<a href="https://assets.icbv.com/">Quản lý tài sản</a>`. Máy tính cần coi `assets.icbv.com` là *Local intranet* thì Windows mới tự gửi danh tính (GPO: *Site to Zone Assignment List* hoặc dùng tên không có dấu chấm). Nếu không, trình duyệt hiện hộp hỏi mật khẩu một lần.

## 5. Kiểm tra
- Từ máy trong domain bằng tài khoản thuộc nhóm `704-IT`: mở `https://assets.icbv.com/` → vào thẳng, vai trò Điện toán.
- Tài khoản không thuộc nhóm 704-* → thấy thông báo "chưa được cấp quyền".
- Đổi nhóm trong AD rồi **mở lại trang** (đăng nhập lại) → vai trò đổi theo.
- Xem `C:\704-assets\logs\app.err.log` nếu có dòng "LDAP".
- Tài khoản `admin` nội bộ vẫn đăng nhập bằng mật khẩu qua form (không dùng SSO).

## 6. Cách A — Portal đăng nhập kiểu form/LDAP (dùng `sso.ashx`)
1. Trên 704: `setup-sso.ps1 -Issuer icbv-portal` (lấy `SSO_SECRET` trong `.env`, gửi quản trị Portal qua kênh an toàn).
2. Chép `sso.ashx` vào Portal; sửa `Secret`, `Target`, và hàm `LayNguoiDung()` (lấy người dùng/nhóm theo cách Portal đang lưu). Nếu không truyền nhóm, 704 tự tra bằng `-BindDn` như trên.
3. Liên kết trong Portal: `<a href="/sso.ashx">Quản lý tài sản</a>` (chỉ người đã đăng nhập Portal bấm được).
4. Trang 704 không cần qua IIS proxy trong cách này; người dùng đi thẳng tới `https://assets.icbv.com/` do máy chủ 704 phục vụ (cần HTTPS: `setup-https.ps1`).

## Lưu ý
- Bản **chưa kiểm thử trên IIS thật**: mã phía 704 đã test bằng AD giả, còn `web.config` và `sso.ashx` cần thử trên IIS của đơn vị.
- Đăng xuất Portal không tự đăng xuất 704 (phiên 704 tối đa 12 giờ). Với cách B, đóng trình duyệt/đăng xuất Windows là mất danh tính; mỗi lần mở lại trang IIS vẫn tự cấp phiên theo người đang đăng nhập Windows.
- Máy dùng chung nhiều người (một tài khoản Windows): không phù hợp SSO; dùng đăng nhập form.
