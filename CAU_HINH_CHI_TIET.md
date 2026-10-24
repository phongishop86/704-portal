# Hướng dẫn cấu hình chi tiết: 704-assets + chatbot IT Telegram

Tài liệu này đi từng bước từ con số 0 đến khi IT nhắn được bot và web hiển thị dữ liệu. Làm theo đúng thứ tự. Mỗi phần có mục **Kiểm tra** để biết đã làm đúng chưa.

> **Lưu ý quan trọng về độ tin cậy.** Các giao diện web (Firebase, Vercel, Telegram, Anthropic, Google Cloud) và các con số về giới hạn/giá thay đổi theo thời gian. Tên nút và vị trí menu dưới đây là theo hiểu biết tại thời điểm viết; nếu khác, hãy tìm mục có ý nghĩa tương đương. **Các giới hạn và giá (gói miễn phí, tần suất cron, hạn mức đọc Firestore, giá Claude API) cần đối chiếu lại trên trang chính thức** trước khi quyết định.

---

## Mục lục

0. Tổng quan và thời gian dự kiến
1. Thử trước ở chế độ demo (không cần tài khoản nào)
2. Tài khoản cần có
3. Firebase / Firestore
4. Đưa mã lên GitHub
5. Sinh các chuỗi bí mật
6. Telegram bot
7. Claude API
8. Google Sheet (tùy chọn)
9. Vercel: nhập biến môi trường và triển khai
10. Đăng ký webhook Telegram
11. Tạo admin đầu tiên / nạp dữ liệu thật
12. Gắn Telegram ID cho IT, tạo nhóm nhắc việc
13. Kiểm tra toàn bộ (smoke test)
14. Củng cố bảo mật sau khi chạy
15. Sao lưu và khôi phục
16. Cập nhật phiên bản và quay lui
17. Bảng toàn bộ biến môi trường
18. Xử lý sự cố
19. Phụ lục: dữ liệu đi đâu (cho bộ phận An toàn thông tin)

---

## 0. Tổng quan và thời gian dự kiến

```
Trình duyệt ──▶ Vercel (Next.js) ──▶ Firestore ──▶ Google Sheet (bản chiếu, tùy chọn)
Telegram ──▶ Vercel ──▶ Claude API
```

| Giai đoạn | Thời gian |
|---|---|
| Demo cục bộ | 10 phút |
| Firebase + GitHub + Vercel | 45–60 phút |
| Telegram + Claude | 20 phút |
| Nạp dữ liệu, gắn Telegram ID, kiểm tra | 30–45 phút |

Bạn cần một máy có **Node.js 20+**, **git**, **curl**, và (để chạy script) **bash**. Trên Windows dùng Git Bash hoặc WSL.

---

## 1. Thử trước ở chế độ demo

Không cần Firebase, Telegram hay Claude. Mọi thứ chạy trong bộ nhớ máy bạn.

```bash
npm install
npm run demo
```

- Web: http://localhost:3000 (đăng nhập `demo.admin` / `Demo@2026`)
- Giả lập Telegram: http://localhost:3000/demo/chat
- Kịch bản 12 phút: xem `DEMO_SCRIPT.md`.

Ở chế độ này "Claude" là bộ quy tắc đơn giản nên chỉ hiểu các câu mẫu. Phần còn lại (kiểm quyền, nháp, nút ✅, ghi dữ liệu, đóng phiếu) là mã thật.

---

## 2. Tài khoản cần có

| Dịch vụ | Dùng để | Ghi chú |
|---|---|---|
| Google (Gmail hoặc Workspace) | Firebase, Google Sheet | Nên dùng tài khoản **của đơn vị**, không dùng cá nhân, để khi người phụ trách đổi vẫn giữ được quyền |
| GitHub | Chứa mã | Repo **riêng tư (Private)** |
| Vercel | Chạy ứng dụng | Đăng nhập bằng GitHub cho tiện |
| Telegram | Bot | Cần một tài khoản Telegram thật |
| Anthropic Console | Claude API | **Tách biệt** với tài khoản dùng Claude trên web/ứng dụng; cần nạp tiền |

Bật **xác thực hai lớp (2FA)** cho cả bốn dịch vụ đầu ngay từ đầu.

---

## 3. Firebase / Firestore

### 3.1 Tạo project
1. Vào https://console.firebase.google.com → **Create a project** (Thêm dự án).
2. Đặt tên (ví dụ `vtb-704-assets`). Tắt Google Analytics (không cần).
3. Ghi lại **Project ID** (hiện ở Project settings → General). Đây là `FIREBASE_PROJECT_ID`.

