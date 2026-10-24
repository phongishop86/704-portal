# Kịch bản demo: 704-assets + chatbot IT (≈ 12 phút)

**Thông điệp chính:** IT chỉ cần *nhắn một câu* cho bot sau khi sửa xong; hệ thống tự ghi nhật ký, đóng phiếu báo hỏng, cập nhật hồ sơ tài sản. Lãnh đạo và TCTH thấy ngay trên web, không ai phải nhập hai lần.

---

## 0. Chuẩn bị (làm trước 10 phút)

### Cách A: chạy ngay trên máy bạn (khuyên dùng để trình diễn, không cần tài khoản nào)

```bash
npm install
npm run demo
```

Mở **hai cửa sổ trình duyệt cạnh nhau**:

| Cửa sổ | Địa chỉ | Vai trò |
|---|---|---|
| Trái | `http://localhost:3000` | Web 704-assets |
| Phải | `http://localhost:3000/demo/chat` | Giả lập Telegram của IT |

Dữ liệu nằm trong bộ nhớ: tắt `npm run demo` là mất, bật lại là có dữ liệu mẫu mới tinh (phiếu "quá hạn" luôn đúng thời điểm). Giữa hai buổi demo có thể bấm **↺ Đặt lại dữ liệu demo** ở trang giả lập.

> **Nói rõ khi trình diễn:** ở chế độ này bot hiểu câu bằng bộ quy tắc đơn giản (nên gõ theo câu mẫu, có sẵn nút chọn). Mã bot, kiểm quyền, nút ✅, ghi dữ liệu, đóng phiếu là mã thật. Bản triển khai thật dùng Claude nên hiểu câu tự do hơn.

### Cách B: demo trên bản đã triển khai (Telegram thật)

1. Dùng một Firebase/Vercel **riêng cho thử nghiệm**, không phải hệ thống đang chạy thật.
2. `npm run demo:data` (tạo lại dữ liệu theo giờ hiện tại), rồi:
   `node scripts/import-backup.mjs https://<ten-app>.vercel.app <ADMIN_KEY> demo/demo-backup.json`
3. Đăng nhập `demo.admin` → Cài đặt → Người dùng → **Sửa** `demo.it1` → điền **Telegram ID thật** của người sẽ đóng vai IT (nhắn bot một tin bất kỳ để biết số này).
4. Sau buổi demo: **xoá toàn bộ tài khoản `demo.*`** (mật khẩu chung `Demo@2026`, quyền admin).

> ⚠️ **Không bao giờ nạp `demo-backup.json` vào hệ thống đang dùng dữ liệu thật.** Nó thêm tài khoản demo có quyền admin với mật khẩu ai cũng biết.

### Tài khoản demo (mật khẩu chung: `Demo@2026`)

| Tên đăng nhập | Vai trò | Dùng ở cảnh |
|---|---|---|
| `demo.admin` | Admin | 1, 3, 8, 10 |
| `demo.tcth` | TCTH | 5, 11 |
| `demo.it1` | Điện toán (IT) | 7 |
| `demo.it2` | Điện toán (IT) | 4 |
| `demo.lanhdao` | Lãnh đạo phòng KHDN | 8 |
| `demo.lanhdao.bl` | Lãnh đạo phòng Bán lẻ | 8 |
| `demo.nhanvien` | Nhân viên | 7 |

### Dữ liệu mẫu có sẵn

| Tài sản | Tình trạng | Dùng để minh hoạ |
|---|---|---|
| **FA0001** · máy tính **PC-0042** (KHDN) | Hỏng, phiếu đang chờ IT 1, đã sửa 2 lần trước đây | IT báo xong → bot đóng phiếu; cảnh báo "hay hỏng" |
| **FA0002** · máy in HP (KHDN) | Hỏng, phiếu chờ IT **quá hạn** (30 giờ) | Nhắc việc 08:00 |
| **FA0003** · laptop (Bán lẻ) | Phiếu chờ **TCTH điều phối** | Web giao việc → bot thấy ngay |
| **FA0004** · switch (Hội sở) | Phiếu chờ **lãnh đạo duyệt** | Quy trình duyệt trên web |
| **FA0006** · máy tính **PC-0051** (KHDN) | Đang dùng, có lệnh điều chuyển chờ xác nhận | Ghi nhật ký thường; quy trình điều chuyển |
| **CC0001 … CC0012**, **DC0001** (13 công cụ dụng cụ) | Một số đã giao người, một số dùng chung; DC0001 là mục được phân loại tay | Module Công cụ dụng cụ, kiểm kê |
| FA0005, FA0007 và 29 tài sản khác | Bình thường | Sổ tài sản, tìm kiếm |

---

## 1. Mở đầu: web 704-assets (1 phút)

*Đăng nhập `demo.admin` ở cửa sổ trái.*

