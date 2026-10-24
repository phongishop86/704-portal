# 704-assets (bản máy chủ) + chatbot IT Telegram

Một project duy nhất, triển khai trên **Vercel**, dữ liệu trên **Firebase Firestore**:

```
Trình duyệt (giao diện 704-assets)  ──┐
                                      ├──▶ Vercel (Next.js API) ──▶ Firestore  ──▶ Google Sheet (bản chiếu nhật ký IT, tùy chọn)
Telegram (IT nhắn bot) ─▶ Claude ─────┘
```

- **Một nguồn dữ liệu**: tài sản, phiếu báo hỏng, điều chuyển, người dùng… nằm trong Firestore. Web và bot đọc/ghi cùng chỗ.
- IT ghi nhật ký / đóng phiếu qua bot thì **web thấy trong ≤ 20 giây** (không cần tải lại, không xuất nhập file).
- Người dùng đăng nhập thật (mật khẩu băm scrypt, cookie phiên ký HMAC, khoá 15 phút nếu sai 5 lần).
- Bot nhận diện nhân viên bằng **Telegram ID** nhập trong Admin → Người dùng.

> **Đọc trước:** `CAU_HINH_CHI_TIET.md` là hướng dẫn cấu hình từng bước (Firebase, GitHub, Vercel, Telegram, Claude, Sheet, bảo mật, sự cố). Muốn xem thử không cần tài khoản: `npm install && npm run demo`, kịch bản trong `DEMO_SCRIPT.md`.

## 1. Chuẩn bị (một lần)

| Việc | Cách làm | Lấy được |
|---|---|---|
| Firebase | console.firebase.google.com → tạo project → **Firestore Database**, chọn vùng **asia-southeast1 (Singapore)**, chế độ production. Dán `firestore.rules` vào tab Rules (chặn mọi truy cập từ client). | — |
| Service account | Project settings → Service accounts → *Generate new private key* | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Gói tính phí Firebase | Nên bật **Blaze** (trả theo mức dùng, chi phí thường vài nghìn đồng/ngày) vì lần đăng nhập đầu của mỗi máy đọc toàn bộ dữ liệu; gói Spark giới hạn 50.000 lượt đọc/ngày. Đặt cảnh báo ngân sách. | — |
| Telegram bot | Chat @BotFather → `/newbot` | `TELEGRAM_BOT_TOKEN`; tự đặt `TG_SECRET` |
| Claude | console.anthropic.com → API keys | `ANTHROPIC_API_KEY` |
| Chuỗi bí mật | Sinh 3 chuỗi ngẫu nhiên dài (ví dụ `openssl rand -hex 32`) | `SESSION_SECRET`, `ADMIN_KEY`, `CRON_SECRET` |
| Google Sheet (tùy chọn) | Tạo Sheet có tab `WorkLog`, hàng 1: `id, timestamp, it_user, asset_code, asset_name, department, category, description, duration_min, status, ticket_ref`. Chia sẻ quyền Editor cho email service account. | `SHEET_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` |

## 2. Triển khai lên Vercel

1. Đưa thư mục này lên một repo GitHub **riêng tư** (đã có `.gitignore`, **không** commit `.env`).
2. vercel.com → *Add New → Project* → chọn repo (Framework: Next.js, không cần chỉnh gì).
3. *Settings → Environment Variables*: nhập toàn bộ biến trong `.env.example`. `FIREBASE_PRIVATE_KEY` dán nguyên khối, giữ các ký tự `\n`.
4. Deploy. `vercel.json` đã đặt vùng `sin1` (Singapore) và lịch nhắc việc 08:00 giờ VN.
5. Đăng ký webhook Telegram:
   ```bash
   scripts/set-webhook.sh <TELEGRAM_BOT_TOKEN> https://<ten-app>.vercel.app <TG_SECRET>
   ```
6. (Tùy chọn) Nhóm Telegram của IT: thêm bot vào nhóm, lấy số ID nhóm (số âm), điền `TG_GROUP_ID` để nhận nhắc việc.

## 3. Nạp dữ liệu hiện có từ 704-assets bản offline (một lần)

1. Trong bản **offline cũ**: Admin → Nhập/Xuất dữ liệu → *Sao lưu* → **Tải file Backup (.json)**.
2. Nạp lên máy chủ:
   ```bash
   node scripts/import-backup.mjs https://<ten-app>.vercel.app <ADMIN_KEY> VietinBank_Assets_FullBackup_YYYYMMDD.json
   ```
   Kết quả có `usersWithoutPassword`: số tài khoản chưa có mật khẩu (sẽ không đăng nhập được cho đến khi admin đặt lại).