### 3.2 Tạo Firestore
1. Menu trái **Build → Firestore Database → Create database**.
2. Phiên bản: chọn **Standard** nếu được hỏi.
3. Vị trí (location): **asia-southeast1 (Singapore)**. **Không đổi được sau khi tạo.** Khớp với vùng `sin1` của Vercel để giảm độ trễ.
4. Chế độ bảo mật: **Production mode**.
5. Mở tab **Rules**, xoá nội dung cũ, dán nội dung file `firestore.rules` của dự án, bấm **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} { allow read, write: if false; }
     }
   }
   ```
   Quy tắc này chặn mọi truy cập từ trình duyệt/ứng dụng. Chỉ máy chủ (dùng khoá service account, vượt qua rules) mới đọc/ghi được. **Đây là lớp bảo vệ quan trọng nhất của dữ liệu**, đừng đổi thành `allow read: if true`.

### 3.3 Lấy khoá service account
1. Biểu tượng bánh răng → **Project settings → Service accounts**.
2. Bấm **Generate new private key** → tải file `.json` về.
3. Mở file, bạn cần 3 giá trị:

| Trong file JSON | Biến môi trường |
|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

4. `private_key` là một chuỗi dài bắt đầu `-----BEGIN PRIVATE KEY-----\n...` và kết thúc `-----END PRIVATE KEY-----\n`. **Giữ nguyên các ký tự `\n`** (hai ký tự gạch chéo + n), copy cả đoạn.
5. **Cất file JSON ở nơi an toàn rồi xoá khỏi thư mục Tải xuống.** Ai có file này đọc/ghi được toàn bộ dữ liệu. Không gửi qua chat/email, không đưa vào repo (`.gitignore` đã chặn `*adminsdk*.json`).

### 3.4 Gói Spark hay Blaze?
- **Spark** (miễn phí) có hạn mức đọc/ghi mỗi ngày (khi viết là 50.000 lượt đọc/ngày; **hãy kiểm tra lại**). Khi vượt hạn mức, ứng dụng ngừng hoạt động đến ngày hôm sau.
- **Blaze** (trả theo mức dùng) không bị chặn cứng, nhưng cần gắn thẻ thanh toán.

Ước lượng lượt đọc của ứng dụng:
- Mỗi tab đang mở: khoảng 3 lượt đọc/phút (đọc `meta/rev` mỗi 20 giây). 10 người mở 8 giờ ≈ 14.000 lượt/ngày.
- Mỗi lần đăng nhập lần đầu trên một máy (hoặc sau khi đăng xuất): đọc **toàn bộ** tài liệu. Ví dụ 5.000 tài sản + lịch sử vài chục nghìn dòng ⇒ vài chục nghìn lượt đọc cho mỗi lần.
- Từ lần sau: chỉ đọc phần thay đổi (bộ đệm trong trình duyệt).

Khuyến nghị: dùng **Blaze** kèm **cảnh báo ngân sách** để tránh bị chặn giữa giờ làm việc. Trong Google Cloud Console → **Billing → Budgets & alerts** → tạo ngân sách (ví dụ 5 USD/tháng) và bật email cảnh báo ở 50%/90%/100%. Lưu ý cảnh báo ngân sách **không tự cắt** dịch vụ.

### Kiểm tra
Firestore Database hiện giao diện dữ liệu (còn trống), tab Rules đã Publish.

---

## 4. Đưa mã lên GitHub

1. Tạo repo mới: https://github.com/new → đặt tên `704-assets`, chọn **Private**, **không** tích "Add README".
2. Giải nén `704-assets.zip`, mở terminal trong thư mục đó:
   ```bash
   git init
   git add .
   git status        # KIỂM TRA: không có .env*, file *adminsdk*.json, *.pem, file backup
   git commit -m "704-assets"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan>/704-assets.git
   git push -u origin main
   ```
3. Bước `git status` rất quan trọng: nếu thấy bất kỳ file bí mật nào, **dừng lại**, đừng commit. Nếu lỡ push khoá bí mật lên GitHub, coi như đã lộ: phải thu hồi/tạo khoá mới (xem mục 18).

---

## 5. Sinh các chuỗi bí mật

```bash
bash scripts/gen-secrets.sh
```

Script tạo file `.env.local` (từ `.env.example`) và tự điền 4 chuỗi ngẫu nhiên: `SESSION_SECRET`, `TG_SECRET`, `ADMIN_KEY`, `CRON_SECRET`. Không ghi đè giá trị đã có. Mở `.env.local` và điền dần các biến còn lại ở các mục sau. File này chỉ dùng làm "sổ nháp" để copy sang Vercel; **không commit**.

Ý nghĩa 4 chuỗi:

| Biến | Vai trò | Đổi giá trị thì |
|---|---|---|
| `SESSION_SECRET` | Ký cookie đăng nhập | Mọi người bị đăng xuất |
| `TG_SECRET` | Telegram gửi kèm mỗi webhook để chứng minh là Telegram | Phải chạy lại `set-webhook.sh` |
| `ADMIN_KEY` | Chìa cho các API quản trị (nạp dữ liệu, tạo admin) | Dùng giá trị mới ở lệnh sau |
| `CRON_SECRET` | Vercel Cron gửi kèm khi gọi nhắc việc | Tự áp dụng sau khi redeploy |

Chuỗi `TG_SECRET` chỉ nên gồm chữ, số, `_` và `-` (script sinh hex nên hợp lệ).

---

## 6. Telegram bot

### 6.1 Tạo bot
1. Trong Telegram tìm **@BotFather** (có dấu tích xanh) → gõ `/newbot`.
2. Đặt tên hiển thị (ví dụ `Trợ lý IT 704`), rồi username kết thúc bằng `bot` (ví dụ `vtb704_it_bot`).
3. BotFather trả về **token** dạng `123456789:AA...`. Đây là `TELEGRAM_BOT_TOKEN`. Ai có token là điều khiển được bot: không đăng lên đâu cả. Nếu lộ: `/revoke` ở BotFather để lấy token mới.

### 6.2 Đặt menu lệnh (khuyến nghị)
Gõ `/setcommands`, chọn bot, rồi dán:
```
lichsu - Lịch sử xử lý một thiết bị (ví dụ /lichsu FA0001)
phieu - Phiếu đang chờ Điện toán
homnay - Việc mình đã ghi hôm nay
id - Xem Telegram ID của bạn
help - Hướng dẫn
```

### 6.3 Cho phép bot đọc tin trong nhóm (chỉ khi dùng nhóm)
Bot chỉ **gửi** nhắc việc vào nhóm, không cần đọc tin trong nhóm, nên mặc định (privacy mode bật) là đủ. Lệnh `/id` trong nhóm vẫn hoạt động vì là lệnh có `/`.

### Kiểm tra
Mở bot, bấm Start. Lúc này bot chưa trả lời gì vì chưa có webhook (làm ở mục 10).

---

## 7. Claude API

1. Vào https://console.anthropic.com → đăng nhập → **API keys → Create key**. Đây là `ANTHROPIC_API_KEY` (bắt đầu `sk-ant-`), chỉ hiện một lần.
2. **Billing**: nạp trước một khoản nhỏ (ví dụ 10 USD) hoặc bật nạp tự động. Không có số dư thì bot báo lỗi khi IT nhắn.
3. Đặt **hạn mức chi tiêu hàng tháng** (Limits/Spend limit) ở mức bạn chấp nhận.
4. `ANTHROPIC_MODEL`: để `claude-sonnet-5-5` (có sẵn trong `.env.example`). Muốn rẻ hơn có thể thử `claude-haiku-5-5`; muốn hiểu câu khó tốt hơn dùng mẫu lớn hơn. Tên mô hình phải đúng với danh sách trong Console của bạn.
5. Chi phí gần như tỷ lệ với **số tin nhắn IT gửi** (mỗi tin gồm một vài lượt gọi). Quy mô một chi nhánh thường là rất thấp, nhưng hãy theo dõi mục Usage trong tuần đầu.

---

## 8. Google Sheet (tùy chọn)

Bỏ qua mục này nếu không cần bản chiếu nhật ký ra Sheet; chỉ cần để trống `SHEET_ID`.

1. Tạo Google Sheet mới. Đổi tên tab đầu tiên thành đúng `WorkLog` (phân biệt hoa thường).
2. Hàng 1 điền đủ 11 tiêu đề, mỗi ô một tiêu đề, theo thứ tự:
   `id | timestamp | it_user | asset_code | asset_name | department | category | description | duration_min | status | ticket_ref`
3. **Bật Google Sheets API**: https://console.cloud.google.com → chọn đúng project (cùng project Firebase, ID giống nhau) → **APIs & Services → Library** → tìm **Google Sheets API** → **Enable**.
4. **Chia sẻ Sheet** cho service account: nút Share → dán `client_email` (dạng `firebase-adminsdk-xxx@<project>.iam.gserviceaccount.com`) → quyền **Editor** → bỏ tích "Notify".
5. Lấy `SHEET_ID` từ địa chỉ Sheet: `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`.
6. Điền biến:
   - `GOOGLE_CLIENT_EMAIL` = `client_email` (cùng service account Firebase cho đơn giản)
   - `GOOGLE_PRIVATE_KEY` = `private_key` (cùng giá trị với `FIREBASE_PRIVATE_KEY`)
   - `SHEET_ID`

Ghi chú: Sheet chỉ là **bản chiếu một chiều**. Sửa trong Sheet **không** ảnh hưởng dữ liệu hệ thống. Nội dung được ghi dạng văn bản thuần nên không thể chèn công thức. Nếu ghi Sheet lỗi, nhật ký vẫn được lưu trong Firestore (Sheet không làm hỏng luồng chính).

---

## 9. Vercel: nhập biến môi trường và triển khai

### 9.1 Import
1. https://vercel.com → **Add New… → Project** → chọn repo `704-assets` (nếu không thấy, bấm "Adjust GitHub App Permissions" và cấp quyền cho repo).
2. Framework Preset: **Next.js** (tự nhận). Không đổi Build/Output.
3. **Chưa bấm Deploy.** Mở mục **Environment Variables** trước.

### 9.2 Nhập biến
Nhập từng cặp tên/giá trị (bảng đầy đủ ở mục 17). Tick cả **Production** và **Preview** (hoặc ít nhất Production).

Chú ý riêng:
- **`FIREBASE_PRIVATE_KEY` và `GOOGLE_PRIVATE_KEY`: dán nguyên khối, KHÔNG bao quanh bằng dấu ngoặc kép**, giữ các `\n`. (Mã có tự bỏ dấu ngoặc kép bao quanh nếu lỡ dán, nhưng tốt nhất đừng.)
- Không để khoảng trắng thừa ở đầu/cuối giá trị.
- `TG_GROUP_ID` để trống trước, điền sau khi có nhóm (mục 12).

### 9.3 Deploy
Bấm **Deploy**, chờ build xong (vài phút). Ghi lại địa chỉ, dạng `https://<ten-du-an>.vercel.app`.