- **Tổng quan:** có phiếu báo hỏng đang chờ xử lý.
- **Sổ tài sản** → tìm `PC-0042` → mở **FA0001**: trạng thái *Hỏng - đề nghị sửa chữa*, lịch sử báo hỏng, thẻ **🧰 Nhật ký xử lý của IT** có 2 lần sửa trước (thay RAM, vệ sinh máy).

> *"Trước đây IT sửa xong phải vào phần mềm đóng phiếu, rồi ghi sổ nhật ký riêng. Giờ chỉ một câu nhắn."*

## 2. IT báo xong qua bot (2 phút)

*Cửa sổ phải, chọn **Trần Văn Điện Toán**.*

1. Bấm câu mẫu rồi **Gửi**: `Xong máy FA0001, thay nguồn 45 phút`
2. Bot hiện bản nháp: thiết bị, loại việc, 45 phút, **"Phiếu: GBH-KHDN-… (sẽ đóng phiếu)"**.
3. Bấm **✅ Ghi**. Bot trả lời: *"Đã ghi WL-0001 và đóng phiếu …, tài sản đã về Đang sử dụng"*.

> *Điểm nhấn:* bot không tự ghi, luôn hỏi xác nhận; bot tự tìm đúng phiếu của thiết bị đó.

## 3. Quay lại web: dữ liệu đã tự cập nhật (1 phút)

*Cửa sổ trái, vẫn ở hồ sơ FA0001. Chờ tối đa 20 giây hoặc bấm F5.*

- Trạng thái đã về **Đang sử dụng**.
- Thẻ Nhật ký IT có dòng mới "Thay nguồn - 45 phút" và **cảnh báo đã xử lý 3 lần**, cân nhắc thay thế/thanh lý.
- Lịch sử hồ sơ 360° có dòng "IT khắc phục xong phiếu … (qua chatbot Telegram)".
- Menu **Nhật ký IT**: toàn bộ việc IT đã làm, tìm kiếm được theo mã, người làm, nội dung.

## 4. Các lệnh nhanh (1,5 phút)

*Chọn **Lê Thị Mạng** (IT 2) hoặc ở lại IT 1.*

| Gõ | Bot trả lời |
|---|---|
| `/lichsu FA0001` | 3 lần xử lý + cảnh báo thiết bị hay hỏng |
| `/phieu` | Phiếu đang chờ Điện toán (chỉ còn máy in FA0002) |
| `Thay RAM máy PC-0051, 15 phút` | Bot hiểu **mã nội bộ PC-0051** là tài sản FA0006, tạo nháp (không có phiếu nên không đóng gì) → ✅ Ghi |
| `/homnay` | Việc mình đã ghi hôm nay + tổng số phút |

## 5. Web giao việc, bot thấy ngay (2 phút)

1. Cửa sổ trái: đăng xuất, đăng nhập `demo.tcth` → **Báo hỏng / Sửa chữa** → phiếu **laptop FA0003** (chờ TCTH điều phối).
2. Ô điều phối chọn **Trần Văn Điện Toán** → **Tiếp nhận & Điều phối**. Chờ chữ "✅ Đã lưu" ở góc trái dưới.
3. Cửa sổ phải (IT 1): gõ `/phieu` → phiếu **FA0003** xuất hiện ngay.

> *Điểm nhấn:* một nguồn dữ liệu duy nhất cho cả web và bot, không xuất nhập file.

## 6. Nhắc việc 08:00 (1 phút)

*Cửa sổ phải, chọn **👥 Nhóm IT** → **⏰ Chạy nhắc việc 08:00**.*

- Bot nhắn vào nhóm các phiếu đang chờ Điện toán, đánh dấu **⏰ quá hạn** (phiếu máy in FA0002, điều phối đã 30 giờ).
- Ngoài thực tế, tin này tự gửi mỗi sáng (Vercel Cron); ngưỡng quá hạn chỉnh bằng biến `SLA_HOURS` (mặc định 24 giờ).

## 7. Phân quyền (1 phút)

- Cửa sổ phải, chọn **Võ Minh Nhân Viên**, gõ `Thay RAM máy FA0006, 15 phút` → bot từ chối: chỉ IT/Admin được ghi nhật ký.
- Cửa sổ trái: đăng nhập `demo.nhanvien` → **không có** menu *Nhật ký IT*; đăng nhập `demo.it1` → có menu này.
- Người lạ nhắn bot (Telegram ID chưa gắn với tài khoản): bot từ chối và trả số ID để gửi cho quản trị gắn vào tài khoản.

## 8. Quy trình sẵn có của 704-assets (tuỳ chọn, 2 phút)

- `demo.admin` mở phiếu **switch FA0004** (chờ lãnh đạo duyệt) → phê duyệt → TCTH điều phối → IT xử lý. Cả chuỗi 5 bước có SLA từng bước.
- `demo.lanhdao.bl` (Bán lẻ) mở **Điều chuyển** → lệnh chuyển **PC-0051** từ KHDN sang Bán lẻ → *Xác nhận*.