3. Mật khẩu dạng chữ trong backup cũ được **băm** trước khi lưu. Tài khoản mẫu cũ có mật khẩu `123456`: **đổi hết ngay** sau khi vào hệ thống.
4. Nếu bắt đầu từ Firestore trống (không có backup), tạo admin đầu tiên:
   ```bash
   curl -X POST https://<ten-app>.vercel.app/api/admin/bootstrap \
     -H "x-admin-key: <ADMIN_KEY>" -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"<mat-khau-it-nhat-8-ky-tu>","full_name":"Quản trị hệ thống"}'
   ```
   Cũng dùng lệnh này để cấp lại quyền admin nếu quên mật khẩu.

Sau bước này mở `https://<ten-app>.vercel.app`, đăng nhập và dùng như bản cũ. Từ đây dữ liệu nằm trên máy chủ; **không dùng lại bản offline** (dữ liệu cũ trong trình duyệt sẽ không đồng bộ).

## 4. Cho IT dùng chatbot

1. Mỗi IT nhắn bot `/id`: bot trả về **Telegram ID** của họ (gõ `/id` trong nhóm để lấy `TG_GROUP_ID`).
2. Admin vào *Cài đặt → Người dùng → Sửa*, điền **Telegram ID** cho tài khoản (vai trò IT hoặc Admin).
3. IT nhắn tự nhiên:
   - `Thay RAM máy FA0001 phòng KHDN, 30 phút` → bot hiện bản nháp → bấm **✅ Ghi**.
   - `Xong máy FA0001, thay nguồn 45 phút` → nếu thiết bị có đúng một phiếu ở bước *Điện toán xử lý*, bấm ✅ sẽ **ghi nhật ký + đóng phiếu + trả tài sản về "Đang sử dụng" + ghi lịch sử hồ sơ 360°** (giống nút "IT khắc phục xong" trên web).
   - `/lichsu FA0001` lịch sử xử lý (cảnh báo nếu ≥ 3 lần) · `/phieu` phiếu chờ Điện toán · `/homnay` việc đã ghi hôm nay.
4. Trên web: hồ sơ tài sản có thẻ **🧰 Nhật ký xử lý của IT**; menu **Nhật ký IT** (Admin/TCTH/IT) liệt kê và tìm kiếm toàn bộ.
5. Mỗi 08:00 bot nhắc nhóm IT các phiếu chờ Điện toán, đánh dấu quá hạn sau `SLA_HOURS` (mặc định 24 giờ kể từ lúc TCTH điều phối).

## 5. Cách đồng bộ hoạt động

- Giao diện giữ dữ liệu trong bộ nhớ như bản cũ. Mỗi lần lưu, chỉ **bản ghi thay đổi** được gửi lên (lô ≤ 400). Góc trái dưới hiện ⏳ Đang lưu / ✅ Đã lưu / ⚠️ lỗi (tự thử lại).
- Cứ 20 giây trình duyệt đọc 1 document `meta/rev`; có thay đổi mới thì kéo phần thay đổi. Nếu bạn đang nhập dở form, giao diện không vẽ lại mà hiện thanh "🔄 Có cập nhật mới".
- Trùng sửa cùng một bản ghi: **người lưu sau thắng** (mức bản ghi). Bản ghi bạn đang sửa dở không bị ghi đè bởi bản từ máy khác.
- Sau khi đăng nhập, dữ liệu được đệm trong trình duyệt để tải lại trang chỉ kéo phần mới. Đăng xuất xoá bộ đệm.
- Mất mạng: thay đổi giữ lại và gửi khi có mạng; **không có chế độ làm việc offline lâu dài**.

## 5b. Công cụ dụng cụ (CCDC) và kiểm kê đối chiếu

**CCDC**: menu *Công cụ dụng cụ* dùng chung sổ tài sản. Mục được nhận là CCDC khi mã bắt đầu bằng `CC` hoặc khi nhập từ file CC0203 hoặc khi TCTH/Admin phân loại tay (trường `kind`). Ở chế độ *Tất cả* TCTH/Admin sửa hàng loạt phân loại nhận nhầm.