> **Khi sửa/đổi biến môi trường về sau, phải Redeploy** (Deployments → ⋯ → Redeploy) thì giá trị mới mới có hiệu lực.

### 9.4 Deployment Protection (hay gặp)
Nếu dự án bật **Vercel Authentication / Deployment Protection**, Telegram không gọi được webhook (nhận 401) và người dùng bị yêu cầu đăng nhập Vercel. Vào **Settings → Deployment Protection** và đảm bảo **Production** không bị chặn (hoặc dùng domain riêng), rồi redeploy nếu cần. Ứng dụng đã có đăng nhập riêng nên không cần lớp này.

### 9.5 Cron nhắc việc
`vercel.json` đã khai báo cron `0 1 * * *` gọi `/api/cron/remind`. Vercel dùng giờ **UTC**: 01:00 UTC = **08:00 giờ Việt Nam**. Vercel tự gửi `Authorization: Bearer <CRON_SECRET>` nếu biến `CRON_SECRET` đã đặt. Xem lại trong **Settings → Cron Jobs**. Gói Hobby thường chỉ cho cron chạy tối đa một lần/ngày và giờ chạy có thể lệch trong khung giờ (hãy kiểm tra giới hạn hiện hành).

### 9.6 Xem nhật ký lỗi
**Project → Logs** (hoặc Deployments → chọn bản → Functions/Logs). Lọc theo đường dẫn `/api/webhook/telegram` khi bot không trả lời.