## 10. Công cụ dụng cụ (CCDC) phân quyền (tuỳ chọn, 3 phút)

1. `demo.admin` → menu **Công cụ dụng cụ**: 13 mục, thẻ tổng hợp (đã cấp phát / chưa giao / hỏng). Bấm **👤 Cấp phát** ở **CC0003** → chọn *Võ Minh Nhân Viên* → ✔. Lịch sử hồ sơ ghi "Cấp phát CCDC". Bấm lại → **↩ Thu hồi**.
2. Chế độ **Tất cả (để phân loại lại)**: tích dòng nhận nhầm và đặt lại là CCDC / Tài sản cố định (hệ thống tự nhận CCDC theo mã bắt đầu bằng `CC`).
3. Đổi người xem để thấy phân quyền: `demo.nhanvien` chỉ thấy 2 CCDC được giao (không có nguyên giá, không có nút cấp phát); `demo.lanhdao` thấy CCDC phòng mình; `demo.it1` xem được tất cả nhưng không cấp phát.
4. Nhân viên bấm **🛠️ Báo hỏng** ngay trên dòng CCDC → quy trình 5 bước như các tài sản khác (nhân viên báo → lãnh đạo phòng duyệt → TCTH điều phối → IT xử lý → **người báo vào xác nhận**).

## 11. Kiểm kê / đối chiếu thật (tuỳ chọn, 3 phút)

1. `demo.tcth` → **Kiểm kê tài sản** → tạo phiên: *Toàn chi nhánh*, đối tượng *Chỉ công cụ dụng cụ* → **▶ Kiểm kê**.
2. Tích **✅** cho CC0001, **❌** cho CC0002 (ghi chú "không thấy ở kho"), **⚠️** cho CC0004 (ghi "sai người dùng"). Thêm 1 dòng **tài sản thừa** (có thực tế, không có trong sổ).
3. `demo.lanhdao` → **Kiểm kê phòng ban**: chỉ thấy phần phòng mình, tích được, **không có nút chốt phiên**.
4. Quay lại `demo.tcth` → **🔒 Chốt phiên** → **🖨️ In biên bản đối chiếu** (mục A chênh lệch, B tài sản thừa, C toàn bộ) hoặc **⬇ CSV kết quả**.

## 9. Kết (30 giây)

- Bảo mật: mật khẩu băm, khoá 15 phút nếu sai 5 lần, bot chỉ nhận người có Telegram ID gắn với tài khoản, **bot không bao giờ đọc hay trả nguyên giá**.
- Lộ trình: ảnh hiện trạng và voice từ hiện trường, báo cáo tuần/tháng tự gửi, thêm Zalo.

---

## Câu hỏi thường gặp khi demo

| Hỏi | Trả lời |
|---|---|
| Dữ liệu nằm ở đâu? | Firebase Firestore (Google Cloud, vùng Singapore) + Vercel. **Cần ý kiến bộ phận An toàn thông tin trước khi dùng dữ liệu thật.** |
| Bot có thấy nguyên giá không? | Không. Dữ liệu bot đọc/trả không gồm nguyên giá và giá trị còn lại. |
| IT gõ sai mã thì sao? | Bot không tạo nháp, hỏi lại. Mã không tồn tại không bao giờ được ghi. |
| Bấm ✅ hai lần? | Chỉ ghi một lần. Nháp hết hạn sau 30 phút. |
| Phiếu chưa tới bước Điện toán mà IT báo xong? | Vẫn ghi nhật ký, nhưng không đóng phiếu; bot báo rõ phiếu đang ở bước nào. |
| Mất mạng? | Web giữ thay đổi và tự gửi lại khi có mạng; không có chế độ làm việc offline lâu dài. |
| Hai người sửa cùng một bản ghi? | Người lưu sau thắng (theo từng bản ghi); bản đang sửa dở không bị ghi đè. |
| Chi phí? | Vercel + Firestore thường nằm trong mức miễn phí/vài nghìn đồng mỗi ngày với quy mô chi nhánh; khoản đáng kể là Claude API, tính theo số tin nhắn. |

## Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Web chưa thấy thay đổi từ bot | Chờ ≤ 20 giây, hoặc bấm thanh "🔄 Có cập nhật mới", hoặc F5. |
| Bot không trả lời câu mẫu | Ở chế độ demo hãy dùng đúng câu mẫu (có mã thiết bị như FA0001, PC-0042). |
| Phiếu FA0001 không còn khi diễn lại | Bấm **↺ Đặt lại dữ liệu demo** ở trang giả lập (hoặc khởi động lại `npm run demo`). |
| Cổng 3000 đang bận | `PORT=3100 npm run demo` |
| Đăng nhập báo khoá 15 phút | Khởi động lại `npm run demo` (cách B: đợi 15 phút hoặc dùng tài khoản khác). |