| Vai trò | Quyền với CCDC |
|---|---|
| Admin, TCTH | xem tất cả, cấp phát / thu hồi, phân loại, xem nguyên giá, xuất CSV |
| Lãnh đạo phòng | xem CCDC phòng mình; báo hỏng / điều chuyển qua quy trình duyệt |
| IT | xem tất cả (không cấp phát, không thấy nguyên giá) |
| Nhân viên | chỉ xem CCDC được giao cho mình; báo hỏng |

**Kiểm kê**: Admin/TCTH tạo *phiên* (phòng ban + loại: TSCĐ / CCDC / cả hai) → người kiểm tích ✅ Có / ❌ Không thấy / ⚠️ Sai thông tin, ghi tài sản **thừa** → Chốt phiên → in *biên bản đối chiếu* hoặc xuất CSV. Lãnh đạo phòng tích phần phòng mình. Dữ liệu: `inventoryChecks` (phiên) + `inventoryLines` (kết quả từng dòng, id `<phiên>__<tài sản>`).

Lưu ý: giới hạn "chỉ phòng mình" và "phiên đã chốt" do **giao diện** áp dụng; máy chủ mới chặn theo vai trò (tạo/chốt phiên chỉ Admin+TCTH; ghi kết quả chỉ Admin+TCTH+lãnh đạo phòng).

**Quy trình báo hỏng 5 bước** (đã có sẵn và được kiểm thử): nhân viên báo → lãnh đạo phòng duyệt → TCTH điều phối → IT xử lý (web hoặc chatbot) → **người báo xác nhận hoàn tất**.

## 6. Bảo mật và giới hạn cần biết

- Chỉ **server** truy cập Firestore (rules chặn client). Khoá service account chỉ ở biến môi trường Vercel.
- Phân quyền ghi ở máy chủ theo vai trò: *users* chỉ Admin; *phòng ban/nhóm/mẫu biểu* Admin+TCTH; *nhật ký IT* Admin+IT; các bảng còn lại mọi tài khoản đang hoạt động (đúng như ngữ nghĩa quy trình hiện tại). **Mọi tài khoản đăng nhập đều tải được toàn bộ dữ liệu về trình duyệt** (giống bản offline cũ); việc ẩn/hiện theo vai trò là ở giao diện. Nếu cần chặn cứng theo phòng ban thì phải bổ sung lọc phía máy chủ.
- Bot **không bao giờ** đọc hay trả nguyên giá / giá trị còn lại.
- **Xoá trắng (Hard Reset) đã bị vô hiệu** vì dữ liệu là dùng chung. Xoá bản ghi trên web để lại "mồ" (`_del`) nên khôi phục được từ Firestore.
- Mỗi bản ghi tối đa ~900KB (mẫu biểu Word/Excel tải lên lưu base64 nên file mẫu nên < 600KB).
- Xin ý kiến bộ phận An toàn thông tin: dữ liệu nằm trên Google Cloud/Vercel, tin nhắn đi qua Telegram, văn bản người dùng gửi tới API Claude.

## 7. Phát triển và kiểm thử

```bash
npm install
npm run typecheck      # kiểm tra kiểu
npm test               # lớp đồng bộ giao diện + logic máy chủ (Firestore/Claude giả, không cần mạng)
npm run test:e2e       # chạy giao diện thật trong Chromium (cần playwright + trình duyệt)
npm run demo           # chạy thử toàn bộ cục bộ, không cần tài khoản (xem DEMO_SCRIPT.md)
npm run test:demo      # kiểm thử tự động kịch bản demo
npm run test:modules   # CCDC + kiểm kê (Chromium)
npm run test:workflow  # quy trình báo hỏng 5 bước (Chromium)
bash scripts/gen-secrets.sh · bootstrap-admin.sh · smoke-test.sh · set-webhook.sh   # xem CAU_HINH_CHI_TIET.md
npm run dev            # chạy cục bộ với .env.local
```

Giao diện `public/app.html` là file **sinh ra** từ bản offline gốc (`client/source/offline-original.html`) cộng lớp đồng bộ `client/sync-engine.js` bằng `npm run build:app`. Muốn đổi giao diện: sửa trong `client/build-app.py` (các điểm thay thế) hoặc sửa thẳng `public/app.html`, đồng thời giữ `sync-engine.js` khớp.

Thêm Zalo sau này: viết `lib/channels/zalo.ts` + `app/api/webhook/zalo/route.ts`, gọi lại `handleText` / `handleCallback` trong `lib/core.ts`.