### Kiểm tra
Mở `https://<ten-du-an>.vercel.app`: thấy màn hình đăng nhập (chưa có tài khoản nào, làm ở mục 11).

---

## 10. Đăng ký webhook Telegram

Chạy trên máy bạn (có bash, curl):
```bash
bash scripts/set-webhook.sh <TELEGRAM_BOT_TOKEN> https://<ten-du-an>.vercel.app <TG_SECRET>
```
Kết quả đúng có `"ok":true` ở lần gọi đầu, và ở `getWebhookInfo`:
- `url` = địa chỉ của bạn + `/api/webhook/telegram`
- **không có** `last_error_message`
- `pending_update_count` gần 0.

Nếu `TG_SECRET` trong lệnh khác với giá trị trong Vercel, mọi tin sẽ bị từ chối 403. Cần giống hệt nhau.

Xem lại tình trạng bất kỳ lúc nào:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Kiểm tra
Nhắn `/id` cho bot: bot trả "Telegram ID của bạn: …". Nếu có, webhook, secret, token đều đúng. (Lệnh này cố ý cho **mọi người** dùng được, kể cả chưa được cấp quyền, để lấy ID.)

---

## 11. Tạo admin đầu tiên / nạp dữ liệu thật

Có hai trường hợp. **Chọn một.**

