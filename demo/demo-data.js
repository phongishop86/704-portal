// Sinh dữ liệu DEMO cho 704-assets: file backup đúng định dạng của phần mềm (nạp được bằng /api/admin/import-backup).
// Mọi mốc thời gian tính theo thời điểm chạy, nên phiếu "quá hạn", "mới báo hỏng"… luôn đúng khi trình diễn.
// Toàn bộ tên, số liệu là DỮ LIỆU GIẢ để minh hoạ, không phải dữ liệu thật của đơn vị.
//
//   node demo/demo-data.js > demo/demo-backup.json
const ref = require("./reference-data.json");

const DEMO_PASSWORD = "Demo@2026";
const H = 3600 * 1000, D = 24 * H;

function buildBackup(now = Date.now(), opts = {}) {
  const iso = (ms) => new Date(ms).toISOString();
  const ymd = (ms) => iso(ms).slice(0, 10).replace(/-/g, "");
  const date = (ms) => iso(ms).slice(0, 10);
  const tg = opts.telegramIds || {};

  const users = [
    ["u_admin", "demo.admin", "Quản trị hệ thống (demo)", "admin", null, "NV001"],
    ["u_tcth", "demo.tcth", "Nguyễn Văn Tổng Hợp", "tcth", "dept_4", "NV002"],
    ["u_it1", "demo.it1", "Trần Văn Điện Toán", "it", "dept_16", "NV003"],
    ["u_it2", "demo.it2", "Lê Thị Mạng", "it", "dept_16", "NV004"],
    ["u_mgr", "demo.lanhdao", "Phạm Thị Trưởng Phòng KHDN", "manager", "dept_7", "NV005"],
    ["u_mgr2", "demo.lanhdao.bl", "Hoàng Văn Bán Lẻ", "manager", "dept_9", "NV006"],
    ["u_nv", "demo.nhanvien", "Võ Minh Nhân Viên", "user", "dept_7", "NV007"],
  ].map(([id, username, full_name, role, department_id, employee_code]) => ({
    id, username, password: DEMO_PASSWORD, employee_code, full_name, role, department_id, is_active: true,
    telegram_id: tg[id] || "",
  }));

  const deptName = (id) => ref.departments.find((d) => d.id === id).name;
  const catName = (id) => ref.categories.find((c) => c.id === id).name;

  /* ---------- Tài sản ---------- */
  const assets = [];
  const mk = (code, name, category_id, department_id, original_value, ratio, status, current_user_id, yearsAgo) => {
    const created = now - 40 * D;
    assets.push({
      id: "a_" + code.toLowerCase(), code, name, category_id, original_value,
      remaining_value: Math.round(original_value * ratio), recorded_date: date(now - yearsAgo * 365 * D),
      status, status_changed_at: iso(created), department_id,
      address: "CN Bến Lức · " + deptName(department_id), current_user_id: current_user_id || null,
      created_at: iso(created), updated_at: iso(created),
    });
  };

  // 7 tài sản "chủ chốt" cho kịch bản
  mk("FA0001", "Máy vi tính để bàn Dell OptiPlex 3080 (PC-0042)", "cat_0", "dept_7", 18500000, 0.4, "broken", "u_nv", 3);
  mk("FA0002", "Máy in HP LaserJet Pro M404dn (phòng KHDN)", "cat_8", "dept_7", 9800000, 0.3, "broken", null, 4);
  mk("FA0003", "Máy vi tính xách tay Dell Latitude 5420 (LT-0017)", "cat_1", "dept_9", 24500000, 0.55, "broken", null, 2);
  mk("FA0004", "Switch Cisco Catalyst 2960 24 cổng (Hội sở tầng 2)", "cat_3", "dept_16", 32000000, 0.35, "broken", null, 5);
  mk("FA0005", "Máy quét Canon DR-C225 (phòng DVKH)", "cat_10", "dept_1", 12800000, 0.45, "in_use", null, 3);
  mk("FA0006", "Máy vi tính để bàn HP ProDesk 400 (PC-0051)", "cat_0", "dept_7", 16900000, 0.5, "in_use", null, 2);
  mk("FA0007", "Máy điều hoà Daikin 2HP (phòng họp tầng 2)", "cat_14", "dept_16", 21000000, 0.25, "in_use", null, 6);

  // Tài sản nền: để sổ tài sản có số lượng đủ lớn khi lọc/tìm kiếm
  const types = [
    ["cat_0", "Máy vi tính để bàn Dell OptiPlex 3080", 18500000, "PC"],
    ["cat_1", "Máy vi tính xách tay Dell Latitude 5420", 24500000, "LT"],
    ["cat_8", "Máy in HP LaserJet Pro M404dn", 9800000, null],
    ["cat_3", "Switch Cisco Catalyst 2960 24 cổng", 32000000, null],
    ["cat_14", "Máy điều hoà Daikin 2HP", 21000000, null],
    ["cat_10", "Máy quét Canon DR-C225", 12800000, null],
  ];
  const depts = ["dept_7", "dept_9", "dept_1", "dept_4", "dept_6", "dept_12", "dept_16", "dept_5"];
  const short = { dept_7: "KHDN", dept_9: "Bán lẻ", dept_1: "DVKH", dept_4: "TCTH", dept_6: "HTTD", dept_12: "BGĐ", dept_16: "Hội sở", dept_5: "PGD Phước Lợi" };
  let pc = 60;
  for (let i = 0; i < 29; i++) {
    const [cat, nm, val, pre] = types[i % types.length];
    const dept = depts[(i * 3 + 1) % depts.length];
    const tag = pre ? `${pre}-${String(pc++).padStart(4, "0")}` : short[dept];
    mk("FA" + String(8 + i).padStart(4, "0"), `${nm} (${tag})`, cat, dept, val, 0.2 + ((i * 7) % 6) / 10, "in_use", null, 1 + (i % 6));
  }
  // Công cụ dụng cụ (CCDC): hệ thống tự nhận theo mã bắt đầu bằng "CC"
  const ccTypes = [
    ["cat_35", "Ghế xoay văn phòng Hoà Phát"], ["cat_34", "Bàn làm việc 1m4"], ["cat_40", "Bộ dụng cụ đồ nghề IT (tua vít, kìm bấm cáp)"],
    ["cat_41", "Tranh trang trí quầy giao dịch"], ["cat_42", "Quạt đứng Senko"], ["cat_35", "Ghế quầy giao dịch"],
  ];
  const ccHolders = ["u_nv", "u_mgr", null, null, "u_mgr2", null, "u_nv", null, "u_it1", null, null, "u_mgr"];
  for (let i = 0; i < 12; i++) {
    const [cat, nm] = ccTypes[i % ccTypes.length];
    const dept = ["dept_7", "dept_9", "dept_16", "dept_1"][i % 4];
    mk("CC" + String(i + 1).padStart(4, "0"), `${nm} (${short[dept]})`, cat, dept, 1200000 + i * 350000, 0.3 + (i % 5) / 10, "in_use", ccHolders[i], 1 + (i % 4));
  }
  // Một mục không có mã "CC" nhưng đã được TCTH phân loại là CCDC (kind="ccdc")
  mk("DC0001", "Máy khoan pin Bosch (tổ kỹ thuật)", "cat_40", "dept_16", 2600000, 0.5, "in_use", "u_it1", 1);
  assets[assets.length - 1].kind = "ccdc";
  const A = (code) => assets.find((a) => a.code === code);

  /* ---------- Phiếu báo hỏng (đủ các bước của quy trình) ---------- */
  const rp = (o) => Object.assign({
    manager_id: null, manager_at: null, priority: null, manager_note: null, tcth_id: null, tcth_at: null, it_id: null, it_at: null,
    resolution_note: null, rejected_by: null, rejected_at: null, reject_reason: null, user_confirmed_at: null,
  }, o);
  const repairs = [
    // R1: đang chờ Điện toán, đã giao cho it1 -> kịch bản "IT báo xong, bot đóng phiếu"
    rp({ id: "r_1", ticket_code: `GBH-KHDN-${ymd(now - 26 * H)}`, asset_id: A("FA0001").id, description: "Máy không lên nguồn, bấm nút nguồn không có đèn",
      status: "pending_it", reported_by: "u_nv", created_at: iso(now - 26 * H), manager_id: "u_mgr", manager_at: iso(now - 25 * H),
      priority: "Cao (Xử lý gấp)", manager_note: "Cần xử lý trong ngày, đang vào đợt chốt hồ sơ tín dụng", tcth_id: "u_tcth", tcth_at: iso(now - 5 * H), it_id: "u_it1" }),
    // R2: chờ Điện toán QUÁ HẠN (điều phối cách đây 30 giờ), chưa giao ai -> hiện ở /phieu và nhắc việc 08:00
    rp({ id: "r_2", ticket_code: `GBH-KHDN-${ymd(now - 52 * H)}`, asset_id: A("FA0002").id, description: "Kẹt giấy liên tục, bản in bị nhăn",
      status: "pending_it", reported_by: "u_nv", created_at: iso(now - 52 * H), manager_id: "u_mgr", manager_at: iso(now - 50 * H),
      priority: "Bình thường", manager_note: "", tcth_id: "u_tcth", tcth_at: iso(now - 30 * H) }),
    // R3: chờ TCTH điều phối -> kịch bản demo trên web (TCTH giao cho IT)
    rp({ id: "r_3", ticket_code: `GBH-BANLE-${ymd(now - 6 * H)}`, asset_id: A("FA0003").id, description: "Laptop cắm sạc không vào pin, máy tắt khi rút điện",
      status: "pending_tcth", reported_by: "u_mgr2", created_at: iso(now - 6 * H), manager_id: "u_mgr2", manager_at: iso(now - 5.5 * H),
      priority: "Bình thường", manager_note: "" }),
    // R4: vừa báo, chờ lãnh đạo phòng duyệt
    rp({ id: "r_4", ticket_code: `GBH-HOISO-${ymd(now - 2 * H)}`, asset_id: A("FA0004").id, description: "Switch tầng 2 mất đèn các cổng 12-24, máy trạm mất mạng",
      status: "pending_manager", reported_by: "u_tcth", created_at: iso(now - 2 * H) }),
    // R5: đã hoàn thành trước đây
    rp({ id: "r_5", ticket_code: `GBH-DVKH-${ymd(now - 20 * D)}`, asset_id: A("FA0005").id, description: "Máy quét không nhận dữ liệu khi quét nhiều trang",
      status: "completed", reported_by: "u_nv", created_at: iso(now - 20 * D), manager_id: "u_mgr", manager_at: iso(now - 20 * D + 2 * H),
      priority: "Bình thường", tcth_id: "u_tcth", tcth_at: iso(now - 20 * D + 4 * H), it_id: "u_it1", it_at: iso(now - 19 * D),
      resolution_note: "Cài lại driver máy quét, thay cáp USB", user_confirmed_at: iso(now - 19 * D + 3 * H) }),
  ];

  /* ---------- Điều chuyển ---------- */
  const transfers = [{
    id: "t_1", ticket_code: `PĐC-KHDN-${ymd(now - 4 * H)}`, asset_id: A("FA0006").id, from_department_id: "dept_7", to_department_id: "dept_9",
    reason: "Điều chuyển cho nhân sự mới phòng Bán lẻ", status: "pending_confirm", requested_by: "u_mgr", created_at: iso(now - 4 * H),
    confirmed_by: null, confirmed_at: null, approved_by: null, approved_at: null, executed_by: null, executed_at: null,
    rejected_by: null, rejected_at: null, reject_reason: null,
  }];

  /* ---------- Lịch sử hồ sơ 360° ---------- */
  let hseq = 0;
  const assetHistory = [];
  const hist = (asset_id, event_type, note, actor_id, at) =>
    assetHistory.push({ id: "h_" + String(++hseq).padStart(4, "0"), asset_id, event_type, note, actor_id, created_at: iso(at) });
  assets.forEach((a) => hist(a.id, "create", "Khởi tạo từ file Excel ngân hàng (FA0203)", "u_admin", now - 40 * D));
  repairs.forEach((r) => {
    hist(r.asset_id, "status_change", `Lập phiếu báo hỏng ${r.ticket_code}: ${r.description}`, r.reported_by, Date.parse(r.created_at));
    if (r.manager_at) hist(r.asset_id, "repair", `LĐP phê duyệt phiếu ${r.ticket_code} (Mức độ: ${r.priority})`, r.manager_id, Date.parse(r.manager_at));
    if (r.tcth_at) hist(r.asset_id, "repair", `TCTH điều phối phiếu ${r.ticket_code} cho Điện toán`, r.tcth_id, Date.parse(r.tcth_at));
    if (r.status === "completed") hist(r.asset_id, "status_change", `IT khắc phục xong phiếu ${r.ticket_code}: ${r.resolution_note}`, r.it_id, Date.parse(r.it_at));
  });
  hist(A("FA0006").id, "transfer", `Lập lệnh điều chuyển ${transfers[0].ticket_code}`, "u_mgr", now - 4 * H);

  /* ---------- Nhật ký IT có sẵn (mã WL-D… để không trùng mã bot sinh: WL-0001…) ---------- */
  const worklogs = [];
  const wl = (n, code, daysAgo, itId, category, description, duration_min, repair) => {
    const a = A(code), u = users.find((x) => x.id === itId), at = now - daysAgo * D;
    worklogs.push({
      id: "WL-D" + String(n).padStart(3, "0"), ts_ms: at, created_at: iso(at), source: "demo", it_user_id: itId, it_user: u.full_name,
      asset_id: a.id, asset_code: a.code, asset_name: a.name, department_id: a.department_id, category, description, duration_min,
      status: "done", repair_id: repair ? repair.id : null, ticket_code: repair ? repair.ticket_code : null,
    });
    hist(a.id, "it_work", `IT ghi nhật ký (${category}): ${description} — ${duration_min} phút`, itId, at);
  };
  // FA0001 đã có 2 lần xử lý: lần thứ 3 trong kịch bản sẽ bật cảnh báo "hay hỏng"
  wl(1, "FA0001", 60, "u_it1", "Sửa chữa phần cứng", "Thay RAM 8GB lên 16GB", 30);
  wl(2, "FA0001", 25, "u_it2", "Bảo trì định kỳ", "Vệ sinh máy, tra keo tản nhiệt", 40);
  wl(3, "FA0005", 19, "u_it1", "Sửa chữa phần cứng", "Cài lại driver máy quét, thay cáp USB", 25, repairs[4]);
  wl(4, "FA0002", 45, "u_it2", "Máy in/Photocopy", "Thay trục cuốn giấy", 50);
  wl(5, "FA0007", 12, "u_it1", "Bảo trì định kỳ", "Vệ sinh dàn lạnh định kỳ quý", 90);

  const inventoryChecks = [{
    id: "ic_1", department_id: "dept_7", period_type: "quarter", period_label: `${new Date(now).getUTCFullYear()}-Q${Math.floor(new Date(now).getUTCMonth() / 3) + 1}`,
    note: "Kiểm kê đủ, khớp sổ (dữ liệu demo)", created_by: "u_tcth", created_at: iso(now - 10 * D),
  }];

  return {
    version: 3, exported_at: iso(now), _demo: true,
    departments: ref.departments, categories: ref.categories, users, assets, assetHistory, transfers, repairs, inventoryChecks, worklogs,
    templateConfig: {}, session: { userId: null },
  };
}

module.exports = { buildBackup, DEMO_PASSWORD };

if (require.main === module) {
  process.stdout.write(JSON.stringify(buildBackup(), null, 2) + "\n");
}