### A. Bắt đầu mới (Firestore trống)
```bash
bash scripts/bootstrap-admin.sh https://<ten-du-an>.vercel.app <ADMIN_KEY> admin '<mat-khau-it-nhat-8-ky-tu>' 'Quản trị hệ thống'
```
Kết quả `HTTP 200`. Đăng nhập web bằng tài khoản này. Cũng dùng đúng lệnh này để **cấp lại quyền admin** khi quên mật khẩu.

### B. Chuyển dữ liệu từ bản offline đang dùng
1. Ở bản offline cũ: Admin → Nhập/Xuất dữ liệu → Sao lưu → **Tải file Backup (.json)**.
2. Nạp (script tự chia nhỏ file để không vượt giới hạn dung lượng của Vercel; chạy lại nhiều lần vẫn an toàn):
   ```bash
   node scripts/import-backup.mjs https://<ten-du-an>.vercel.app <ADMIN_KEY> VietinBank_Assets_FullBackup_YYYYMMDD.json
   ```
3. Cuối cùng script in tổng số bản ghi từng loại. **Đối chiếu với bản offline** (số tài sản, người dùng, phiếu…).
4. Mật khẩu dạng chữ trong backup cũ được băm trước khi lưu. Tài khoản mẫu cũ có mật khẩu `123456`: **đổi hết ngay**. Tài khoản nào chưa có mật khẩu sẽ không đăng nhập được cho đến khi admin đặt lại, hoặc dùng `bootstrap-admin.sh` để tạo admin mới.
5. Sau khi chuyển xong, **ngừng dùng bản offline** (dữ liệu trong trình duyệt cũ không đồng bộ).

> ⚠️ **Tuyệt đối không nạp `demo/demo-backup.json` vào hệ thống thật.** File đó có tài khoản admin với mật khẩu công khai.

---

## 12. Gắn Telegram ID cho IT, tạo nhóm nhắc việc

### 12.1 Cho từng nhân viên IT
1. Người đó nhắn `/id` cho bot, được số ID (ví dụ `123456789`).
2. Admin đăng nhập web → **Cài đặt → Người dùng → Sửa** tài khoản đó → điền **Telegram ID** → Lưu. Đợi chữ "✅ Đã lưu" ở góc trái dưới.
3. Tài khoản phải có vai trò **Điện toán (IT)** hoặc **Admin** thì mới ghi được nhật ký.
4. Người đó nhắn thử: `Thay RAM máy FA0001, 30 phút` → bot hiện bản nháp → bấm ✅ Ghi.

Người chưa gắn ID nhắn bot sẽ bị từ chối kèm số ID để gửi cho admin. Mỗi Telegram ID chỉ nên gắn cho một tài khoản.

### 12.2 Nhóm Telegram nhận nhắc việc 08:00
1. Tạo nhóm Telegram cho team IT, **thêm bot vào nhóm**.
2. Trong nhóm gõ `/id` (hoặc `/id@ten_bot`). Bot trả "ID cuộc trò chuyện này: -100…" (số âm).
3. Vercel → Settings → Environment Variables → thêm `TG_GROUP_ID` = số đó (kèm dấu `-`) → **Redeploy**.
4. Thử ngay không cần đợi 08:00 (xem lệnh ở mục 13).

Nếu nhóm được nâng cấp thành "supergroup" thì ID đổi: làm lại `/id`.

---

## 13. Kiểm tra toàn bộ (smoke test)

```bash
bash scripts/smoke-test.sh https://<ten-du-an>.vercel.app admin '<mat-khau>'
```
Script kiểm tra các cửa bảo mật đều **đóng** khi không có khoá (webhook, cron, nạp dữ liệu, tạo admin, đọc/ghi khi chưa đăng nhập đều bị từ chối), rồi đăng nhập và đọc dữ liệu. Mọi dòng phải là `ok`; có dòng `LỖI` thì script thoát với mã khác 0.

Thử tay thêm:

| Việc | Kết quả đúng |
|---|---|
| IT nhắn `/lichsu FA0001` | Lịch sử xử lý thiết bị |
| IT nhắn `/phieu` | Danh sách phiếu chờ Điện toán |
| IT nhắn một việc đã làm, bấm ✅ | Web hiện dòng mới ở menu **Nhật ký IT** trong ≤ 20 giây; Sheet có thêm 1 dòng (nếu bật) |
| Chạy nhắc việc thủ công | Nhóm nhận tin |
| Người không phải IT nhắn bot ghi nhật ký | Bị từ chối |

Chạy nhắc việc thủ công (cần `CRON_SECRET`):
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<ten-du-an>.vercel.app/api/cron/remind
```
Kết quả `{"ok":true,...}`. Nếu `{"ok":true,"skipped":"no TG_GROUP_ID"}` nghĩa là chưa điền `TG_GROUP_ID` hoặc chưa redeploy.

---

## 14. Củng cố bảo mật sau khi chạy

Làm theo danh sách này trước khi cho người dùng thật vào:

- [ ] Đổi mật khẩu **mọi** tài khoản còn mật khẩu mặc định `123456`.
- [ ] Xoá toàn bộ tài khoản `demo.*` nếu từng nạp dữ liệu demo.
- [ ] Có **ít nhất hai** tài khoản admin (tránh khoá mình ngoài hệ thống).
- [ ] `ADMIN_KEY`: sau khi nạp xong, **xoá biến này khỏi Vercel** (hoặc đổi giá trị) và redeploy. Khi cần dùng lại thì đặt lại. Khi biến trống, các API quản trị từ chối mọi yêu cầu.
- [ ] Kiểm tra repo GitHub là **Private**, không có file bí mật trong lịch sử commit.
- [ ] 2FA trên Google, GitHub, Vercel, Telegram (cài mật khẩu hai bước), Anthropic.
- [ ] Hạn chế người có quyền vào Vercel project và Firebase project.
- [ ] Đặt cảnh báo ngân sách Google Cloud và hạn mức chi tiêu Anthropic (mục 3.4, 7).
- [ ] Xin ý kiến **bộ phận An toàn thông tin** về việc dữ liệu nằm trên Google Cloud/Vercel, tin nhắn đi qua Telegram, văn bản đi tới API Claude (mục 19).
- [ ] Ghi lại ai giữ khoá service account, token bot, `ADMIN_KEY`; có quy trình xoay vòng khi nhân sự thay đổi.

---

## 15. Sao lưu và khôi phục

### 15.1 Sao lưu trong ứng dụng
Admin → Nhập/Xuất dữ liệu → **Tải file Backup (.json)**. Nên làm hằng tuần và trước mỗi lần nâng cấp. File này **không chứa mật khẩu**, nhưng chứa **toàn bộ dữ liệu tài sản kể cả nguyên giá**, nên cất như tài liệu mật.

### 15.2 Sao lưu ở mức Firestore
Trong Google Cloud Console có các tính năng như xuất dữ liệu theo lịch (export) và khôi phục theo thời điểm (point-in-time recovery). Chúng thường **cần gói tính phí** và có chi phí; hãy xem tài liệu Firestore hiện hành và quyết định theo mức quan trọng của dữ liệu.

### 15.3 Khôi phục
- **Nạp lại từ file backup:** `node scripts/import-backup.mjs <URL> <ADMIN_KEY> <file>` (đặt lại `ADMIN_KEY` trên Vercel và redeploy trước). Nạp ghi đè theo `id`, **không xoá** bản ghi nào.
- Lưu ý: mật khẩu không nằm trong backup. Sau khi khôi phục sang Firestore trống, dùng `bootstrap-admin.sh` để tạo admin, rồi đặt lại mật khẩu cho những người khác.
- **Diễn tập khôi phục** ít nhất một lần trên project thử nghiệm trước khi cần dùng thật.

### 15.4 Xoá nhầm
Xoá trên web chỉ đánh dấu "mồ" (`_del`), dữ liệu vẫn còn trong Firestore; nhờ người có quyền Firebase gỡ cờ đó nếu cần phục hồi.

---

## 16. Cập nhật phiên bản và quay lui

- Sửa mã → `git commit` → `git push`: Vercel tự build và triển khai.
- Quay lui: Vercel → Deployments → chọn bản cũ chạy tốt → ⋯ → **Promote to Production** (hoặc Instant Rollback).
- Đổi biến môi trường: sửa rồi **Redeploy**.
- Trước khi nâng cấp: tải backup (15.1) và chạy `npm test` trên máy.
- Bản có module CCDC + kiểm kê thêm một bảng mới `inventoryLines`: Firestore tự tạo khi có dữ liệu đầu tiên, **không cần cấu hình thêm**. Sau khi nâng cấp, mở menu *Công cụ dụng cụ* bằng tài khoản Admin và kiểm tra danh sách có đúng không: hệ thống tự nhận CCDC theo mã bắt đầu bằng `CC` hoặc theo file CC0203 nhập sau này; nếu mã CCDC thật của đơn vị khác quy ước này, dùng chế độ *Tất cả (để phân loại lại)* để gán hàng loạt.

---

## 17. Bảng toàn bộ biến môi trường

| Biến | Bắt buộc | Lấy ở đâu / giá trị | Ghi chú |
|---|---|---|---|
| `SESSION_SECRET` | Có | `gen-secrets.sh` | ≥ 32 ký tự; đổi = đăng xuất tất cả |
| `TELEGRAM_BOT_TOKEN` | Có (nếu dùng bot) | BotFather | Giữ bí mật |
| `TG_SECRET` | Có (nếu dùng bot) | `gen-secrets.sh` | Phải khớp lệnh `set-webhook.sh` |
| `TG_GROUP_ID` | Không | `/id` trong nhóm | Số âm; trống = không nhắc nhóm |
| `ANTHROPIC_API_KEY` | Có (nếu dùng bot) | Anthropic Console | Cần số dư |
| `ANTHROPIC_MODEL` | Không | `claude-sonnet-5-5` | Đúng tên mô hình |
| `FIREBASE_PROJECT_ID` | Có | JSON `project_id` | |
| `FIREBASE_CLIENT_EMAIL` | Có | JSON `client_email` | |
| `FIREBASE_PRIVATE_KEY` | Có | JSON `private_key` | Giữ `\n`, không ngoặc kép |
| `GOOGLE_CLIENT_EMAIL` | Không | Như trên (hoặc tài khoản riêng) | Chỉ để chiếu ra Sheet |
| `GOOGLE_PRIVATE_KEY` | Không | Như trên | |
| `SHEET_ID` | Không | Địa chỉ Sheet | Thiếu 1 trong 3 biến Google = bỏ qua Sheet |
| `ADMIN_KEY` | Khi cần | `gen-secrets.sh` | Chỉ để nạp dữ liệu/tạo admin; nên xoá sau khi xong |
| `CRON_SECRET` | Có | `gen-secrets.sh` | Thiếu = cron luôn bị từ chối |
| `SLA_HOURS` | Không | `24` | Giờ quá hạn, tính từ lúc TCTH điều phối |

---

## 18. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Bot im lặng hoàn toàn | Chưa đăng ký webhook, hoặc Vercel Deployment Protection chặn | `getWebhookInfo` xem `last_error_message`; làm mục 9.4 và 10 |
| `getWebhookInfo` báo 401 | Deployment Protection | Tắt bảo vệ cho Production |
| Webhook báo 403 | `TG_SECRET` Vercel ≠ giá trị lúc `setWebhook` | Cho khớp, redeploy, chạy lại `set-webhook.sh` |
| Webhook báo 500 | Thiếu biến môi trường hoặc khoá sai | Xem Logs trên Vercel |
| Bot: "chưa được cấp quyền" | Chưa gắn Telegram ID, hoặc tài khoản không phải IT/Admin, hoặc bị khoá | Mục 12.1 |
| `/id` trả lời nhưng nhắn việc thì lỗi | Thiếu/ sai `ANTHROPIC_API_KEY`, hết tiền | Kiểm tra Console → Billing/Usage |
| Đăng nhập báo 429 | Sai mật khẩu 5 lần, khoá 15 phút | Đợi 15 phút, hoặc admin khác đặt lại mật khẩu |
| Quên mật khẩu admin duy nhất | | `bootstrap-admin.sh` với `ADMIN_KEY` |
| Lỗi `error:1E08010C:DECODER` / `DECODER routines` / "Invalid PEM" | `FIREBASE_PRIVATE_KEY` bị mất `\n`, dán thiếu, hoặc có ký tự thừa | Dán lại nguyên khối từ file JSON |
| Firestore `NOT_FOUND` | Chưa tạo Firestore database, hoặc sai `FIREBASE_PROJECT_ID` | Mục 3.2 |
| Firestore `PERMISSION_DENIED` | Service account thuộc project khác | Tạo khoá mới đúng project |
| Firestore `RESOURCE_EXHAUSTED` / quota | Hết hạn mức gói Spark trong ngày | Chuyển Blaze, hoặc đợi sang ngày |
| Sheet không có dòng mới | Chưa Enable Sheets API, chưa share cho service account, tên tab khác `WorkLog` | Mục 8; xem Logs |
| Nhắc 08:00 không đến | Thiếu `TG_GROUP_ID`, bot không còn trong nhóm, hoặc sai `CRON_SECRET`, hoặc cron chưa chạy | Gọi tay lệnh mục 13; xem Settings → Cron Jobs và Logs |
| Web không thấy thay đổi từ bot | Độ trễ đồng bộ | Chờ ≤ 20 giây, hoặc bấm "🔄 Có cập nhật mới", hoặc F5 |
| Nạp backup báo 413 | Lô lớn quá giới hạn | Dùng `import-backup.mjs` với `--chunk-kb 1500` |
| Đổi biến nhưng không có tác dụng | Chưa redeploy | Redeploy |
| Lỡ đưa khoá lên GitHub | | Coi như lộ: Firebase → tạo khoá mới + xoá khoá cũ; BotFather `/revoke`; Anthropic xoá key và tạo lại; đổi `SESSION_SECRET`; cập nhật Vercel, redeploy |

---

## 19. Phụ lục: dữ liệu đi đâu (để trình bộ phận An toàn thông tin)

| Dịch vụ | Dữ liệu nó thấy | Ghi chú |
|---|---|---|
| **Firestore (Google Cloud, Singapore)** | **Toàn bộ** dữ liệu hệ thống, kể cả nguyên giá, giá trị còn lại, người dùng (mật khẩu đã băm scrypt) | Rules chặn mọi truy cập client; chỉ máy chủ có khoá |
| **Vercel** | Mọi yêu cầu API đi qua; biến môi trường (khoá bí mật) | Vùng chạy `sin1`; giữ quyền truy cập project ở mức tối thiểu |
| **Telegram** | Nội dung tin IT nhắn và bot trả lời: mã/tên tài sản, phòng ban, trạng thái, nội dung việc | **Không có nguyên giá/giá trị còn lại** |
| **Anthropic (Claude API)** | Nội dung tin IT nhắn, kết quả tra cứu tài sản (mã, tên, phòng ban, trạng thái, lịch sử xử lý) | **Không có nguyên giá/giá trị còn lại**; xem chính sách lưu trữ/ sử dụng dữ liệu API của Anthropic hiện hành |
| **Google Sheet** (tùy chọn) | Các dòng nhật ký IT (11 cột) | Chỉ người được chia sẻ Sheet xem được |
| **Trình duyệt người dùng** | Mọi tài khoản đăng nhập tải được toàn bộ dữ liệu về trình duyệt (giống bản offline cũ); ẩn/hiện theo vai trò là ở giao diện | Nếu cần chặn cứng theo phòng ban phải bổ sung lọc phía máy chủ |

Biện pháp có sẵn: mật khẩu băm scrypt; cookie phiên HttpOnly ký HMAC 12 giờ; khoá 15 phút sau 5 lần sai; so sánh khoá bí mật theo thời gian hằng; phân quyền ghi ở máy chủ theo vai trò; bot chỉ nhận người có Telegram ID gắn với tài khoản; nháp phải xác nhận bằng nút và hết hạn sau 30 phút; ghi Sheet dạng văn bản thuần.

---

## Những điều chưa được kiểm chứng (nói rõ để không hiểu nhầm)

- Dự án **chưa được triển khai thực tế** trên Vercel/Firebase/Telegram/Claude thật. Các bước ở tài liệu này dựa trên mã đã viết và thử bằng giả lập, chưa chạy với dịch vụ thật.
- Chưa chạy `npm install` hay `next build` trong môi trường phát triển (không có mạng tới kho gói). Lần build đầu trên Vercel có thể lộ lỗi nhỏ về phụ thuộc hoặc kiểu; nếu có, gửi nguyên văn lỗi trong Logs để sửa.
- Kiểm thử đã chạy: logic đồng bộ phía giao diện, logic máy chủ trên Firestore giả, giao diện trong Chromium, và kịch bản demo. Claude trong các bài thử là bộ quy tắc giả; chất lượng hiểu câu thật cần thử với Claude thật.
- Mọi giới hạn/giá của Vercel, Firebase, Anthropic, Telegram nêu ở trên cần đối chiếu lại với trang chính thức.
