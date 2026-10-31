/* ============================================================================
   MODULE 2: GIAO DIỆN MỚI + DASHBOARD BIỂU ĐỒ + TÌM KIẾM CHUNG + THÔNG BÁO + QR
             + ĐỊA ĐIỂM / PHỤ KIỆN / PHẦN MỀM (bảo hành, serial, "Chưa sử dụng")
   File này được build-app.py chèn sau modules.js (cùng phạm vi). Hàm khai báo ở đây ghi đè hàm cùng tên của bản gốc.
   Không dùng thư viện/phông chữ ngoài: chạy được hoàn toàn trong mạng nội bộ.
   ============================================================================ */

const U2_STAFF = ["admin", "tcth", "it"];
const isStaff2 = u => U2_STAFF.includes(u.role);
const canLoc = u => ["admin", "tcth"].includes(u.role);
const canStock = u => U2_STAFF.includes(u.role);
const normTxt = s => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
/* Sắp xếp ABC (tiếng Việt) cho các danh mục nhỏ: phòng ban, nhóm, địa điểm, phần mềm, phụ kiện; người dùng theo TÊN (từ cuối) rồi họ đệm. */
const VI_COLL = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
const cmpName = (a, b) => VI_COLL.compare(String(a.name || ""), String(b.name || ""));
const personKey = u => { const w = String(u.full_name || u.username || "").trim().split(/\s+/); return [w[w.length - 1] || "", w.slice(0, -1).join(" ")]; };
const cmpPerson = (a, b) => { const x = personKey(a), y = personKey(b); return VI_COLL.compare(x[0], y[0]) || VI_COLL.compare(x[1], y[1]); };
function sortLists() {
  ["departments", "categories", "locations", "software", "accessories"].forEach(k => { if (Array.isArray(DB[k]) && DB[k].length > 1) DB[k].sort(cmpName); });
  if (Array.isArray(DB.users) && DB.users.length > 1) DB.users.sort(cmpPerson);
}
const locName = id => { const l = id ? (DB.locations || []).find(x => x.id === id) : null; return l ? l.name : null; };
const dayDiff = iso => { if (!iso) return null; const t = Date.parse(String(iso).slice(0, 10)); return isNaN(t) ? null : Math.floor((t - Date.now()) / 86400000); };
const initials = n => String(n || "?").replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(w => /\p{L}/u.test(w[0] || "")).slice(-2).map(w => w[0]).join("").toUpperCase() || "?";
const PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#94a3b8", "#06b6d4", "#ec4899"];

Object.assign(PAGE_TITLES, {
  dashboard: "Trang chủ", assets: "Tài sản", ccdc: "Công cụ dụng cụ", transfers: "Cấp phát - Điều chuyển",
  repairs: "Bảo trì - Bảo hành", reports: "Báo cáo", itlog: "Nhật ký IT", admin_inventory: "Kiểm kê",
  admin_users: "Người sử dụng", admin_departments: "Phòng ban", admin_data: "Nhập - Xuất dữ liệu", admin_settings: "Cấu hình hệ thống",
  monitor: "Giám sát & truy cập", locations: "Địa điểm", qr: "QR Code", accessories: "Phụ kiện", accessory_detail: "Chi tiết phụ kiện",
  software: "Phần mềm & bản quyền", software_detail: "Chi tiết phần mềm",
});

/* ---------- Giao diện (CSS) ---------- */
(function injectStyles() {
  const st = document.createElement("style");
  st.textContent = `
:root{--brand:#2563eb;--brand2:#1d4ed8;--brand-dark:#1e40af;--bg:#f1f5fb;--sidebar-w:244px;--border:#e3e9f3;}
body{background:var(--bg);}
a{color:var(--brand);}
.sidebar{background:linear-gradient(180deg,#0f2a5c 0%,#123a78 55%,#0c2552 100%);}
.sb-brand{display:flex;align-items:center;gap:12px;padding:20px 18px 14px;color:#fff;}
.sb-logo{width:42px;height:42px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25);flex:none;}.sb-logo img{width:38px;height:38px;display:block;}
.sb-brand b{display:block;font-size:15px;line-height:1.2;} .sb-brand small{color:#9db6e3;font-size:11.5px;}
.sidebar-nav{padding:6px 6px 12px;}
.sidebar-section-title{color:#7f9bd1;padding:8px 18px 2px;font-size:10.5px;}
.sidebar-link{color:#cfdcf4;margin:1px 8px;padding:6px 12px;gap:10px;border-radius:10px;font-size:13px;box-shadow:none;white-space:nowrap;}
.sidebar-link .badge-count{margin-left:auto;flex-shrink:0;}
.sidebar-nav{padding:6px 6px;}
.sidebar-link:hover{background:rgba(255,255,255,.09);color:#fff;}
.sidebar-link.active{background:#2f6df0;color:#fff;box-shadow:0 6px 14px rgba(47,109,240,.45);}
.sidebar-link .ic{font-size:15px;}
.compact-tbl th{padding:6px 10px !important;white-space:nowrap}
.compact-tbl td{padding:3px 10px !important;vertical-align:middle;line-height:1.3}
.compact-tbl .btn{display:inline-flex !important;flex-direction:row !important;align-items:center;gap:4px;padding:3px 8px !important;font-size:12px !important;width:auto !important;height:auto !important;min-height:0 !important}
#usersTable td:nth-child(4){white-space:nowrap}

.avatar-big{width:56px;height:56px;font-size:20px;}
.um-hd{display:flex;gap:12px;align-items:center;padding:10px;border-bottom:1px solid var(--border);margin-bottom:6px}
.um-av{position:relative;cursor:pointer;flex-shrink:0;display:block}
.um-av .um-cam{position:absolute;right:-4px;bottom:-4px;background:#fff;border:1px solid var(--border);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px}
.um-nm{font-weight:700;color:#0f2a5c;margin-bottom:3px}.um-ln{font-size:12.5px;display:flex;gap:6px;line-height:1.5}.um-ln span{color:#64748b;min-width:62px}.um-ln b{font-weight:600}
.sb-user{margin:auto 12px 14px;padding:12px;border-radius:12px;background:rgba(255,255,255,.07);display:flex;align-items:center;gap:10px;color:#fff;}
.avatar{width:34px;height:34px;border-radius:50%;background:#2f6df0;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;}
.sb-user .nm{font-size:13px;font-weight:600;line-height:1.25;} .sb-user .rl{font-size:11px;color:#9db6e3;}
.main-area{background:var(--bg);}
.topbar2{display:flex;align-items:center;gap:14px;background:#fff;border-bottom:1px solid var(--border);padding:11px 24px;position:sticky;top:0;z-index:30;}
.topbar2 .ttl{font-weight:700;font-size:17px;color:#0f2a5c;white-space:nowrap;}
.gs{position:relative;flex:1;max-width:560px;margin-left:8px;}
.gs input{width:100%;padding:9px 14px 9px 38px;border:1px solid var(--border);background:#f5f8fd;border-radius:999px;font-size:14px;}
.gs input:focus{outline:none;border-color:var(--brand);background:#fff;box-shadow:0 0 0 3px rgba(37,99,235,.12);}
.gs .mag{position:absolute;left:14px;top:9px;color:#8aa0c4;font-size:15px;}
.gs-res{display:none;position:absolute;top:46px;left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 32px rgba(15,42,92,.18);max-height:430px;overflow:auto;z-index:40;padding:6px;}
.gs-res.show{display:block;}
.gs-sec{font-size:11px;font-weight:700;text-transform:uppercase;color:#7f93b5;padding:8px 10px 2px;}
.gs-it{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:13.5px;}
.gs-it:hover,.gs-it.on{background:#eef4ff;} .gs-it small{color:#7f93b5;display:block;font-size:12px;}
.gs-it .gi{width:30px;height:30px;border-radius:8px;background:#eaf1ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:10px;}
.dd{position:relative;} .dd-btn{border:none;background:none;display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:10px;}
.dd-btn:hover{background:#f1f5fb;}
.bell{position:relative;font-size:19px;width:38px;height:38px;border-radius:50%;justify-content:center;}
.bell .cnt{position:absolute;top:-2px;right:-2px;background:#ef4444;color:#fff;border-radius:999px;font-size:10px;min-width:17px;height:17px;display:flex;align-items:center;justify-content:center;font-weight:700;padding:0 4px;}
.dd-menu{display:none;position:absolute;right:0;top:46px;min-width:300px;background:#fff;border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 32px rgba(15,42,92,.18);z-index:50;padding:8px;}
.dd.open .dd-menu{display:block;}
.dd-menu .hd{font-weight:700;padding:6px 10px;color:#0f2a5c;}
.nt{display:flex;gap:10px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:13px;align-items:flex-start;}
.nt:hover{background:#f3f7ff;} .nt .ni{font-size:16px;} .nt.warn .ni{filter:none;}
.nt-empty{padding:14px 10px;color:#7f93b5;font-size:13px;}
.menu-it{display:block;padding:9px 12px;border-radius:9px;color:#1e293b;cursor:pointer;font-size:13.5px;}
.menu-it:hover{background:#f3f7ff;text-decoration:none;}
.container{max-width:1500px;}
.card{border-radius:14px;border:1px solid var(--border);box-shadow:0 2px 10px rgba(15,42,92,.05);}
table th{background:#f5f8fd;color:#51658a;font-size:12.5px;}
.badge{white-space:nowrap;} .badge-unused{background:linear-gradient(135deg,#64748b,#94a3b8);}
.badge-warn{background:#fef3c7;color:#92400e;} .badge-ok{background:#dcfce7;color:#166534;} .badge-bad{background:#fee2e2;color:#991b1b;} .badge-gray{background:#e8edf5;color:#475569;}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;}
/* dashboard */
.dash{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start;}
@media(max-width:1180px){.dash{grid-template-columns:1fr;}}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px;}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr);}}
.kpi{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;display:grid;grid-template-columns:auto 1fr;grid-template-areas:"ico ring" "v v" "l l";align-items:center;row-gap:2px;box-shadow:0 2px 10px rgba(15,42,92,.05);cursor:pointer;}
.kpi:hover{border-color:#b8cdf5;}
.kpi .ico{grid-area:ico;width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:6px;}
.kpi .ring{grid-area:ring;justify-self:end;}
.kpi .v{grid-area:v;font-size:28px;font-weight:800;color:#0f2a5c;line-height:1.1;} .kpi .l{grid-area:l;font-size:12.5px;color:#667a9c;} .kpi .d{font-size:11.5px;color:#16a34a;}
.kpi .tx{display:contents;}
.charts{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:14px;margin-bottom:18px;}
@media(max-width:1300px){.charts{grid-template-columns:1fr 1fr;}} @media(max-width:800px){.charts{grid-template-columns:1fr;}}
.cpanel{background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:0 2px 10px rgba(15,42,92,.05);}
.cpanel h4{margin:0 0 10px;font-size:14.5px;color:#0f2a5c;display:flex;justify-content:space-between;align-items:center;}
.cpanel h4 a{font-size:12px;font-weight:500;}
.legend{display:grid;gap:6px;font-size:12.5px;} .legend div{display:flex;align-items:center;gap:7px;} .legend i{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0;}
.legend span{margin-left:auto;color:#51658a;white-space:nowrap;}
.donutwrap{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;}
.side-card{background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:14px;box-shadow:0 2px 10px rgba(15,42,92,.05);}
.side-card .hd{background:linear-gradient(135deg,#123a78,#2f6df0);color:#fff;padding:14px 16px;}
.side-card .hd b{font-size:15.5px;display:block;} .side-card .hd small{opacity:.85;}
.side-card .bd{padding:14px 16px;}
.scan-in{display:flex;gap:8px;} .scan-in input{flex:1;}
.todo{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid #eef2f8;font-size:13px;cursor:pointer;} .todo:last-child{border:none;}
.qr-mini{width:38px;height:38px;display:block;cursor:pointer;}
.mono{font-family:ui-monospace,Consolas,monospace;}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px;}
.toolbar .form-group{margin:0;min-width:150px;}
.wf-step.skipped{background:#f3f4f6;border-style:dashed;color:#6b7280;}
.modal2{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal2>div{background:#fff;border-radius:16px;padding:22px;max-width:520px;width:100%;max-height:92vh;overflow:auto;}
.bar-sm{height:8px;background:#e8edf5;border-radius:6px;overflow:hidden;min-width:80px;} .bar-sm>i{display:block;height:100%;background:#3b82f6;}
.dash>div{min-width:0;}
.sb-backdrop{display:none;}
@media(max-width:980px){.topbar2{padding:8px 12px;gap:8px;} .topbar2 .ttl{display:none;} .sidebar{position:fixed;left:-270px;top:0;z-index:100;transition:left .2s;box-shadow:none;} .sidebar.open{left:0;box-shadow:8px 0 30px rgba(0,0,0,.35);}
  .sb-backdrop.show{display:block;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:90;} .gs{margin-left:0;min-width:0;} .hamburger{padding:4px 8px;}}
@media(max-width:700px){
  .dd-btn .who2{display:none;} .tb-right{gap:2px;} .container{padding:12px 10px;} .card{padding:14px;overflow-x:auto;} .cpanel{padding:12px;} table{font-size:12.5px;}
  .kpis{gap:10px;} .kpi{padding:12px;} .kpi .v{font-size:24px;} .kpis.money{grid-template-columns:1fr !important;} .kpis.money .v{font-size:19px !important;}
  .fab-back{width:48px !important;height:48px !important;} .modal2>div{padding:16px;} .toolbar .form-group{min-width:130px;flex:1;}
  .gs input{padding:8px 12px 8px 34px;font-size:14px;} .dd-menu{min-width:260px;right:-48px;}
}
`;
  document.head.appendChild(st);
})();

/* ---------- Thông báo (chuông) ---------- */
function uiNotifs(u) {
  const out = [];
  const add = (icon, text, route, params, level) => out.push({ icon, text, route, params: params || {}, level: level || "info" });
  const slaMs = 24 * 3600 * 1000, now = Date.now();
  let pr = 0, pt = 0;
  const confirms = DB.repairs.filter(r => r.status === "completed" && r.reported_by === u.id && !r.user_confirmed_at).length;
  if (u.role === "manager") {
    pt = DB.transfers.filter(t => t.status === "pending_confirm" && t.to_department_id === u.department_id).length;
    pr = DB.repairs.filter(r => { if (r.status !== "pending_manager") return false; const a = byId(DB.assets, r.asset_id); return a && a.department_id === u.department_id; }).length;
  } else if (u.role === "tcth") {
    pt = DB.transfers.filter(t => t.status === "pending_approval").length; pr = DB.repairs.filter(r => r.status === "pending_tcth").length;
  } else if (u.role === "it") {
    pr = DB.repairs.filter(r => r.status === "pending_it" || r.status === "in_progress").length;
  } else if (u.role === "admin") {
    pt = DB.transfers.filter(t => t.status === "pending_execute").length;
    pr = DB.repairs.filter(r => ["pending_manager", "pending_tcth", "pending_it", "in_progress"].includes(r.status)).length;
  }
  if (pr) add("🛠️", `${pr} phiếu báo hỏng / sửa chữa đang chờ xử lý`, "repairs", {}, "warn");
  if (pt) add("🔁", `${pt} lệnh điều chuyển đang chờ xử lý`, "transfers", {}, "warn");
  if (confirms) add("✅", `${confirms} phiếu đã xử lý xong, chờ bạn xác nhận`, "repairs", {}, "warn");
  if (isStaff2(u)) {
    const late = DB.repairs.filter(r => r.status === "pending_it" && now - (Date.parse(r.tcth_at || r.manager_at || r.created_at || "") || now) > slaMs).length;
    if (late) add("⏰", `${late} phiếu sửa chữa quá hạn xử lý (hơn 24 giờ)`, "repairs", {}, "bad");
  }
  const scope = assetsScope(u, DB.assets);
  let soon = 0;
  for (const a of scope) { const d = dayDiff(a.warranty_until); if (d !== null && d >= 0 && d <= 30) soon++; }
  if (soon) add("🛡️", `${soon} tài sản sắp hết bảo hành (≤ 30 ngày)`, "assets", { warranty: "soon" }, "warn");
  const qL = currentQuarterLabel(), hL = currentHalfYearLabel();
  const rel = DB.inventoryChecks.filter(c => c.period_label === qL || c.period_label === hL);
  if (u.role === "manager" && u.department_id && !rel.some(c => c.department_id === "ALL" || c.department_id === u.department_id)) add("📋", `Phòng của bạn chưa có biên bản kiểm kê kỳ ${qL}`, "admin_inventory", {}, "warn");
  if (!rel.some(c => c.department_id === "ALL") && (u.role === "admin" || u.role === "tcth")) {
    const miss = DB.departments.filter(d => !rel.some(c => c.department_id === d.id)).length;
    if (miss) add("📋", `Kỳ kiểm kê ${qL}: ${miss} phòng ban chưa có biên bản`, "admin_inventory", {}, "warn");
  }
  if (canStock(u)) {
    const sw = (DB.software || []).filter(s => { const d = dayDiff(s.expires_at); return d !== null && d <= 30; });
    if (sw.length) add("💿", `${sw.length} phần mềm sắp / đã hết hạn bản quyền`, "software", {}, "bad");
    const ac = (DB.accessories || []).filter(x => accAvail(x) <= (Number(x.min_qty) || 0) && Number(x.min_qty) > 0);
    if (ac.length) add("🧩", `${ac.length} loại phụ kiện dưới mức tồn tối thiểu`, "accessories", {}, "warn");
  }
  return out;
}

/* ---------- Tìm kiếm chung ---------- */
function uiSearch(v) {
  const box = document.getElementById("gsRes"); if (!box) return;
  const q = normTxt(v).trim();
  if (q.length < 2) { box.classList.remove("show"); box.innerHTML = ""; return; }
  const u = currentUser(); if (!u) return;
  const terms = q.split(/\s+/);
  const hit = s => terms.every(t => s.includes(t));
  const assets = [];
  for (const a of assetsScope(u, DB.assets)) {
    if (hit(normTxt([a.code, a.name, a.serial, userName(a.current_user_id), depName(a.department_id), locName(a.location_id)].join(" ")))) { assets.push(a); if (assets.length >= 8) break; }
  }
  const users = isStaff2(u) ? DB.users.filter(x => hit(normTxt([x.full_name, x.username, x.employee_code].join(" ")))).slice(0, 4) : [];
  const locs = isStaff2(u) ? (DB.locations || []).filter(x => hit(normTxt([x.name, x.code].join(" ")))).slice(0, 3) : [];
  let h = "";
  if (assets.length) h += `<div class="gs-sec">Tài sản</div>` + assets.map(a => `<div class="gs-it" onclick="uiGo('asset','${a.id}')"><span class="gi">📦</span><div><b>${esc(a.code)}</b> · ${esc(a.name)}<small>${esc([a.serial ? "SN " + a.serial : "", depName(a.department_id), userName(a.current_user_id), locName(a.location_id)].filter(Boolean).join(" · ") || "—")}</small></div></div>`).join("");
  if (users.length) h += `<div class="gs-sec">Người dùng</div>` + users.map(x => `<div class="gs-it" onclick="uiGo('user','${x.id}')"><span class="gi">👤</span><div><b>${esc(x.full_name)}</b><small>${esc(x.username)} · ${esc(depName(x.department_id) || "")}</small></div></div>`).join("");
  if (locs.length) h += `<div class="gs-sec">Địa điểm</div>` + locs.map(x => `<div class="gs-it" onclick="uiGo('loc','${x.id}')"><span class="gi">📍</span><div><b>${esc(x.name)}</b></div></div>`).join("");
  box.innerHTML = h || `<div class="nt-empty">Không tìm thấy kết quả cho “${esc(v)}”.</div>`;
  box.classList.add("show");
}
function uiSearchKey(ev, el) {
  if (ev.key === "Enter") { const it = document.querySelector("#gsRes .gs-it"); if (it) it.click(); else qrLookup(el.value, true); }
  if (ev.key === "Escape") { const b = document.getElementById("gsRes"); if (b) b.classList.remove("show"); }
}
function uiGo(kind, id) {
  const b = document.getElementById("gsRes"); if (b) b.classList.remove("show");
  if (kind === "asset") nav("asset_detail", { id });
  else if (kind === "user") nav("assets", { current_user_id: id });
  else if (kind === "loc") nav("assets", { location_id: id });
}
function uiToggle(id) {
  const el = document.getElementById(id); if (!el) return;
  const was = el.classList.contains("open");
  document.querySelectorAll(".dd.open").forEach(x => x.classList.remove("open"));
  if (!was) el.classList.add("open");
}
function uiNotifGo(i) {
  const u = currentUser(); const n = uiNotifs(u)[Number(i)]; if (!n) return;
  document.querySelectorAll(".dd.open").forEach(x => x.classList.remove("open"));
  nav(n.route, n.params);
}
if (!window.__ui2) {
  window.__ui2 = 1;
  document.addEventListener("click", e => {
    if (!e.target.closest(".dd")) document.querySelectorAll(".dd.open").forEach(x => x.classList.remove("open"));
    if (!e.target.closest(".gs")) { const b = document.getElementById("gsRes"); if (b) b.classList.remove("show"); }
  });
}

/* ---------- Ảnh đại diện & thông tin người dùng ---------- */
const AV = { data: null, uid: null, loading: false };
const posName = u => (u && u.position) || ROLE_LABELS[u && u.role] || (u && u.role) || "";
function avatarLoad(u) {
  if (!u || AV.uid === u.id) return; AV.uid = u.id; AV.data = null;
  let c = null; try { c = JSON.parse(localStorage.getItem("av_" + u.id) || "null"); } catch (e) { c = null; }
  if (c) AV.data = c.d || null;
  if (c && Date.now() - c.t < 24 * 3600 * 1000) return;
  AV.loading = true;
  fetch("/api/profile/avatar", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) return; const changed = (j.data || null) !== AV.data; AV.data = j.data || null;
    try { localStorage.setItem("av_" + u.id, JSON.stringify({ d: AV.data, t: Date.now() })); } catch (e) { /* bỏ qua */ }
    if (changed) render();
  }).catch(() => {}).finally(() => { AV.loading = false; });
}
function avatarHtml(u, big) {
  avatarLoad(u);
  const st = AV.data ? `background-image:url(${AV.data});background-size:cover;background-position:center;color:transparent;` : "";
  return `<span class="avatar ${big ? "avatar-big" : ""}" style="${st}">${AV.data ? "" : esc(initials(u.full_name))}</span>`;
}
function avatarSave(data) {
  const u = currentUser(); if (!u) return;
  fetch("/api/profile/avatar", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) })
    .then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => {
      if (!ok) { flash(j.error || "Không lưu được ảnh.", "error"); render(); return; }
      AV.data = data; try { localStorage.setItem("av_" + u.id, JSON.stringify({ d: data, t: Date.now() })); } catch (e) { /* bỏ qua */ }
      flash(data ? "Đã đổi ảnh đại diện." : "Đã xóa ảnh đại diện."); render();
    }).catch(() => { flash("Không kết nối được máy chủ.", "error"); render(); });
}
function avatarPick(inp) {
  const f = inp.files && inp.files[0]; inp.value = ""; if (!f) return;
  if (!/^image\//.test(f.type)) { flash("Hãy chọn file ảnh.", "error"); render(); return; }
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const S = 128, cv = document.createElement("canvas"); cv.width = cv.height = S;
    const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, S, S); cx.drawImage(img, sx, sy, m, m, 0, 0, S, S);
    URL.revokeObjectURL(url); avatarSave(cv.toDataURL("image/jpeg", 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); flash("Không đọc được ảnh này.", "error"); render(); };
  img.src = url;
}
function avatarRemove() { avatarSave(null); }

function renderTopbar(u, title) {
  const n = uiNotifs(u);
  const nh = n.length ? n.map((x, i) => `<div class="nt ${x.level}" onclick="uiNotifGo(${i})"><span class="ni">${x.icon}</span><span>${esc(x.text)}</span></div>`).join("") : `<div class="nt-empty">🎉 Không có việc nào cần xử lý.</div>`;
  return `
  <div class="topbar2">
    <button class="hamburger" data-action="toggleSidebar">☰</button>
    <span class="ttl">${esc(title)}</span>
    <div class="gs"><span class="mag">🔍</span>
      <input id="gsIn" autocomplete="off" placeholder="Tìm kiếm tài sản, người dùng, mã QR, serial…" oninput="uiSearch(this.value)" onfocus="uiSearch(this.value)" onkeydown="uiSearchKey(event,this)">
      <div class="gs-res" id="gsRes"></div></div>
    <div class="tb-right">
      <div class="dd" id="ddBell"><button class="dd-btn bell" onclick="uiToggle('ddBell')" title="Thông báo">🔔${n.length ? `<span class="cnt">${n.length}</span>` : ""}</button>
        <div class="dd-menu"><div class="hd">Thông báo</div>${nh}</div></div>
      <div class="dd" id="ddUser"><button class="dd-btn" onclick="uiToggle('ddUser')">${avatarHtml(u)}
        <span class="who2" style="text-align:left;line-height:1.2"><b style="font-size:13px">${esc(u.full_name)}</b><br><small class="text-muted">${esc(posName(u))}</small></span> <span class="who2">▾</span></button>
        <div class="dd-menu" style="min-width:270px"><div class="um-hd">
          <label class="um-av" title="Đổi ảnh đại diện">${avatarHtml(u, "big")}<span class="um-cam">📷</span><input type="file" accept="image/*" style="display:none" onchange="avatarPick(this)"></label>
          <div class="um-info"><div class="um-nm">${esc(u.full_name)}</div>
            <div class="um-ln"><span>Phòng/Ban</span><b>${esc(depName(u.department_id) || "—")}</b></div>
            <div class="um-ln"><span>Chức vụ</span><b>${esc(posName(u))}</b></div></div></div>
          <label class="menu-it" style="cursor:pointer">🖼️ Đổi ảnh đại diện<input type="file" accept="image/*" style="display:none" onchange="avatarPick(this)"></label>
          ${AV.data ? `<a class="menu-it" onclick="avatarRemove()">🗑️ Xóa ảnh đại diện</a>` : ""}
          <a class="menu-it" data-action="logout">🚪 Đăng xuất</a></div></div>
    </div>
  </div>`;
}

/* ---------- Thanh bên ---------- */
function renderSidebar(u) {
  const n = uiNotifs(u);
  const alias = { asset_detail: "assets", asset_form: "assets", transfer_new: "transfers", transfer_detail: "transfers", repair_new: "repairs", repair_detail: "repairs", inventory_run: "admin_inventory", accessory_detail: "accessories", software_detail: "software", admin_user_edit: "admin_users" };
  const cur = alias[state.route] || state.route;
  const cntOf = r => n.filter(x => x.route === r).length;
  const item = (route, icon, label) => { const c = cntOf(route); return `<a class="sidebar-link ${cur === route ? "active" : ""}" data-nav="${route}"><span class="ic">${icon}</span>${label}${c ? `<span class="badge-count">${c}</span>` : ""}</a>`; };
  const staff = isStaff2(u), adm = u.role === "admin", ta = adm || u.role === "tcth";
  return `
  <div class="sb-backdrop ${state.sidebarOpen ? "show" : ""}" data-action="toggleSidebar"></div>
  <div class="sidebar ${state.sidebarOpen ? "open" : ""}">
    <div class="sb-brand"><div class="sb-logo"><img src="/img/logo.png" alt="ASSETS"></div><div><b>Quản lý tài sản</b><small>704 · TSCĐ & CCDC</small></div></div>
    <div class="sidebar-nav">
      ${item("dashboard", "🏠", "Trang chủ")}
      ${item("assets", "🗄️", "Tài sản")}
      ${staff || u.role === "manager" ? item("ccdc", "🔧", "Công cụ dụng cụ") : ""}
      ${item("transfers", "🔁", "Cấp phát - Điều chuyển")}
      ${item("repairs", "🛠️", "Bảo trì - Bảo hành")}
      ${ta ? item("admin_inventory", "📋", "Kiểm kê") : (u.role === "manager" ? item("admin_inventory", "📋", "Kiểm kê phòng ban") : "")}
      ${staff ? `<div class="sidebar-section-title">Danh mục</div>
        ${adm ? item("admin_users", "👤", "Người sử dụng") : ""}
        ${adm ? item("admin_departments", "🏢", "Phòng ban") : ""}
        ${item("qr", "🔳", "QR Code")}
        ${item("software", "💿", "Phần mềm")}` : ""}
      <div class="sidebar-section-title">Hệ thống</div>
      ${item("reports", "📈", "Báo cáo")}
      ${staff ? item("itlog", "🧰", "Nhật ký IT") : ""}
      ${ta ? item("admin_data", "🔄", "Nhập - Xuất dữ liệu") : ""}
      ${ta ? item("admin_settings", "⚙️", "Cấu hình") : ""}
      ${["admin", "it"].includes(u.role) ? item("monitor", "📡", "Giám sát & truy cập") : ""}
    </div>
    ${pwaBtn()}
  </div>`;
}

/* ---------- Biểu đồ SVG ---------- */
function svgRing(pct, color, size) {
  size = size || 52; const t = 6, r = (size - t) / 2, c = 2 * Math.PI * r, len = c * Math.max(0, Math.min(100, pct)) / 100;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e8edf5" stroke-width="${t}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="round" stroke-dasharray="${len} ${c - len}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size / 4.3}" font-weight="700" fill="#334155">${Math.round(pct)}%</text></svg>`;
}
function svgDonut(segs, total, size) {
  size = size || 150; const t = 24, r = (size - t) / 2, c = 2 * Math.PI * r; let off = 0;
  const arcs = segs.filter(s => s.v > 0).map(s => { const len = total ? s.v / total * c : 0; const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${t}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`; off += len; return el; }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef2f8" stroke-width="${t}"/>${arcs}<text x="50%" y="46%" text-anchor="middle" font-size="${size / 5}" font-weight="800" fill="#0f2a5c">${total}</text><text x="50%" y="62%" text-anchor="middle" font-size="${size / 12}" fill="#667a9c">Tổng tài sản</text></svg>`;
}
function svgBars(items) {
  const W = 250, H = 230, padB = 44, padT = 22, n = items.length || 1, bw = Math.min(30, (W - 20) / n - 10), max = Math.max(1, ...items.map(i => i.v));
  const step = (W - 20) / n;
  const bars = items.map((it, i) => {
    const h = (H - padB - padT) * it.v / max, x = 10 + i * step + (step - bw) / 2, y = H - padB - h;
    const lab = it.label.length > 7 ? it.label.slice(0, 6) + "…" : it.label;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 1)}" rx="5" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="#334155">${it.v}</text><text x="${x + bw / 2}" y="${H - 24}" text-anchor="middle" font-size="11.5" fill="#667a9c"><title>${esc(it.label)}</title>${esc(lab)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="10" y1="${H - padB}" x2="${W - 10}" y2="${H - padB}" stroke="#e3e9f3"/>${bars}</svg>`;
}
function groupTop(list, keyFn, nameFn, top) {
  const m = new Map(); list.forEach(a => { const k = keyFn(a) || ""; m.set(k, (m.get(k) || 0) + 1); });
  const arr = [...m.entries()].map(([k, v]) => ({ k, v, label: nameFn(k) || "Chưa xác định" })).sort((a, b) => b.v - a.v);
  const head = arr.slice(0, top), rest = arr.slice(top).reduce((s, x) => s + x.v, 0);
  if (rest) head.push({ k: "_", v: rest, label: "Khác" });
  return head;
}

/* ---------- Dashboard ---------- */
function viewDashboard(u) {
  const list = assetsScope(u, DB.assets), total = list.length;
  const cnt = s => list.filter(a => a.status === s).length;
  const inUse = cnt("in_use"), broken = cnt("broken"), unused = cnt("unused"), liq = cnt("liquidation");
  const pct = n => total ? n / total * 100 : 0;
  const monthAgo = Date.now() - 30 * 86400000;
  const newer = list.filter(a => Date.parse(a.created_at || "") > monthAgo).length;
  const byCat = groupTop(list, a => a.category_id, id => catName(id), 5);
  const byDept = groupTop(list, a => a.department_id, id => depName(id), 5);
  const st = [{ v: inUse, color: "#22c55e", label: "Đang sử dụng" }, { v: unused, color: "#94a3b8", label: "Chưa sử dụng" }, { v: broken, color: "#f59e0b", label: "Bảo trì / Sửa chữa" }, { v: liq, color: "#ef4444", label: "Đề nghị thanh lý" }];
  const legend = (arr, tot) => `<div class="legend">${arr.map(s => `<div><i style="background:${s.color}"></i>${esc(s.label)}<span>${s.v} (${tot ? Math.round(s.v / tot * 100) : 0}%)</span></div>`).join("")}</div>`;
  const deptSegs = byDept.map((x, i) => ({ v: x.v, color: PALETTE[i % PALETTE.length], label: x.label }));
  const recent = list.slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 8);
  const badge = a => `<span class="badge badge-${a.status}">${esc(STATUS_LABELS[a.status] || a.status)}</span>`;
  const notifs = uiNotifs(u);
  const money = ta => ta ? `<div class="kpis money" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="kpi" onclick="nav('assets')" style="grid-template-areas:'ico v' 'ico l';column-gap:14px"><div class="ico" style="background:#e0ecff">💰</div><div class="v" style="font-size:21px;align-self:end">${fmtVND(list.reduce((s, a) => s + Number(a.original_value || 0), 0))}</div><div class="l" style="align-self:start">Tổng nguyên giá</div></div>
      <div class="kpi" onclick="nav('assets')" style="grid-template-areas:'ico v' 'ico l';column-gap:14px"><div class="ico" style="background:#dcfce7">📉</div><div class="v" style="font-size:21px;align-self:end">${fmtVND(list.reduce((s, a) => s + Number(a.remaining_value || 0), 0))}</div><div class="l" style="align-self:start">Tổng giá trị còn lại</div></div></div>` : "";
  return `
  <div class="dash"><div>
    <div class="kpis">
      <div class="kpi" onclick="nav('assets')"><div class="ico" style="background:#e0ecff">🖥️</div><div class="v">${total}</div><div class="l">Tổng tài sản${newer ? ` <span class="d">↑ ${newer} mới / 30 ngày</span>` : ""}</div></div>
      <div class="kpi" onclick="nav('assets',{status:'in_use'})"><div class="ico" style="background:#dcfce7">✅</div><div class="v">${inUse}</div><div class="l">Đang sử dụng</div>${svgRing(pct(inUse), "#22c55e")}</div>
      <div class="kpi" onclick="nav('assets',{status:'broken'})"><div class="ico" style="background:#fef3c7">🔧</div><div class="v">${broken}</div><div class="l">Bảo trì / Sửa chữa</div>${svgRing(pct(broken), "#f59e0b")}</div>
      <div class="kpi" onclick="nav('assets',{status:'unused'})"><div class="ico" style="background:#fee2e2">📥</div><div class="v">${unused}</div><div class="l">Chưa sử dụng</div>${svgRing(pct(unused), "#ef4444")}</div>
    </div>
    ${money(["admin", "tcth"].includes(u.role))}
    <div class="charts">
      <div class="cpanel"><h4>Tài sản theo nhóm <a data-nav="reports">Xem chi tiết →</a></h4>${total ? svgBars(byCat.map(x => ({ v: x.v, label: x.label }))) : `<p class="text-muted">Chưa có dữ liệu.</p>`}</div>
      <div class="cpanel"><h4>Tình trạng tài sản</h4><div class="donutwrap">${svgDonut(st, total)}${legend(st, total)}</div></div>
      <div class="cpanel"><h4>Tài sản theo phòng ban</h4><div class="donutwrap">${svgDonut(deptSegs, total)}${legend(deptSegs, total)}</div></div>
    </div>
  </div>
  <div>
    <div class="side-card"><div class="hd"><b>📱 Quét QR tra cứu tài sản</b><small>Quét tem QR hoặc nhập mã / serial</small></div>
      <div class="bd"><div class="scan-in"><input class="form-control" id="dashLookup" placeholder="Mã tài sản hoặc serial…" onkeydown="if(event.key==='Enter')qrLookup(this.value,true)"><button class="btn btn-primary btn-sm" onclick="qrLookup(document.getElementById('dashLookup').value,true)">Tra cứu</button></div>
        <div id="qrMsg" class="small" style="color:#b91c1c;margin-top:6px"></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-outline" onclick="qrScan()">📷 Quét bằng camera</button>${isStaff2(u) ? `<a class="btn btn-sm btn-outline-secondary" data-nav="qr">🔳 In tem QR</a>` : ""}</div></div></div>
    <div class="side-card"><div class="hd" style="background:linear-gradient(135deg,#7c3aed,#a855f7)"><b>🔔 Việc cần xử lý</b><small>${notifs.length ? notifs.length + " mục" : "Không có việc tồn đọng"}</small></div>
      <div class="bd">${notifs.length ? notifs.map((x, i) => `<div class="todo" onclick="uiNotifGo(${i})"><span>${x.icon}</span><span>${esc(x.text)}</span></div>`).join("") : `<p class="text-muted" style="margin:0">🎉 Mọi thứ đều ổn.</p>`}</div></div>
  </div></div>
      <div class="card"><h4 style="margin:0 0 12px;display:flex;justify-content:space-between">Tài sản cập nhật gần đây <a data-nav="assets" style="font-size:13px;font-weight:500">Xem tất cả →</a></h4>
      <div style="overflow:auto"><table><thead><tr><th>Mã tài sản</th><th>Tên tài sản</th><th>Loại</th><th>Serial</th><th>Người sử dụng</th><th>Phòng ban</th><th>Địa điểm</th><th>Trạng thái</th><th>QR</th></tr></thead><tbody>
      ${recent.map(a => `<tr><td><a data-nav="asset_detail" data-params='{"id":"${a.id}"}'>${esc(a.code)}</a></td><td>${esc(a.name)}</td><td>${esc(catName(a.category_id) || "-")}</td><td class="mono">${esc(a.serial || "-")}</td><td>${esc(userName(a.current_user_id) || "-")}</td><td>${esc(depName(a.department_id) || "-")}</td><td>${esc(locName(a.location_id) || "-")}</td><td>${badge(a)}</td><td><span class="qr-mini" onclick="qrShow('${a.id}')" title="Xem / in tem QR">${qrSvg(qrUrl(a), 38)}</span></td></tr>`).join("") || `<tr><td colspan="9" class="text-muted" style="text-align:center;padding:20px">Chưa có tài sản.</td></tr>`}
      </tbody></table></div></div>`;
}

/* ============================================================================
   QR CODE: tem tài sản, tra cứu nhanh, quét bằng camera, liên kết sâu (#asset=MÃ)
   ============================================================================ */
function qrBase() {
  const c = DB.templateConfig && DB.templateConfig.qr_base_url;
  return String(c || (location.origin + "/app.html")).replace(/[#?].*$/, "").replace(/\/+$/, "");
}
function qrUrl(a) { return qrBase() + "#asset=" + encodeURIComponent(a.code); }
/* Nội dung QR: liên kết (chứa mã tài sản) | tên | serial (nếu có) | phòng | người dùng. Cắt gọn để mã không quá dày. */
function qrBytes(t) { return new TextEncoder().encode(String(t)).length; }
function qrCut(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); while (t && qrBytes(t) > n) t = t.slice(0, -1); return t; }
function qrPayload(a) {
  const head = qrUrl(a);
  const parts = [["Tên", qrCut(a.name, 30)], ["SN", a.serial ? qrCut(a.serial, 22) : ""], ["Phòng", qrCut(depName(a.department_id), 22)], ["User", qrCut(userName(a.current_user_id || a.assigned_user_id), 20)]];
  let out = head;
  for (const [k, v] of parts) { if (!v) continue; const nx = out + " | " + k + ": " + v; if (qrBytes(nx) <= 165) out = nx; }
  return out;
}
function qrParse(v) {
  v = String(v || "").trim();
  const m = /[#&?]asset=([^&\s]+)/.exec(v);
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  return v;
}
function qrFind(v) {
  const code = qrParse(v).toLowerCase(); if (!code) return null;
  return DB.assets.find(a => String(a.code).toLowerCase() === code) || DB.assets.find(a => a.serial && String(a.serial).toLowerCase() === code) || null;
}
function qrLookup(v, fromUi) {
  const u = currentUser(); if (!u) return;
  const a = qrFind(v);
  const scoped = a && assetsScope(u, [a]).length;
  if (a && scoped) { nav("asset_detail", { id: a.id }); return true; }
  const msg = a ? "Bạn không có quyền xem tài sản này." : "Không tìm thấy tài sản: " + qrParse(v);
  const el = document.getElementById("qrMsg"); if (el) el.textContent = msg; else if (fromUi) alert(msg);
  return false;
}
function handleDeepLink() {
  const m = /[#&]asset=([^&]+)/.exec(location.hash || ""); if (!m || !currentUser()) return;
  let code = m[1]; try { code = decodeURIComponent(code); } catch (e) { /* giữ nguyên */ }
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* bỏ qua */ }
  const a = qrFind(code);
  if (a && assetsScope(currentUser(), [a]).length) { state.route = "asset_detail"; state.params = { id: a.id }; state.history = []; }
  else flash(a ? "Bạn không có quyền xem tài sản này." : "Không tìm thấy tài sản có mã " + code, "error");
}
window.addEventListener("hashchange", () => { if (typeof currentUser === "function" && DB && DB.session && currentUser() && /asset=/.test(location.hash)) { handleDeepLink(); render(); } });

function modal2(html) {
  const d = document.createElement("div"); d.className = "modal2"; d.innerHTML = "<div>" + html + "</div>";
  d.addEventListener("mousedown", e => { if (e.target === d) closeModal2(d); });
  document.body.appendChild(d); return d;
}
function closeModal2(d) { (d || document.querySelector(".modal2"))?.remove(); if (window.__scanStream) { window.__scanStream.getTracks().forEach(t => t.stop()); window.__scanStream = null; } window.__scanOn = false; }

function qrShow(id) {
  const a = byId(DB.assets, id); if (!a) return;
  const url = qrUrl(a);
  const d = modal2(`<h3 style="margin:0 0 4px">🔳 ${esc(a.code)}</h3><div class="text-muted" style="margin-bottom:10px">${esc(a.name)}</div>
    <div style="text-align:center">${qrSvg(qrPayload(a), 220)}</div><div class="mono small text-muted" style="word-break:break-all;margin:8px 0 14px">${esc(qrPayload(a))}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="closeModal2()">Đóng</button><button class="btn btn-primary" onclick="qrPrintDialog('${a.id}')">🖨️ In tem</button></div>`);
  return d;
}
const QR_LAYOUTS = {
  a3x11: { label: "A4 · 3 cột × 11 hàng · tem cao 24 mm (khuyên dùng)", cols: 3, h: 24, qr: 20, page: "A4", margin: "8mm 8mm" },
  kj60: { label: "King Jim / Tepra · băng 24 mm · tem 60 × 24 mm (cuộn)", cols: 1, h: 24, qr: 20, page: "60mm 24mm", margin: "0", roll: true },
  kj80: { label: "King Jim / Tepra · băng 24 mm · tem 80 × 24 mm (cuộn)", cols: 1, h: 24, qr: 20, page: "80mm 24mm", margin: "0", roll: true },
};
function qrLayoutPref() { try { const v = localStorage.getItem("qrLayoutPref"); if (v && QR_LAYOUTS[v]) return v; } catch (e) { /* bỏ qua */ } return qrF.layout; }
const qrDlgHint = k => { const L = QR_LAYOUTS[k]; return L.roll ? `Khổ giấy <b>${L.page.replace(" ", " × ")}</b> (băng 24 mm), lề 0, tỷ lệ 100%. Tại hộp thoại in tiếp theo, chọn máy in <b>KING JIM SR5900P</b> (hoặc máy Tepra của bạn).` : `Khổ <b>A4</b>, lề 0, tỷ lệ 100% (không chọn “Vừa trang”). Chọn máy in A4 ở hộp thoại in tiếp theo.`; };
function qrDlgChange() { const k = document.getElementById("qpd_layout").value; document.getElementById("qpd_hint").innerHTML = qrDlgHint(k); }
function qrPrintDialog(id) {
  closeModal2(); const a = byId(DB.assets, id); if (!a) return;
  const cur = qrLayoutPref();
  modal2(`<h3 style="margin:0 0 4px">🏷️ In tem QR</h3><div class="text-muted" style="margin-bottom:12px">${esc(a.code)} · ${esc(a.name)}</div>
    <div class="form-group"><label>Mẫu tem / cỡ giấy</label><select class="form-control" id="qpd_layout" onchange="qrDlgChange()">${Object.entries(QR_LAYOUTS).map(([k, v]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></div>
    <div class="form-group"><label>Số tem in</label><input class="form-control" type="number" id="qpd_copies" min="1" max="50" value="1" style="max-width:120px"></div>
    <div class="small text-muted" id="qpd_hint" style="margin-bottom:14px">${qrDlgHint(cur)}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="closeModal2()">Hủy</button><button class="btn btn-primary" onclick="qrPrintGo('${a.id}')">🖨️ In…</button></div>`);
}
function qrPrintGo(id) {
  const k = document.getElementById("qpd_layout").value, n = Math.max(1, Math.min(50, Number(document.getElementById("qpd_copies").value) || 1));
  try { localStorage.setItem("qrLayoutPref", k); } catch (e) { /* bỏ qua */ }
  qrF.layout = k; closeModal2();
  qrPrintIds(Array(n).fill(id), k);
}
/* ---------- Khung in ngay trong ứng dụng (không mở tab mới: tránh treo/kẹt trên điện thoại & PWA) ---------- */
function printOverlay(title, css, bodyHtml, hint) {
  closePrintOverlay();
  const ov = document.createElement("div"); ov.id = "printOv";
  ov.innerHTML = `<style id="printOvCss">${css}
    #printOv{position:fixed;inset:0;z-index:9999;background:#e5e7eb;overflow:auto;-webkit-overflow-scrolling:touch}
    #printOv .po-bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#0f2a5c;color:#fff;padding:10px 12px;font:14px Arial}
    #printOv .po-bar b{flex:1;min-width:120px} #printOv .po-bar button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;font-size:14px}
    #printOv .po-pg{background:#fff;margin:10px auto;max-width:900px;box-shadow:0 2px 10px rgba(0,0,0,.2)}
    #printOv .po-hint{font:12px Arial;background:#fff8d6;padding:6px 10px;border-bottom:1px solid #e6d98a}
    @media print{ body>*:not(#printOv){display:none !important} #printOv{position:static !important;background:#fff;overflow:visible} #printOv .po-bar,#printOv .po-hint{display:none !important} #printOv .po-pg{margin:0;max-width:none;box-shadow:none} }
  </style>
  <div class="po-bar"><button style="background:#fff;color:#0f2a5c" onclick="closePrintOverlay()">← Quay lại</button><b>${esc(title)}</b><button style="background:#2f6df0;color:#fff" onclick="window.print()">🖨️ In</button></div>
  ${hint ? `<div class="po-hint">${hint}</div>` : ""}<div class="po-pg">${bodyHtml}</div>`;
  document.body.appendChild(ov); ov.scrollTop = 0;
  document.documentElement.style.overflow = "hidden";
}
function closePrintOverlay() { const o = document.getElementById("printOv"); if (o) o.remove(); document.documentElement.style.overflow = ""; }
window.addEventListener("afterprint", () => { /* giữ khung xem trước để người dùng in lại hoặc bấm Quay lại */ });
// Biên bản / báo cáo cũng dùng khung này thay vì tab mới
function openPrintWindow(bodyHtml, titleHint) {
  printOverlay(titleHint || "In", `body{font-family:Arial,Helvetica,sans-serif;color:#111} #printOv .po-pg{padding:18px;font-size:13px} #printOv table{border-collapse:collapse;width:100%} #printOv table.print-table th,#printOv table.print-table td{border:1px solid #333;padding:5px 7px;font-size:12.5px} #printOv table.print-table th{color:#f8fafc;background:#111827;border:none;font-size:12px;text-transform:uppercase} #printOv .text-end{text-align:right} #printOv h2{margin-bottom:4px} @media print{#printOv .po-pg{padding:0}}`, bodyHtml, "");
}

function qrPrintIds(ids, layoutKey) {
  const L = QR_LAYOUTS[layoutKey] || QR_LAYOUTS.a3x11;
  const assets = ids.map(id => byId(DB.assets, id)).filter(Boolean);
  if (!assets.length) { alert("Chưa chọn tài sản nào."); return; }
  const labels = assets.map(a => `<div class="lab"><div class="q">${qrSvg(qrPayload(a), 0)}</div><div class="t"><b>${esc(a.code)}</b><span>${esc(a.name)}</span>${a.serial ? `<small>SN: ${esc(a.serial)}</small>` : ""}<small>${esc(depName(a.department_id) || "-")}</small><small>${esc(userName(a.current_user_id || a.assigned_user_id) || "Chưa cấp phát")}</small></div></div>`).join("");
  const css = `@page{size:${L.page};margin:${L.margin}}
    #printOv .grid{display:grid;grid-template-columns:repeat(${L.cols},1fr)}
    #printOv .lab{height:${L.h}mm;box-sizing:border-box;display:flex;align-items:center;gap:2mm;padding:1.5mm;font-family:Arial,sans-serif;${L.roll ? "page-break-after:always;break-after:page;" : "border:0.2mm dashed #bbb;"}page-break-inside:avoid;overflow:hidden}
    #printOv .q{width:${L.qr}mm;height:${L.qr}mm;flex-shrink:0}#printOv .q svg{width:100%;height:100%;display:block}
    #printOv .t{display:flex;flex-direction:column;min-width:0;line-height:1.15;overflow:hidden}#printOv .t b{font-size:${L.h <= 24 ? 9 : L.roll ? 10 : 11}pt}#printOv .t span{font-size:${L.h <= 24 ? 7 : L.roll ? 7 : 8}pt;overflow:hidden;display:-webkit-box;-webkit-line-clamp:${L.h <= 24 ? 1 : 2};-webkit-box-orient:vertical}#printOv .t small{font-size:6.5pt;color:#444}`;
  printOverlay("Tem QR tài sản (" + assets.length + ")", css, `<div class="grid">${labels}</div>`, `Khổ giấy: <b>${L.page.replace(" ", " × ")}</b> · Lề: Không · Tỷ lệ: 100%${L.roll ? " · Máy King Jim: chọn đúng bề rộng băng 24 mm" : ""} — bấm <b>🖨️ In</b>, xong bấm <b>← Quay lại</b>.`);
}

const qrF = { q: "", dept: "", cat: "", kind: "", loc: "", page: 1, layout: "a3x11", sel: new Set() };
function qrList(u) {
  const q = normTxt(qrF.q).trim();
  return assetsScope(u, DB.assets).filter(a => (!qrF.dept || a.department_id === qrF.dept) && (!qrF.cat || a.category_id === qrF.cat) &&
    (!qrF.loc || a.location_id === qrF.loc) && (!qrF.kind || (qrF.kind === "ccdc") === isCCDC(a)) &&
    (!q || q.split(/\s+/).every(t => normTxt([a.code, a.name, a.serial].join(" ")).includes(t))));
}
function qrApply() {
  qrF.q = document.getElementById("qr_q").value; qrF.dept = document.getElementById("qr_dept").value; qrF.cat = document.getElementById("qr_cat").value;
  qrF.kind = document.getElementById("qr_kind").value; qrF.loc = document.getElementById("qr_loc").value; qrF.layout = document.getElementById("qr_layout").value;
  qrF.page = 1; render();
}
function qrSetPage(p) { qrF.page = Number(p) || 1; render(); }
function qrToggle(id, el) { if (el && el.checked) qrF.sel.add(id); else qrF.sel.delete(id); const c = document.getElementById("qrSelCnt"); if (c) c.textContent = qrF.sel.size; }
function qrSelAll() { qrList(currentUser()).slice(0, 1000).forEach(a => qrF.sel.add(a.id)); render(); }
function qrSelNone() { qrF.sel.clear(); render(); }
function qrPrintSel() { qrPrintIds([...qrF.sel].slice(0, 1000), qrF.layout); }
function qrPrintPage() { const u = currentUser(); const l = qrList(u); qrPrintIds(l.slice((qrF.page - 1) * PAGE_SIZE, qrF.page * PAGE_SIZE).map(a => a.id), qrF.layout); }
function qrSaveBase() {
  const v = document.getElementById("qr_base").value.trim();
  if (v && !/^https?:\/\/[^\s]+$/i.test(v)) { alert("Địa chỉ phải bắt đầu bằng http:// hoặc https://"); return; }
  DB.templateConfig.qr_base_url = v; saveDB(); flash(v ? "Đã lưu địa chỉ gốc cho mã QR." : "Đã dùng địa chỉ mặc định."); render();
}
function viewQR(u) {
  if (!isStaff2(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const list = qrList(u), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); if (qrF.page > pages) qrF.page = pages;
  const rows = list.slice((qrF.page - 1) * PAGE_SIZE, qrF.page * PAGE_SIZE);
  const opt = (arr, cur, lab) => arr.map(x => `<option value="${x.id}" ${cur === x.id ? "selected" : ""}>${esc(lab(x))}</option>`).join("");
  return `
  <div class="card"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:260px"><label class="small text-muted" style="font-weight:600">Tra cứu nhanh (máy quét mã vạch USB gõ vào đây, hoặc dán nội dung QR)</label>
      <div class="scan-in"><input class="form-control" id="qrLook" placeholder="Mã tài sản / serial / nội dung QR…" onkeydown="if(event.key==='Enter')qrLookup(this.value,true)"><button class="btn btn-primary" onclick="qrLookup(document.getElementById('qrLook').value,true)">Tra cứu</button><button class="btn btn-outline" onclick="qrScan()">📷 Camera</button></div>
      <div id="qrMsg" class="small" style="color:#b91c1c;margin-top:4px"></div></div>
    ${canLoc(u) ? `<div style="min-width:300px"><label class="small text-muted" style="font-weight:600">Địa chỉ gốc trong mã QR</label>
      <div class="scan-in"><input class="form-control" id="qr_base" value="${esc((DB.templateConfig && DB.templateConfig.qr_base_url) || "")}" placeholder="${esc(location.origin + "/app.html")}"><button class="btn btn-sm" onclick="qrSaveBase()">Lưu</button></div>
      <div class="small text-muted">Để trống = tự dùng địa chỉ đang truy cập. Đặt khi máy chủ có tên miền nội bộ cố định.</div></div>` : ""}
  </div></div>
  <div class="card"><div class="toolbar">
    <div class="form-group"><label>Tìm</label><input class="form-control" id="qr_q" value="${esc(qrF.q)}" placeholder="Mã, tên, serial" onkeydown="if(event.key==='Enter')qrApply()"></div>
    <div class="form-group"><label>Phòng ban</label><select class="form-control" id="qr_dept" onchange="qrApply()"><option value="">Tất cả</option>${opt(DB.departments, qrF.dept, d => d.name)}</select></div>
    <div class="form-group"><label>Nhóm</label><select class="form-control" id="qr_cat" onchange="qrApply()"><option value="">Tất cả</option>${opt(DB.categories, qrF.cat, c => c.name)}</select></div>
    <div class="form-group"><label>Loại</label><select class="form-control" id="qr_kind" onchange="qrApply()"><option value="">Tất cả</option><option value="asset" ${qrF.kind === "asset" ? "selected" : ""}>TSCĐ</option><option value="ccdc" ${qrF.kind === "ccdc" ? "selected" : ""}>CCDC</option></select></div>
    <div class="form-group"><label>Địa điểm</label><select class="form-control" id="qr_loc" onchange="qrApply()"><option value="">Tất cả</option>${opt(DB.locations || [], qrF.loc, l => l.name)}</select></div>
    <div class="form-group" style="min-width:240px"><label>Mẫu tem / cỡ giấy</label><select class="form-control" id="qr_layout" onchange="qrApply()">${Object.entries(QR_LAYOUTS).map(([k, v]) => `<option value="${k}" ${qrF.layout === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select><div class="small text-muted" style="margin-top:4px">${QR_LAYOUTS[qrF.layout] && QR_LAYOUTS[qrF.layout].roll ? "Khi in: chọn máy in King Jim/Tepra, khổ giấy " + QR_LAYOUTS[qrF.layout].page.replace(" ", " × ") + ", lề 0, tỷ lệ 100%." : "Khi in: khổ A4, lề 0, tỷ lệ 100% (không chọn “Vừa trang”)."}</div></div>
    <button class="btn btn-sm" onclick="qrApply()" style="height:36px">🔍 Lọc</button>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
    <button class="btn btn-primary btn-sm" onclick="qrPrintSel()">🖨️ In tem đã chọn (<span id="qrSelCnt">${qrF.sel.size}</span>)</button>
    <button class="btn btn-sm btn-outline" onclick="qrPrintPage()">🖨️ In cả trang này</button>
    <button class="btn btn-sm btn-outline-secondary" onclick="qrSelAll()">Chọn tất cả theo bộ lọc (${Math.min(list.length, 1000)})</button>
    <button class="btn btn-sm btn-outline-secondary" onclick="qrSelNone()">Bỏ chọn</button>
    <span class="text-muted small">${list.length} tài sản</span></div>
  <div style="overflow:auto"><table><thead><tr><th></th><th>QR</th><th>Mã</th><th>Tên</th><th>Serial</th><th>Phòng ban</th><th>Địa điểm</th></tr></thead><tbody>
  ${rows.map(a => `<tr><td><input type="checkbox" ${qrF.sel.has(a.id) ? "checked" : ""} onchange="qrToggle('${a.id}',this)"></td><td><span class="qr-mini" onclick="qrShow('${a.id}')">${qrSvg(qrUrl(a), 38)}</span></td>
    <td><a data-nav="asset_detail" data-params='{"id":"${a.id}"}'>${esc(a.code)}</a></td><td>${esc(a.name)}</td><td class="mono">${esc(a.serial || "-")}</td><td>${esc(depName(a.department_id) || "-")}</td><td>${esc(locName(a.location_id) || "-")}</td></tr>`).join("") || `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:20px">Không có tài sản phù hợp.</td></tr>`}
  </tbody></table></div>${pagerHtml(list.length, qrF.page, "qrSetPage")}</div>`;
}

async function qrScan() {
  const secure = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (!secure) { modal2(`<h3 style="margin-top:0">📷 Quét QR bằng camera</h3><p>Trình duyệt chỉ cho mở camera trên trang <b>HTTPS</b> (hoặc <code>localhost</code>). Trang này đang chạy HTTP trong mạng nội bộ nên chưa dùng được.</p><p><b>Cách dùng ngay:</b></p><ul><li>Mở ứng dụng <b>Camera</b> của điện thoại, quét tem QR → bấm vào liên kết, hồ sơ tài sản sẽ mở ra (cần đăng nhập).</li><li>Hoặc dùng máy quét mã vạch USB: bấm vào ô “Tra cứu nhanh” rồi quét.</li></ul><div style="text-align:right"><button class="btn" onclick="closeModal2()">Đóng</button></div>`); return; }
  const d = modal2(`<h3 style="margin-top:0">📷 Đưa tem QR vào khung hình</h3><div style="position:relative"><video id="scanVid" playsinline webkit-playsinline muted autoplay style="width:100%;border-radius:12px;background:#000;min-height:220px;object-fit:cover"></video><div style="position:absolute;inset:18% 18%;border:3px solid rgba(255,255,255,.85);border-radius:14px;pointer-events:none"></div></div><div id="scanMsg" class="small text-muted" style="margin:8px 0">Đang mở camera…</div><div style="text-align:right"><button class="btn" onclick="closeModal2()">Đóng</button></div>`);
  const msg = (t) => { const m = document.getElementById("scanMsg"); if (m) m.textContent = t; };
  try {
    window.__scanOn = true;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
    catch (e) { if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) throw e; stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
    window.__scanStream = stream;
    const vid = document.getElementById("scanVid");
    if (!vid) { stream.getTracks().forEach(t => t.stop()); return; }
    vid.setAttribute("playsinline", ""); vid.muted = true; vid.srcObject = stream; await vid.play();
    let det = null;
    if ("BarcodeDetector" in window) { try { det = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { det = null; } }
    if (!det && !window.jsQR) await new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "/js/jsQR.js"; sc.onload = ok; sc.onerror = () => no(new Error("Không tải được bộ giải mã QR (cần mạng lần đầu)")); document.head.appendChild(sc); });
    msg("Giữ tem QR trong khung, cách khoảng 15–25 cm.");
    const cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
    const found = (val) => { window.__scanOn = false; closeModal2(d); qrLookup(val, true); };
    const tick = async () => {
      if (!window.__scanOn || !document.getElementById("scanVid")) return;
      try {
        if (vid.readyState >= 2 && vid.videoWidth) {
          if (det) { const r = await det.detect(vid); if (r.length) return found(r[0].rawValue); }
          else {
            const k = Math.min(1, 640 / vid.videoWidth); cv.width = Math.round(vid.videoWidth * k); cv.height = Math.round(vid.videoHeight * k);
            cx.drawImage(vid, 0, 0, cv.width, cv.height);
            const im = cx.getImageData(0, 0, cv.width, cv.height);
            const r = window.jsQR(im.data, cv.width, cv.height, { inversionAttempts: "attemptBoth" });
            if (r && r.data) return found(r.data);
          }
        }
      } catch (e) { /* khung hình chưa sẵn sàng */ }
      setTimeout(tick, det ? 250 : 200);
    };
    tick();
  } catch (e) {
    const n = e && e.name;
    msg(n === "NotAllowedError" ? "Chưa được cấp quyền camera. Trên iPhone: Cài đặt → Safari → Camera → Cho phép (hoặc bấm “aA” trên thanh địa chỉ → Cài đặt trang web → Camera). Sau đó thử lại." : n === "NotFoundError" ? "Thiết bị không có camera." : "Không mở được camera: " + ((e && e.message) || e));
  }
}

/* ============================================================================
   TÀI SẢN: serial, địa điểm, bảo hành, trạng thái "Chưa sử dụng"
   ============================================================================ */
function warrantyBadge(a) {
  const d = dayDiff(a.warranty_until);
  if (d === null) return `<span class="text-muted">-</span>`;
  const t = fmtDateOnly(a.warranty_until);
  if (d < 0) return `<span class="pill badge-bad">Hết hạn ${t}</span>`;
  if (d <= 30) return `<span class="pill badge-warn">Còn ${d} ngày (${t})</span>`;
  return `<span class="pill badge-ok">Đến ${t}</span>`;
}
function assetExtraRows(a) {
  return `<tr><td class="text-muted">Serial</td><td class="mono">${esc(a.serial || "-")}</td></tr>
          <tr><td class="text-muted">Địa điểm</td><td>${esc(locName(a.location_id) || "-")}</td></tr>
          <tr><td class="text-muted">Bảo hành</td><td>${warrantyBadge(a)}</td></tr>`;
}
function assetFormExtra(a, u) {
  const canStatus = ["admin", "tcth"].includes(u.role);
  return `<div class="col col-6"><div class="form-group"><label>Số serial</label><input class="form-control mono" name="serial" value="${a ? esc(a.serial || "") : ""}" placeholder="VD: 97H2F3"></div></div>
    <div class="col col-6"><div class="form-group"><label>Địa điểm</label><input class="form-control" name="location" list="locList" autocomplete="off" value="${a ? esc(locName(a.location_id) || "") : ""}" placeholder="Nhập địa điểm, VD: Tầng 3 - Phòng họp"><datalist id="locList">${(DB.locations || []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name), "vi")).map(l => `<option value="${esc(l.name)}">`).join("")}</datalist></div></div>
    <div class="col col-6"><div class="form-group"><label>Hết hạn bảo hành</label><input class="form-control" type="date" name="warranty_until" value="${a ? (a.warranty_until || "") : ""}"></div></div>
    ${canStatus ? `<div class="col col-6"><div class="form-group"><label>Trạng thái</label><select class="form-control" name="status">
      ${["in_use", "unused", "broken", "liquidation"].map(s => `<option value="${s}" ${(a ? a.status : "in_use") === s ? "selected" : ""}>${esc(STATUS_LABELS[s])}</option>`).join("")}</select></div></div>` : ""}`;
}
function submit_asset(form) {
  const fd = new FormData(form), id = fd.get("id"), code = (fd.get("code") || "").trim();
  const before = DB.assets.length;
  submit_asset_base(form);
  const a = id ? byId(DB.assets, id) : (DB.assets.length > before ? DB.assets.find(x => x.code === code) : null);
  if (!a) return;
  a.serial = (fd.get("serial") || "").trim();
  { const nm = (fd.get("location") || "").trim(); a.location_id = null;
    if (nm) { DB.locations = DB.locations || []; let l = DB.locations.find(x => normTxt(x.name) === normTxt(nm));
      if (!l) { l = { id: uid(), name: nm, code: "", parent: "", note: "", created_at: nowIso(), updated_at: nowIso() }; DB.locations.push(l); }
      a.location_id = l.id; } }
  a.warranty_until = fd.get("warranty_until") || null;
  const st = fd.get("status");
  if (st && st !== a.status && STATUS_LABELS[st]) { a.status = st; a.status_changed_at = nowIso(); logHistory(a.id, "status_change", "Chuyển trạng thái sang: " + STATUS_LABELS[st]); }
  a.updated_at = nowIso(); saveDB(); render();
}
function locFilterHtml(f) {
  return `<div class="form-group"><label>Địa điểm</label><select id="f_loc" class="form-control" onchange="window.applyAssetFilters()"><option value="">-- Tất cả --</option>
    ${(DB.locations || []).map(l => `<option value="${l.id}" ${f.location_id === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div>`;
}
function bulkLocHtml() {
  return `<div class="row" style="margin-bottom:8px"><div class="col col-4"><label class="small text-muted" style="margin-bottom:4px;display:block">Gán địa điểm:</label>
    <select id="bulkLocation" class="form-control"><option value="">-- Giữ nguyên --</option>${(DB.locations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select></div></div>`;
}
(function wrapBulk() {
  const orig = window.applyBulkActions;
  window.applyBulkActions = function () {
    const sel = document.getElementById("bulkLocation"), locId = sel ? sel.value : "";
    if (locId) {
      const ids = Array.from(document.querySelectorAll(".chkAsset:checked")).map(el => el.value);
      if (!ids.length) { flash("Vui lòng chọn ít nhất 1 tài sản.", "error"); render(); return; }
      let n = 0; const loc = (DB.locations || []).find(l => l.id === locId);
      ids.forEach(id => { const a = byId(DB.assets, id); if (a && a.location_id !== locId) { a.location_id = locId; a.updated_at = nowIso(); logHistory(id, "update", "Gán địa điểm: " + (loc ? loc.name : "")); n++; } });
      const others = ["recatCategory", "reassignDept", "bulkStatus"].some(i => { const e = document.getElementById(i); return e && e.value; });
      if (!others) { saveDB(); flash(`Đã gán địa điểm cho ${n} tài sản.`); render(); return; }
      saveDB();
    }
    return orig && orig();
  };
})();

/* ============================================================================
   ĐỊA ĐIỂM
   ============================================================================ */
const locF = { edit: null };
function viewLocations(u) {
  if (!isStaff2(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const list = (DB.locations || []).slice().sort((a, b) => String(a.parent || "").localeCompare(String(b.parent || "")) || String(a.name).localeCompare(String(b.name)));
  const cnt = {}; DB.assets.forEach(a => { if (a.location_id) cnt[a.location_id] = (cnt[a.location_id] || 0) + 1; });
  const noLoc = DB.assets.filter(a => !a.location_id).length;
  const e = locF.edit === "new" ? {} : (locF.edit ? (DB.locations || []).find(x => x.id === locF.edit) : null);
  const w = canLoc(u);
  const parents = [...new Set(list.map(l => l.parent).filter(Boolean))];
  return `
  <div class="row"><div class="col col-8"><div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap"><h4 style="margin:0">📍 Danh mục địa điểm (${list.length})</h4>
      ${w ? `<div style="display:flex;gap:8px"><button class="btn btn-sm btn-outline" onclick="locFromAddress()" title="Tạo địa điểm từ cột Địa chỉ của tài sản">⚡ Tạo từ trường “Địa chỉ”</button><button class="btn btn-sm btn-primary" onclick="locEdit('new')">➕ Thêm địa điểm</button></div>` : ""}</div>
    <div class="text-muted small" style="margin-bottom:8px">${noLoc} tài sản chưa gán địa điểm.</div>
    <div style="overflow:auto"><table><thead><tr><th>Mã</th><th>Địa điểm</th><th>Thuộc (tòa nhà / chi nhánh)</th><th class="text-end">Số tài sản</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${list.map(l => `<tr><td class="mono">${esc(l.code || "")}</td><td><b>${esc(l.name)}</b></td><td>${esc(l.parent || "")}</td><td class="text-end">${cnt[l.id] ? `<a data-nav="assets" data-params='{"location_id":"${l.id}"}'>${cnt[l.id]}</a>` : 0}</td><td>${esc(l.note || "")}</td>
      <td style="white-space:nowrap">${w ? `<a onclick="locEdit('${l.id}')">✏️ Sửa</a> &nbsp; <a style="color:#dc2626" onclick="locDelete('${l.id}')">🗑️ Xóa</a>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">Chưa có địa điểm. ${w ? "Bấm “Thêm địa điểm” hoặc “Tạo từ trường Địa chỉ”." : ""}</td></tr>`}
    </tbody></table></div></div></div>
  ${w && e ? `<div class="col col-4"><div class="card"><h4 style="margin-top:0">${e.id ? "Sửa địa điểm" : "Thêm địa điểm"}</h4>
    <form data-form="location"><input type="hidden" name="id" value="${esc(e.id || "")}">
      <div class="form-group"><label>Tên địa điểm</label><input class="form-control" name="name" value="${esc(e.name || "")}" required placeholder="VD: Tầng 3 - P.301"></div>
      <div class="form-group"><label>Mã (tùy chọn)</label><input class="form-control" name="code" value="${esc(e.code || "")}"></div>
      <div class="form-group"><label>Thuộc tòa nhà / chi nhánh</label><input class="form-control" name="parent" list="locParents" value="${esc(e.parent || "")}"><datalist id="locParents">${parents.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <div class="form-group"><label>Ghi chú</label><input class="form-control" name="note" value="${esc(e.note || "")}"></div>
      <button class="btn btn-primary" type="submit">💾 Lưu</button> <button type="button" class="btn btn-outline-secondary" onclick="locEdit(null)">Hủy</button></form></div></div>` : ""}
  </div>`;
}
function locEdit(id) { locF.edit = id; render(); }
function submit_location(form) {
  const fd = new FormData(form), id = fd.get("id"), name = (fd.get("name") || "").trim();
  if (!name) return;
  if ((DB.locations || []).some(l => l.id !== id && normTxt(l.name) === normTxt(name))) { flash("Địa điểm “" + name + "” đã tồn tại.", "error"); render(); return; }
  const vals = { name, code: (fd.get("code") || "").trim(), parent: (fd.get("parent") || "").trim(), note: (fd.get("note") || "").trim(), updated_at: nowIso() };
  if (id) Object.assign(byId(DB.locations, id), vals); else DB.locations.push(Object.assign({ id: uid(), created_at: nowIso() }, vals));
  saveDB(); locF.edit = null; flash("Đã lưu địa điểm."); render();
}
function locDelete(id) {
  const l = byId(DB.locations, id); if (!l) return;
  const n = DB.assets.filter(a => a.location_id === id).length;
  if (n) { flash(`Không thể xóa: còn ${n} tài sản đang gán địa điểm “${l.name}”.`, "error"); render(); return; }
  if (!confirm(`Xóa địa điểm “${l.name}”?`)) return;
  DB.locations.splice(DB.locations.indexOf(l), 1); saveDB(); flash("Đã xóa địa điểm."); render();
}
function locFromAddress() {
  const m = new Map();
  DB.assets.forEach(a => { const t = String(a.address || "").trim(); if (t) m.set(normTxt(t), t); });
  if (!m.size) { flash("Không tài sản nào có dữ liệu ở trường Địa chỉ.", "error"); render(); return; }
  if (m.size > 300 && !confirm(`Sẽ tạo tối đa ${m.size} địa điểm khác nhau. Tiếp tục?`)) return;
  const byKey = new Map((DB.locations || []).map(l => [normTxt(l.name), l]));
  let created = 0, assigned = 0;
  m.forEach((name, key) => { if (!byKey.has(key)) { const l = { id: uid(), name, code: "", parent: "", note: "Tạo từ trường Địa chỉ", created_at: nowIso(), updated_at: nowIso() }; DB.locations.push(l); byKey.set(key, l); created++; } });
  DB.assets.forEach(a => { const t = String(a.address || "").trim(); if (t && !a.location_id) { a.location_id = byKey.get(normTxt(t)).id; a.updated_at = nowIso(); assigned++; } });
  saveDB(); flash(`Đã tạo ${created} địa điểm và gán cho ${assigned} tài sản.`); render();
}

/* ============================================================================
   PHỤ KIỆN (kho + cấp phát / thu hồi theo số lượng)
   ============================================================================ */
const accOut = x => (x.assignments || []).filter(s => !s.returned_at).reduce((t, s) => t + (Number(s.qty) || 0), 0);
function accAvail(x) { return (Number(x.quantity) || 0) - accOut(x); }
const accF = { edit: null };
function viewAccessories(u) {
  if (!canStock(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const list = (DB.accessories || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const e = accF.edit === "new" ? {} : (accF.edit ? byId(DB.accessories, accF.edit) : null);
  return `
  <div class="row"><div class="col col-8"><div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4 style="margin:0">🧩 Kho phụ kiện (${list.length} loại)</h4><div style="display:flex;gap:8px"><button class="btn btn-sm btn-outline-secondary" onclick="accExport()">⬇ CSV</button><button class="btn btn-sm btn-primary" onclick="accEdit('new')">➕ Thêm phụ kiện</button></div></div>
    <div style="overflow:auto"><table><thead><tr><th>Mã</th><th>Phụ kiện</th><th>Loại</th><th class="text-end">Tổng</th><th class="text-end">Đang cấp</th><th class="text-end">Còn kho</th><th>Địa điểm</th><th></th></tr></thead><tbody>
    ${list.map(x => { const av = accAvail(x), low = Number(x.min_qty) > 0 && av <= Number(x.min_qty); return `<tr><td class="mono">${esc(x.code || "")}</td><td><a data-nav="accessory_detail" data-params='{"id":"${x.id}"}'><b>${esc(x.name)}</b></a></td><td>${esc(x.type || "")}</td>
      <td class="text-end">${Number(x.quantity) || 0} ${esc(x.unit || "")}</td><td class="text-end">${accOut(x)}</td><td class="text-end"><span class="pill ${low ? "badge-bad" : "badge-ok"}" title="${low ? "Dưới mức tối thiểu " + x.min_qty : ""}">${av}</span></td><td>${esc(locName(x.location_id) || "-")}</td>
      <td style="white-space:nowrap"><a data-nav="accessory_detail" data-params='{"id":"${x.id}"}'>Cấp phát</a> &nbsp; <a onclick="accEdit('${x.id}')">✏️</a> &nbsp; <a style="color:#dc2626" onclick="accDelete('${x.id}')">🗑️</a></td></tr>`; }).join("") || `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:20px">Chưa có phụ kiện. Bấm “Thêm phụ kiện”.</td></tr>`}
    </tbody></table></div></div></div>
  ${e ? `<div class="col col-4"><div class="card"><h4 style="margin-top:0">${e.id ? "Sửa phụ kiện" : "Thêm phụ kiện"}</h4><form data-form="accessory"><input type="hidden" name="id" value="${esc(e.id || "")}">
    <div class="form-group"><label>Tên phụ kiện</label><input class="form-control" name="name" value="${esc(e.name || "")}" required placeholder="VD: Chuột không dây"></div>
    <div class="row"><div class="col col-6"><div class="form-group"><label>Mã</label><input class="form-control" name="code" value="${esc(e.code || "")}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Loại</label><input class="form-control" name="type" value="${esc(e.type || "")}" placeholder="Chuột, bàn phím…"></div></div>
      <div class="col col-6"><div class="form-group"><label>Tổng số lượng</label><input class="form-control" type="number" min="0" name="quantity" value="${Number(e.quantity) || 0}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Đơn vị</label><input class="form-control" name="unit" value="${esc(e.unit || "cái")}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Tồn tối thiểu (cảnh báo)</label><input class="form-control" type="number" min="0" name="min_qty" value="${Number(e.min_qty) || 0}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Nơi để kho</label><select class="form-control" name="location_id"><option value="">--</option>${(DB.locations || []).map(l => `<option value="${l.id}" ${e.location_id === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div></div></div>
    <div class="form-group"><label>Ghi chú</label><input class="form-control" name="note" value="${esc(e.note || "")}"></div>
    <button class="btn btn-primary" type="submit">💾 Lưu</button> <button type="button" class="btn btn-outline-secondary" onclick="accEdit(null)">Hủy</button></form></div></div>` : ""}</div>`;
}
function accEdit(id) { accF.edit = id; render(); }
function submit_accessory(form) {
  const fd = new FormData(form), id = fd.get("id"), name = (fd.get("name") || "").trim(); if (!name) return;
  const qty = Math.max(0, parseInt(fd.get("quantity")) || 0);
  const vals = { name, code: (fd.get("code") || "").trim(), type: (fd.get("type") || "").trim(), quantity: qty, unit: (fd.get("unit") || "cái").trim(), min_qty: Math.max(0, parseInt(fd.get("min_qty")) || 0), location_id: fd.get("location_id") || null, note: (fd.get("note") || "").trim(), updated_at: nowIso() };
  if (id) { const x = byId(DB.accessories, id); if (qty < accOut(x)) { flash(`Tổng số lượng không được nhỏ hơn số đang cấp (${accOut(x)}).`, "error"); render(); return; } Object.assign(x, vals); }
  else DB.accessories.push(Object.assign({ id: uid(), assignments: [], created_at: nowIso() }, vals));
  saveDB(); accF.edit = null; flash("Đã lưu phụ kiện."); render();
}
function accDelete(id) {
  const x = byId(DB.accessories, id); if (!x) return;
  if (accOut(x)) { flash("Không thể xóa: phụ kiện đang được cấp cho người dùng / phòng ban / tài sản.", "error"); render(); return; }
  if (!confirm(`Xóa phụ kiện “${x.name}” và toàn bộ lịch sử cấp phát?`)) return;
  DB.accessories.splice(DB.accessories.indexOf(x), 1); saveDB(); flash("Đã xóa."); render();
}
function accExport() {
  const q = s => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
  downloadCSV(["Mã,Tên,Loại,Tổng,Đang cấp,Còn kho,Đơn vị,Tồn tối thiểu,Địa điểm"].concat((DB.accessories || []).map(x => [x.code, x.name, x.type, x.quantity, accOut(x), accAvail(x), x.unit, x.min_qty, locName(x.location_id) || ""].map(q).join(","))), "phu-kien");
}
function viewAccessoryDetail(u) {
  if (!canStock(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const x = byId(DB.accessories, state.params.id); if (!x) return `<div class="alert alert-error">Không tìm thấy phụ kiện.</div>`;
  const hist = (x.assignments || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
  <div class="top-actions"><div><h2 style="margin:0 0 4px">🧩 ${esc(x.name)}</h2><span class="text-muted">${esc(x.type || "")} · Tổng ${Number(x.quantity) || 0} ${esc(x.unit || "")} · Đang cấp ${accOut(x)} · <b>Còn kho ${accAvail(x)}</b></span></div><a class="btn btn-sm btn-outline-secondary" data-nav="accessories">← Danh sách</a></div>
  <div class="row"><div class="col col-4"><div class="card"><h4 style="margin-top:0">Cấp phát</h4><form data-form="acc_assign"><input type="hidden" name="id" value="${x.id}">
    <div class="form-group"><label>Người sử dụng</label><select class="form-control" name="to_user"><option value="">--</option>${DB.users.filter(us => us.is_active !== false).map(us => `<option value="${us.id}">${esc(us.full_name)}</option>`).join("")}</select></div>
    <div class="form-group"><label>hoặc Phòng ban</label><select class="form-control" name="to_dept"><option value="">--</option>${DB.departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
    <div class="form-group"><label>hoặc Gắn vào tài sản (mã)</label><input class="form-control" name="to_asset" placeholder="VD: PC-0001"></div>
    <div class="row"><div class="col col-6"><div class="form-group"><label>Số lượng</label><input class="form-control" type="number" min="1" max="${Math.max(accAvail(x), 1)}" name="qty" value="1"></div></div></div>
    <div class="form-group"><label>Ghi chú</label><input class="form-control" name="note"></div>
    <button class="btn btn-primary" type="submit" ${accAvail(x) <= 0 ? "disabled" : ""}>📤 Cấp phát</button></form></div></div>
  <div class="col col-8"><div class="card"><h4 style="margin-top:0">Lịch sử cấp phát / thu hồi</h4><div style="overflow:auto"><table><thead><tr><th>Ngày</th><th>Cho</th><th class="text-end">SL</th><th>Người thực hiện</th><th>Ghi chú</th><th>Tình trạng</th></tr></thead><tbody>
    ${hist.map(s => `<tr><td class="text-nowrap">${fmtDateTime(s.date)}</td><td>${esc(s.to_label)}</td><td class="text-end">${s.qty}</td><td>${esc(s.by_name || "")}</td><td>${esc(s.note || "")}</td>
      <td>${s.returned_at ? `<span class="pill badge-gray">Đã thu hồi ${fmtDateOnly(s.returned_at)}</span>` : `<button class="btn btn-sm btn-outline" onclick="accReturn('${x.id}','${s.id}')">↩ Thu hồi</button>`}</td></tr>`).join("") || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:18px">Chưa có lần cấp phát nào.</td></tr>`}
  </tbody></table></div></div></div></div>`;
}
function submit_acc_assign(form) {
  const fd = new FormData(form), x = byId(DB.accessories, fd.get("id")), u = currentUser(); if (!x) return;
  const qty = parseInt(fd.get("qty")) || 0, uId = fd.get("to_user"), dId = fd.get("to_dept"), aCode = (fd.get("to_asset") || "").trim();
  if (qty < 1) { flash("Số lượng không hợp lệ.", "error"); render(); return; }
  if (qty > accAvail(x)) { flash(`Chỉ còn ${accAvail(x)} trong kho.`, "error"); render(); return; }
  if (!uId && !dId && !aCode) { flash("Hãy chọn người nhận, phòng ban hoặc tài sản.", "error"); render(); return; }
  const rec = { id: uid(), qty, date: nowIso(), by: u.id, by_name: u.full_name, note: (fd.get("note") || "").trim(), returned_at: null };
  if (aCode) { const a = DB.assets.find(t => String(t.code).toLowerCase() === aCode.toLowerCase()); if (!a) { flash("Không tìm thấy tài sản có mã " + aCode, "error"); render(); return; } rec.to_asset_id = a.id; rec.to_label = "Tài sản " + a.code + " - " + a.name; }
  else if (uId) { rec.to_user_id = uId; rec.to_label = userName(uId); }
  else { rec.to_dept_id = dId; rec.to_label = "Phòng " + depName(dId); }
  x.assignments = x.assignments || []; x.assignments.push(rec); x.updated_at = nowIso();
  saveDB(); flash(`Đã cấp ${qty} ${x.unit || ""} “${x.name}” cho ${rec.to_label}.`); render();
}
function accReturn(accId, asId) {
  const x = byId(DB.accessories, accId), s = x && (x.assignments || []).find(t => t.id === asId); if (!s) return;
  if (!confirm(`Thu hồi ${s.qty} ${x.unit || ""} từ ${s.to_label}?`)) return;
  s.returned_at = nowIso(); x.updated_at = nowIso(); saveDB(); flash("Đã thu hồi về kho."); render();
}

/* ============================================================================
   PHẦN MỀM & BẢN QUYỀN (cài đặt trên tài sản, đếm số bản quyền, hết hạn)
   ============================================================================ */
const swUsed = s => (s.installs || []).length;
const swF = { edit: null, reveal: false };
const SW_TYPES = ["Bản quyền vĩnh viễn", "Thuê bao (theo năm)", "Miễn phí / mã nguồn mở"];
function swExpBadge(s) {
  const d = dayDiff(s.expires_at); if (d === null) return `<span class="text-muted">-</span>`;
  const t = fmtDateOnly(s.expires_at);
  return d < 0 ? `<span class="pill badge-bad">Hết hạn ${t}</span>` : d <= 30 ? `<span class="pill badge-warn">Còn ${d} ngày</span>` : `<span class="pill badge-ok">${t}</span>`;
}
function viewSoftware(u) {
  if (!canStock(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const list = (DB.software || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const e = swF.edit === "new" ? {} : (swF.edit ? byId(DB.software, swF.edit) : null);
  return `
  <div class="row"><div class="col col-8"><div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4 style="margin:0">💿 Phần mềm & bản quyền (${list.length})</h4><div style="display:flex;gap:8px"><button class="btn btn-sm btn-outline-secondary" onclick="swExport()">⬇ CSV</button><button class="btn btn-sm btn-primary" onclick="swEdit('new')">➕ Thêm phần mềm</button></div></div>
    <div style="overflow:auto"><table><thead><tr><th>Phần mềm</th><th>Nhà cung cấp</th><th>Loại bản quyền</th><th>Đã dùng / Tổng</th><th>Hết hạn</th><th></th></tr></thead><tbody>
    ${list.map(s => { const used = swUsed(s), tot = Number(s.seats) || 0, over = tot > 0 && used > tot; return `<tr><td><a data-nav="software_detail" data-params='{"id":"${s.id}"}'><b>${esc(s.name)}</b></a> <span class="text-muted small">${esc(s.version || "")}</span></td><td>${esc(s.vendor || "")}</td><td>${esc(s.license_type || "")}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="bar-sm"><i style="width:${tot ? Math.min(100, used / tot * 100) : 0}%;background:${over ? "#ef4444" : "#3b82f6"}"></i></div><span class="small">${used}${tot ? " / " + tot : ""}</span></div></td><td>${swExpBadge(s)}</td>
      <td style="white-space:nowrap"><a data-nav="software_detail" data-params='{"id":"${s.id}"}'>Chi tiết</a> &nbsp; <a onclick="swEdit('${s.id}')">✏️</a> &nbsp; <a style="color:#dc2626" onclick="swDelete('${s.id}')">🗑️</a></td></tr>`; }).join("") || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">Chưa có phần mềm nào.</td></tr>`}
    </tbody></table></div></div></div>
  ${e ? `<div class="col col-4"><div class="card"><h4 style="margin-top:0">${e.id ? "Sửa phần mềm" : "Thêm phần mềm"}</h4><form data-form="software"><input type="hidden" name="id" value="${esc(e.id || "")}">
    <div class="form-group"><label>Tên phần mềm</label><input class="form-control" name="name" value="${esc(e.name || "")}" required placeholder="VD: Microsoft Office 2021"></div>
    <div class="row"><div class="col col-6"><div class="form-group"><label>Phiên bản</label><input class="form-control" name="version" value="${esc(e.version || "")}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Nhà cung cấp</label><input class="form-control" name="vendor" value="${esc(e.vendor || "")}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Loại bản quyền</label><select class="form-control" name="license_type">${SW_TYPES.map(t => `<option ${e.license_type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
      <div class="col col-6"><div class="form-group"><label>Số bản quyền (seat)</label><input class="form-control" type="number" min="0" name="seats" value="${Number(e.seats) || 0}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Ngày hết hạn</label><input class="form-control" type="date" name="expires_at" value="${esc(e.expires_at || "")}"></div></div>
      <div class="col col-6"><div class="form-group"><label>Chi phí (VNĐ)</label><input class="form-control number-format" name="cost" value="${Number(e.cost || 0).toLocaleString("vi-VN")}"></div></div></div>
    <div class="form-group"><label>Khóa bản quyền / key (chỉ IT, TCTH, Admin xem được)</label><input class="form-control mono" name="license_key" value="${esc(e.license_key || "")}" autocomplete="off"></div>
    <div class="form-group"><label>Ghi chú</label><input class="form-control" name="note" value="${esc(e.note || "")}"></div>
    <button class="btn btn-primary" type="submit">💾 Lưu</button> <button type="button" class="btn btn-outline-secondary" onclick="swEdit(null)">Hủy</button></form></div></div>` : ""}</div>`;
}
function swEdit(id) { swF.edit = id; render(); }
function submit_software(form) {
  const fd = new FormData(form), id = fd.get("id"), name = (fd.get("name") || "").trim(); if (!name) return;
  const vals = { name, version: (fd.get("version") || "").trim(), vendor: (fd.get("vendor") || "").trim(), license_type: fd.get("license_type"), seats: Math.max(0, parseInt(fd.get("seats")) || 0), expires_at: fd.get("expires_at") || null, cost: parseFloat(String(fd.get("cost") || "0").replace(/\./g, "").replace(/,/g, ".")) || 0, license_key: (fd.get("license_key") || "").trim(), note: (fd.get("note") || "").trim(), updated_at: nowIso() };
  if (id) Object.assign(byId(DB.software, id), vals); else DB.software.push(Object.assign({ id: uid(), installs: [], created_at: nowIso() }, vals));
  saveDB(); swF.edit = null; flash("Đã lưu phần mềm."); render();
}
function swDelete(id) {
  const s = byId(DB.software, id); if (!s) return;
  if (!confirm(`Xóa phần mềm “${s.name}” và danh sách ${swUsed(s)} máy đã cài?`)) return;
  DB.software.splice(DB.software.indexOf(s), 1); saveDB(); flash("Đã xóa."); render();
}
function swExport() {
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  downloadCSV(["Phần mềm,Phiên bản,Nhà cung cấp,Loại,Số bản quyền,Đã cài,Hết hạn,Chi phí"].concat((DB.software || []).map(s => [s.name, s.version, s.vendor, s.license_type, s.seats, swUsed(s), s.expires_at || "", s.cost].map(q).join(","))), "phan-mem");
}
function viewSoftwareDetail(u) {
  if (!canStock(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const s = byId(DB.software, state.params.id); if (!s) return `<div class="alert alert-error">Không tìm thấy phần mềm.</div>`;
  const used = swUsed(s), tot = Number(s.seats) || 0;
  return `
  <div class="top-actions"><div><h2 style="margin:0 0 4px">💿 ${esc(s.name)} <small class="text-muted">${esc(s.version || "")}</small></h2><span class="text-muted">${esc(s.vendor || "")} · ${esc(s.license_type || "")} · Đã cài ${used}${tot ? " / " + tot : ""} · Hết hạn: </span>${swExpBadge(s)}</div><a class="btn btn-sm btn-outline-secondary" data-nav="software">← Danh sách</a></div>
  ${tot && used > tot ? `<div class="alert alert-error">⚠️ Số máy đã cài (${used}) vượt số bản quyền (${tot}).</div>` : ""}
  <div class="row"><div class="col col-4"><div class="card"><h4 style="margin-top:0">Khóa bản quyền</h4>
    <div class="mono" style="word-break:break-all">${s.license_key ? (swF.reveal ? esc(s.license_key) : "••••••••••••") : "<span class='text-muted'>Chưa nhập</span>"}</div>
    ${s.license_key ? `<button class="btn btn-sm btn-outline-secondary" style="margin-top:8px" onclick="swF.reveal=!swF.reveal;render()">${swF.reveal ? "Ẩn" : "Hiện"} khóa</button>` : ""}
    ${s.note ? `<p class="text-muted small" style="margin-top:10px">${esc(s.note)}</p>` : ""}</div>
    <div class="card"><h4 style="margin-top:0">Ghi nhận cài đặt</h4><form data-form="sw_install"><input type="hidden" name="id" value="${s.id}">
      <div class="form-group"><label>Mã tài sản (máy được cài)</label><input class="form-control" name="code" placeholder="VD: PC-0001" required></div><button class="btn btn-primary" type="submit">➕ Thêm</button></form></div></div>
  <div class="col col-8"><div class="card"><h4 style="margin-top:0">Danh sách máy đã cài (${used})</h4><div style="overflow:auto"><table><thead><tr><th>Mã TS</th><th>Tên</th><th>Người dùng</th><th>Phòng ban</th><th>Ngày ghi nhận</th><th></th></tr></thead><tbody>
    ${(s.installs || []).map(i => { const a = byId(DB.assets, i.asset_id); return `<tr><td>${a ? `<a data-nav="asset_detail" data-params='{"id":"${a.id}"}'>${esc(a.code)}</a>` : "(đã xóa)"}</td><td>${esc(a ? a.name : "")}</td><td>${esc(a ? userName(a.current_user_id) || "-" : "")}</td><td>${esc(a ? depName(a.department_id) || "-" : "")}</td><td>${fmtDateOnly(i.date)}</td><td><a style="color:#dc2626" onclick="swUninstall('${s.id}','${i.asset_id}')">Gỡ</a></td></tr>`; }).join("") || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:18px">Chưa ghi nhận máy nào.</td></tr>`}
  </tbody></table></div></div></div></div>`;
}
function submit_sw_install(form) {
  const fd = new FormData(form), s = byId(DB.software, fd.get("id")), code = (fd.get("code") || "").trim(); if (!s) return;
  const a = DB.assets.find(t => String(t.code).toLowerCase() === code.toLowerCase());
  if (!a) { flash("Không tìm thấy tài sản có mã " + code, "error"); render(); return; }
  s.installs = s.installs || [];
  if (s.installs.some(i => i.asset_id === a.id)) { flash("Tài sản này đã được ghi nhận cài phần mềm.", "error"); render(); return; }
  if (Number(s.seats) > 0 && swUsed(s) >= Number(s.seats)) { flash(`Đã dùng hết ${s.seats} bản quyền. Hãy tăng số bản quyền trước khi thêm.`, "error"); render(); return; }
  s.installs.push({ asset_id: a.id, date: nowIso() }); s.updated_at = nowIso();
  logHistory(a.id, "update", "Cài phần mềm: " + s.name); saveDB(); flash(`Đã ghi nhận ${s.name} cài trên ${a.code}.`); render();
}
function swUninstall(sid, aid) {
  const s = byId(DB.software, sid); if (!s) return; if (!confirm("Gỡ ghi nhận cài đặt này?")) return;
  s.installs = (s.installs || []).filter(i => i.asset_id !== aid); s.updated_at = nowIso(); logHistory(aid, "update", "Gỡ phần mềm: " + s.name); saveDB(); flash("Đã gỡ."); render();
}

/* ---------- Thẻ bổ sung trong hồ sơ tài sản ---------- */
function assetExtraCards(a, u) {
  const url = qrUrl(a);
  const sw = isStaff2(u) ? (DB.software || []).filter(s => (s.installs || []).some(i => i.asset_id === a.id)) : [];
  const acc = isStaff2(u) ? (DB.accessories || []).flatMap(x => (x.assignments || []).filter(s => !s.returned_at && (s.to_asset_id === a.id || (a.current_user_id && s.to_user_id === a.current_user_id))).map(s => ({ x, s }))) : [];
  return `
  <div class="row"><div class="col col-4"><div class="card"><h4 style="margin-top:0">🔳 Mã QR tài sản</h4><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span style="display:block;width:120px">${qrSvg(qrPayload(a), 120)}</span>
    <div style="min-width:0"><div class="mono small text-muted" style="word-break:break-all;margin-bottom:8px">${esc(url)}</div><button class="btn btn-sm btn-outline" onclick="qrPrintDialog('${a.id}')">🏷️ In tem</button></div></div></div></div>
  ${isStaff2(u) ? `<div class="col col-8"><div class="card"><h4 style="margin-top:0">💿 Phần mềm đã cài (${sw.length}) · 🧩 Phụ kiện đang dùng (${acc.length})</h4>
    ${sw.length || acc.length ? `<ul style="margin:0;padding-left:18px">${sw.map(s => `<li><a data-nav="software_detail" data-params='{"id":"${s.id}"}'>${esc(s.name)}</a> ${esc(s.version || "")}</li>`).join("")}${acc.map(({ x, s }) => `<li><a data-nav="accessory_detail" data-params='{"id":"${x.id}"}'>${esc(x.name)}</a> × ${s.qty} <span class="text-muted small">(${esc(s.to_label)})</span></li>`).join("")}</ul>` : `<p class="text-muted" style="margin:0">Chưa ghi nhận phần mềm / phụ kiện cho tài sản này.</p>`}</div></div>` : ""}</div>`;
}

/* ============================================================================
   NHẬT KÝ CÔNG VIỆC IT: khai báo trên web (song song với ghi qua Telegram)
   ============================================================================ */
const IT_CATS = ["Sự cố phần cứng", "Phần mềm / Hệ điều hành", "Mạng / Internet", "Máy in / Thiết bị ngoại vi", "Cài đặt / Cấu hình", "Bảo trì định kỳ", "Tài khoản / Phân quyền", "Hỗ trợ người dùng", "Khác"];
const IT_RESULTS = { done: ["Hoàn thành", "#16a34a"], doing: ["Đang xử lý", "#2563eb"], waiting: ["Chờ linh kiện / phản hồi", "#d97706"], escalated: ["Chuyển tuyến / đơn vị ngoài", "#7c3aed"], failed: ["Chưa khắc phục được", "#dc2626"] };
const itF = { edit: null, view: null, q: "", dept: "", result: "", cat: "", from: "", to: "", page: 1 };
const canIt = u => ["admin", "tcth", "it"].includes(u.role);
const itWhen = w => w.started_at || w.created_at || "";
const itMs = w => Number(w.ts_ms) || Date.parse(itWhen(w)) || 0;
const itResultOf = w => w.result || (w.status === "done" ? "done" : "");
const itBadge = w => { const r = IT_RESULTS[itResultOf(w)]; return r ? `<span style="background:${r[1]}1a;color:${r[1]};padding:2px 8px;border-radius:99px;font-size:12px;white-space:nowrap">${r[0]}</span>` : `<span class="text-muted small">-</span>`; };
const itLocal = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const itDay = ms => { const d = new Date(ms), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const itCanEdit = (u, w) => u.role === "admin" || (canIt(u) && w.source === "web" && w.it_user_id === u.id);

function itFiltered() {
  const q = normTxt(itF.q).trim();
  return (DB.worklogs || []).filter(w => {
    if (itF.dept && w.department_id !== itF.dept) return false;
    if (itF.result && itResultOf(w) !== itF.result) return false;
    if (itF.cat && w.category !== itF.cat) return false;
    const ms = itMs(w);
    if (itF.from && itDay(ms) < itF.from) return false;
    if (itF.to && itDay(ms) > itF.to) return false;
    if (q && !q.split(/\s+/).every(t => normTxt([w.asset_code, w.asset_name, w.title, w.description, w.cause, w.solution, w.it_user, w.requester_name, w.category, w.ticket_code, w.id].join(" ")).includes(t))) return false;
    return true;
  }).sort((a, b) => itMs(b) - itMs(a));
}
function itApply() {
  const g = id => { const e = document.getElementById(id); return e ? e.value : ""; };
  itF.q = g("itlogSearch"); itF.dept = g("it_f_dept"); itF.result = g("it_f_res"); itF.cat = g("it_f_cat"); itF.from = g("it_f_from"); itF.to = g("it_f_to"); itF.page = 1; render();
  const e = document.getElementById("itlogSearch"); if (e && itF.q) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
}
function itReset() { Object.assign(itF, { q: "", dept: "", result: "", cat: "", from: "", to: "", page: 1 }); render(); }
function itNew() { itF.edit = "new"; itF.view = null; render(); window.scrollTo(0, 0); }
function itEdit(id) { itF.edit = id; itF.view = null; render(); window.scrollTo(0, 0); }
function itView(id) { itF.view = itF.view === id ? null : id; render(); }
function itCancel() { itF.edit = null; render(); }
function itPage(p) { itF.page = Number(p) || 1; render(); }
function itCalc() {
  const s = document.getElementById("it_start"), e = document.getElementById("it_end"), d = document.getElementById("it_dur");
  if (!s || !e || !d || !s.value || !e.value) return;
  const m = Math.round((new Date(e.value) - new Date(s.value)) / 60000);
  d.value = m >= 0 ? m : "";
}
function itReqChange(sel) {
  const us = byId(DB.users, sel.value), dep = document.getElementById("it_dept");
  if (us && us.department_id && dep && !dep.value) dep.value = us.department_id;
}
function itDelete(id) {
  const u = currentUser(), w = byId(DB.worklogs, id); if (!w || !itCanEdit(u, w)) return;
  if (!confirm("Xóa nhật ký “" + (w.title || w.description || w.id) + "”?")) return;
  DB.worklogs.splice(DB.worklogs.indexOf(w), 1); itF.view = null; saveDB(); flash("Đã xóa nhật ký."); render();
}
function itExport() {
  const rows = itFiltered(), q = v => csvEscape(v == null ? "" : v);
  const lines = [["Mã", "Bắt đầu", "Kết thúc", "Phút", "Loại", "Công việc", "Phòng ban", "Người yêu cầu", "Mã tài sản", "Nguyên nhân", "Hướng xử lý", "Kết quả", "Người IT", "Nguồn", "Ghi chú"].map(q).join(",")];
  rows.forEach(w => lines.push([w.id, fmtDateTime(itWhen(w)), fmtDateTime(w.ended_at), w.duration_min || 0, w.category, w.title || w.description, depName(w.department_id), w.requester_name, w.asset_code, w.cause, w.solution, (IT_RESULTS[itResultOf(w)] || [""])[0], w.it_user, w.source === "web" ? "Web" : "Telegram", w.note].map(q).join(",")));
  downloadCSV(lines, "nhat_ky_it");
}

function itForm(u) {
  const w = itF.edit === "new" ? { source: "web", started_at: new Date().toISOString(), result: "done", it_user_id: u.id } : byId(DB.worklogs, itF.edit);
  if (!w) { itF.edit = null; return ""; }
  const deps = DB.departments.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const its = (DB.users || []).filter(x => x.is_active !== false && ["admin", "tcth", "it"].includes(x.role));
  const reqs = (DB.users || []).filter(x => x.is_active !== false).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const o = (v, sel, t) => `<option value="${esc(v)}" ${String(v) === String(sel ?? "") ? "selected" : ""}>${esc(t)}</option>`;
  const F = (label, inner, wide) => `<div class="form-group" style="${wide ? "grid-column:1/-1" : ""}"><label>${label}</label>${inner}</div>`;
  const ta = (name, v, ph) => `<textarea class="form-control" name="${name}" rows="3" placeholder="${ph}">${esc(v || "")}</textarea>`;
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px"><h4 style="margin:0">${itF.edit === "new" ? "➕ Tạo nhật ký công việc IT" : "✏️ Sửa nhật ký " + esc(w.id)}</h4><button class="btn btn-outline-secondary btn-sm" onclick="itCancel()">✖ Đóng</button></div>
  <form data-form="itlog"><input type="hidden" name="id" value="${esc(itF.edit === "new" ? "" : w.id)}">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0 16px">
      ${F("Công việc / tiêu đề *", `<input class="form-control" name="title" required value="${esc(w.title || w.description || "")}" placeholder="VD: Máy tính không lên nguồn">`, true)}
      ${F("Loại công việc", `<select class="form-control" name="category">${IT_CATS.map(c => o(c, w.category || "", c)).join("")}${w.category && !IT_CATS.includes(w.category) ? o(w.category, w.category, w.category) : ""}</select>`)}
      ${F("Người thực hiện (IT)", `<select class="form-control" name="it_user_id">${its.map(x => o(x.id, w.it_user_id || u.id, x.full_name)).join("")}</select>`)}
      ${F("Người yêu cầu / user được hỗ trợ", `<select class="form-control" name="requester_id" onchange="itReqChange(this)"><option value="">-- Không chọn --</option>${reqs.map(x => o(x.id, w.requester_id, x.full_name + (x.username ? " (" + x.username + ")" : ""))).join("")}</select>`)}
      ${F("Hoặc nhập tên người yêu cầu", `<input class="form-control" name="requester_name_free" value="${esc(w.requester_id ? "" : w.requester_name || "")}" placeholder="Nếu không có trong danh sách">`)}
      ${F("Phòng ban được xử lý", `<select class="form-control" name="department_id" id="it_dept"><option value="">-- Chọn phòng ban --</option>${deps.map(d => o(d.id, w.department_id, d.name)).join("")}</select>`)}
      ${F("Mã tài sản liên quan (nếu có)", `<input class="form-control" name="asset_code" value="${esc(w.asset_code || "")}" placeholder="VD: TS-0001" onkeydown="if(event.key==='Enter')event.preventDefault()">`)}
      ${F("Serial thiết bị (nếu có)", `<input class="form-control" name="serial" value="${esc(w.serial || "")}">`)}
      ${F("Thời điểm báo sự cố", `<input class="form-control" type="datetime-local" name="reported_at" value="${itLocal(w.reported_at)}">`)}
      ${F("Mã phiếu (nếu có)", `<input class="form-control" name="ticket_code" value="${esc(w.ticket_code || "")}">`)}
      ${F("Thời gian bắt đầu *", `<input class="form-control" type="datetime-local" name="started_at" id="it_start" required value="${itLocal(w.started_at || w.created_at)}" onchange="itCalc()">`)}
      ${F("Thời gian kết thúc", `<input class="form-control" type="datetime-local" name="ended_at" id="it_end" value="${itLocal(w.ended_at)}" onchange="itCalc()">`)}
      ${F("Thời lượng (phút)", `<input class="form-control" type="number" min="0" name="duration_min" id="it_dur" value="${esc(w.duration_min ?? "")}" placeholder="Tự tính từ bắt đầu – kết thúc">`)}
      ${F("Kết quả", `<select class="form-control" name="result">${Object.entries(IT_RESULTS).map(([k, v]) => o(k, itResultOf(w) || "done", v[0])).join("")}</select>`)}
      ${F("Nguyên nhân", ta("cause", w.cause, "Nguyên nhân sự cố / yêu cầu"), true)}
      ${F("Hướng xử lý / công việc đã thực hiện", ta("solution", w.solution, "Các bước đã làm / giải pháp"), true)}
      ${F("Khuyến nghị / ghi chú", ta("note", w.note, "Khuyến nghị thay thế, bảo trì, theo dõi tiếp…"), true)}
    </div>
    <button class="btn btn-primary" type="submit">💾 Lưu nhật ký</button> <button type="button" class="btn btn-outline-secondary" onclick="itCancel()">Hủy</button>
  </form></div>`;
}

function submit_itlog(form) {
  const u = currentUser(), fd = new FormData(form), id = fd.get("id"), g = k => String(fd.get(k) || "").trim();
  const title = g("title"); if (!title) return;
  const st = g("started_at"), en = g("ended_at");
  if (!st) { flash("Cần nhập thời gian bắt đầu.", "error"); render(); return; }
  if (en && new Date(en) < new Date(st)) { flash("Thời gian kết thúc phải sau thời gian bắt đầu.", "error"); render(); return; }
  let asset = null; const code = g("asset_code");
  if (code) { asset = qrFind(code); if (!asset) { flash("Không tìm thấy tài sản có mã “" + code + "”.", "error"); render(); return; } }
  const itu = byId(DB.users, g("it_user_id")) || u, req = byId(DB.users, g("requester_id"));
  let dur = fd.get("duration_min") === "" || fd.get("duration_min") == null ? null : Number(fd.get("duration_min"));
  if (dur == null && en) dur = Math.max(0, Math.round((new Date(en) - new Date(st)) / 60000));
  const result = g("result") || "done";
  const startIso = new Date(st).toISOString();
  const vals = {
    title, description: title, category: g("category"), it_user_id: itu.id, it_user: itu.full_name,
    requester_id: req ? req.id : null, requester_name: req ? req.full_name : g("requester_name_free"),
    department_id: g("department_id") || (req && req.department_id) || null,
    asset_id: asset ? asset.id : null, asset_code: asset ? asset.code : "", asset_name: asset ? asset.name : "",
    ticket_code: g("ticket_code") || null, serial: g("serial") || (asset && asset.serial) || "", reported_at: g("reported_at") ? new Date(g("reported_at")).toISOString() : null, started_at: startIso, ended_at: en ? new Date(en).toISOString() : null, ts_ms: Date.parse(startIso),
    duration_min: dur || 0, cause: g("cause"), solution: g("solution"), result, status: result === "done" ? "done" : "open", note: g("note"), updated_at: nowIso(),
  };
  if (id) { const w = byId(DB.worklogs, id); if (!w || !itCanEdit(u, w)) return; Object.assign(w, vals); }
  else {
    const nid = "WL-W" + Date.now().toString(36).toUpperCase();
    DB.worklogs.push(Object.assign({ id: nid, created_at: nowIso(), source: "web" }, vals));
    if (asset) logHistory(asset.id, "it_work", `IT ghi nhật ký (${vals.category}): ${title}${dur ? ` — ${dur} phút` : ""}`);
  }
  saveDB(); itF.edit = null; flash("Đã lưu nhật ký công việc."); render();
}

function itDetail(w, u) {
  const r = (k, v) => v ? `<div style="margin-bottom:8px"><div class="text-muted small">${k}</div><div style="white-space:pre-wrap">${esc(v)}</div></div>` : "";
  return `<tr class="it-detail"><td colspan="8" style="background:#f8fafc"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 20px;padding:6px 4px">
    ${r("Nguyên nhân", w.cause)}${r("Hướng xử lý", w.solution)}${r("Khuyến nghị / ghi chú", w.note)}${r("Người yêu cầu", w.requester_name)}${r("Thời điểm báo", fmtDateTime(w.reported_at))}${r("Serial", w.serial)}${r("Bắt đầu xử lý", fmtDateTime(w.started_at))}${r("Kết thúc", fmtDateTime(w.ended_at))}${r("Nguồn", w.source === "web" ? "Nhập trên web" : "Telegram")}
    </div><div style="padding:4px"><button class="btn btn-sm btn-primary" onclick="itReport('${w.id}')">🖨️ Biên bản (A4 / PDF)</button></div>${itCanEdit(u, w) ? `<div style="padding:4px"><button class="btn btn-sm btn-outline" onclick="itEdit('${w.id}')">✏️ Sửa</button> <button class="btn btn-sm btn-outline" style="color:#dc2626" onclick="itDelete('${w.id}')">🗑️ Xóa</button></div>` : ""}</td></tr>`;
}

function viewItLog(u) {
  if (!canIt(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  if (itF.edit) return itForm(u);
  const list = itFiltered(), total = list.reduce((s, w) => s + (Number(w.duration_min) || 0), 0), PS = 50;
  const pages = Math.max(1, Math.ceil(list.length / PS)); if (itF.page > pages) itF.page = pages;
  const shown = list.slice((itF.page - 1) * PS, itF.page * PS);
  const deps = DB.departments.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const sel = (id, v, ph, items) => `<select class="form-control" style="width:auto;flex:1 1 150px;min-width:140px;max-width:240px" id="${id}" onchange="itApply()"><option value="">${ph}</option>${items.map(([k, t]) => `<option value="${esc(k)}" ${v === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <h4 style="margin:0">🧰 Nhật ký công việc IT (${list.length} việc · ${total} phút)</h4>
      <div style="display:flex;gap:8px"><button class="btn btn-sm btn-outline" onclick="itExport()">⬇️ Xuất CSV</button><button class="btn btn-sm btn-outline" onclick="itReportList()" title="In biên bản tổng hợp theo bộ lọc hiện tại">🖨️ Biên bản tổng hợp</button><button class="btn btn-primary btn-sm" onclick="itNew()">➕ Tạo nhật ký</button></div>
    </div>
    <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input class="form-control" id="itlogSearch" placeholder="🔍 Mã tài sản, nội dung, người ghi… (Enter)" value="${esc(itF.q)}" style="width:auto;max-width:280px;flex:1 1 200px;min-width:180px" onkeydown="if(event.key==='Enter') itApply()">
      ${sel("it_f_dept", itF.dept, "Tất cả phòng ban", deps.map(d => [d.id, d.name]))}
      ${sel("it_f_cat", itF.cat, "Tất cả loại", IT_CATS.map(c => [c, c]))}
      ${sel("it_f_res", itF.result, "Mọi kết quả", Object.entries(IT_RESULTS).map(([k, v]) => [k, v[0]]))}
      <input class="form-control" type="date" id="it_f_from" value="${esc(itF.from)}" onchange="itApply()" title="Từ ngày" style="width:auto;flex:0 0 150px">
      <input class="form-control" type="date" id="it_f_to" value="${esc(itF.to)}" onchange="itApply()" title="Đến ngày" style="width:auto;flex:0 0 150px">
      <button class="btn btn-sm btn-outline-secondary" onclick="itReset()">Xóa lọc</button>
    </div>
    ${shown.length ? `<div style="overflow:auto"><table><thead><tr><th>Thời gian</th><th>IT</th><th>Công việc</th><th>Phòng ban / User</th><th>Tài sản</th><th>Kết quả</th><th>Phút</th><th></th></tr></thead><tbody>
      ${shown.map(w => `<tr onclick="itView('${w.id}')" style="cursor:pointer"><td class="text-nowrap">${fmtDateTime(itWhen(w))}</td><td>${esc(w.it_user || "-")}${w.source === "web" ? "" : `<div class="small text-muted">Telegram</div>`}</td>
        <td><b>${esc(w.title || w.description || "")}</b><div class="small text-muted">${esc(w.category || "")}${w.ticket_code ? " · " + esc(w.ticket_code) : ""}</div></td>
        <td>${esc(depName(w.department_id) || "-")}${w.requester_name ? `<div class="small text-muted">${esc(w.requester_name)}</div>` : ""}</td>
        <td>${w.asset_id ? `<a data-nav="asset_detail" data-params='{"id":"${esc(w.asset_id)}"}' onclick="event.stopPropagation()">${esc(w.asset_code || "")}</a>` : esc(w.asset_code || "")}<div class="small text-muted">${esc(w.asset_name || "")}</div></td>
        <td>${itBadge(w)}</td><td>${esc(w.duration_min || 0)}</td><td class="text-muted small">${itF.view === w.id ? "▲" : "▼"}</td></tr>${itF.view === w.id ? itDetail(w, u) : ""}`).join("")}
    </tbody></table></div>
    ${pages > 1 ? `<div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px"><button class="btn btn-sm btn-outline-secondary" ${itF.page <= 1 ? "disabled" : ""} onclick="itPage(${itF.page - 1})">‹ Trước</button><span class="small text-muted">Trang ${itF.page}/${pages}</span><button class="btn btn-sm btn-outline-secondary" ${itF.page >= pages ? "disabled" : ""} onclick="itPage(${itF.page + 1})">Sau ›</button></div>` : ""}`
      : `<p class="text-muted">Chưa có nhật ký nào. Bấm “Tạo nhật ký” hoặc ghi qua chatbot Telegram.</p>`}
  </div>`;
}

/* ============================================================================
   BIÊN BẢN XỬ LÝ CÔNG VIỆC IT (in A4 → "Lưu thành PDF" → gửi phòng ban xác nhận)
   ============================================================================ */
function itReport(id) {
  const w = byId(DB.worklogs, id); if (!w) return;
  const t = DB.templateConfig || {}, a = w.asset_id ? byId(DB.assets, w.asset_id) : null;
  const dep = depName(w.department_id) || "…………………………";
  const req = w.requester_name || "…………………………";
  const row = (k, v) => `<tr><td style="width:30%;font-weight:600;background:#f3f4f6">${k}</td><td>${v || "&nbsp;"}</td></tr>`;
  const para = (title, txt) => `<p style="margin:10px 0 3px"><b>${title}</b></p><div style="border:1px solid #333;min-height:48px;padding:6px 8px;white-space:pre-wrap">${esc(txt || "")}</div>`;
  const d = new Date(itMs(w));
  const body = `
    ${reportLetterheadHtml()}
    <h2 style="text-align:center;margin:16px 0 2px">BIÊN BẢN XÁC NHẬN XỬ LÝ CÔNG VIỆC CÔNG NGHỆ THÔNG TIN</h2>
    <div style="text-align:center;margin-bottom:12px">Số: ${esc(w.id)} &nbsp;·&nbsp; Ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}</div>
    <p style="margin:8px 0 4px"><b>I. THÔNG TIN CHUNG</b></p>
    <table class="print-table" style="width:100%">
      ${row("Phòng ban / đơn vị được hỗ trợ", esc(dep))}
      ${row("Người yêu cầu / đại diện", esc(req))}
      ${row("Công việc / sự cố", `<b>${esc(w.title || w.description || "")}</b>`)}
      ${row("Loại công việc", esc(w.category || ""))}
      ${row("Thiết bị / tài sản liên quan", a ? `${esc(a.code)} · ${esc(a.name)}${(w.serial || a.serial) ? " · SN: " + esc(w.serial || a.serial) : ""}` : esc((w.asset_code ? w.asset_code + " " : "") + (w.asset_name || "") + (w.serial ? " · SN: " + w.serial : "") || "Không"))}
      ${row("Thời điểm báo sự cố", esc(fmtDateTime(w.reported_at)))}
      ${row("Thời gian bắt đầu xử lý", esc(fmtDateTime(itWhen(w))))}
      ${row("Thời gian kết thúc", esc(fmtDateTime(w.ended_at)))}
      ${row("Thời lượng xử lý", w.duration_min ? esc(w.duration_min) + " phút" : "")}
      ${row("Kết quả", esc((IT_RESULTS[itResultOf(w)] || [""])[0]))}
      ${row("Cán bộ IT thực hiện", esc(w.it_user || ""))}
    </table>
    <p style="margin:14px 0 2px"><b>II. NỘI DUNG XỬ LÝ</b></p>
    ${para("1. Nguyên nhân", w.cause)}
    ${para("2. Hướng xử lý / các bước đã thực hiện", w.solution)}
    ${w.note ? para("3. Khuyến nghị", w.note) : ""}
    <p style="margin:14px 0 0">Hai bên đã kiểm tra và xác nhận nội dung trên là đúng. Biên bản lập thành 02 bản: phòng ban lưu 01 bản, bộ phận CNTT lưu 01 bản.</p>
    <table style="width:100%;border:none;margin-top:18px;page-break-inside:avoid"><tr>
      <td style="border:none;text-align:center;width:34%"><b>CÁN BỘ IT THỰC HIỆN</b><div style="font-style:italic;font-size:11px">(Ký, ghi rõ họ tên)</div><div style="margin-top:62px">${esc(w.it_user || "")}</div></td>
      <td style="border:none;text-align:center;width:33%"><b>NGƯỜI YÊU CẦU / ĐẠI DIỆN PHÒNG BAN</b><div style="font-style:italic;font-size:11px">(Ký, ghi rõ họ tên)</div><div style="margin-top:62px">${w.requester_name ? esc(w.requester_name) : ""}</div></td>
      <td style="border:none;text-align:center;width:33%"><b>TRƯỞNG PHÒNG / ĐƠN VỊ XÁC NHẬN</b><div style="font-style:italic;font-size:11px">(Ký, ghi rõ họ tên, đóng dấu)</div><div style="margin-top:62px">&nbsp;</div></td>
    </tr></table>`;
  openPrintWindow(body, "Bien_ban_" + w.id);
}
function itReportList() {
  const list = itFiltered().slice().sort((a, b) => itMs(a) - itMs(b));
  if (!list.length) { flash("Không có nhật ký nào để lập biên bản (kiểm tra bộ lọc).", "error"); render(); return; }
  const dep = itF.dept ? depName(itF.dept) : "Tất cả phòng ban";
  const total = list.reduce((s, w) => s + (Number(w.duration_min) || 0), 0);
  const period = itF.from || itF.to ? `Từ ${itF.from || "…"} đến ${itF.to || "…"}` : "Toàn bộ thời gian";
  const body = `
    ${reportLetterheadHtml()}
    <h2 style="text-align:center;margin:16px 0 2px">BIÊN BẢN TỔNG HỢP CÔNG VIỆC HỖ TRỢ CÔNG NGHỆ THÔNG TIN</h2>
    <div style="text-align:center;margin-bottom:10px">Phòng ban: <b>${esc(dep)}</b> · ${esc(period)} · ${list.length} việc · ${total} phút</div>
    <table class="print-table" style="width:100%"><thead><tr><th style="width:4%">STT</th><th style="width:13%">Thời gian</th><th>Công việc</th><th style="width:15%">Người yêu cầu</th><th style="width:22%">Nguyên nhân / hướng xử lý</th><th style="width:11%">Kết quả</th><th style="width:7%">Phút</th></tr></thead><tbody>
    ${list.map((w, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(fmtDateTime(itWhen(w)))}</td><td><b>${esc(w.title || w.description || "")}</b>${w.asset_code ? `<div>${esc(w.asset_code)}</div>` : ""}${itF.dept ? "" : `<div>${esc(depName(w.department_id) || "")}</div>`}</td><td>${esc(w.requester_name || "")}</td><td>${esc([w.cause, w.solution].filter(Boolean).join(" → "))}</td><td>${esc((IT_RESULTS[itResultOf(w)] || [""])[0])}</td><td style="text-align:right">${esc(w.duration_min || 0)}</td></tr>`).join("")}
    </tbody></table>
    <p style="margin:12px 0 0">Đại diện phòng ban đã đối chiếu và xác nhận các nội dung trên.</p>
    <table style="width:100%;border:none;margin-top:18px;page-break-inside:avoid"><tr>
      <td style="border:none;text-align:center;width:50%"><b>BỘ PHẬN CNTT</b><div style="font-style:italic;font-size:11px">(Ký, ghi rõ họ tên)</div><div style="margin-top:62px">&nbsp;</div></td>
      <td style="border:none;text-align:center;width:50%"><b>TRƯỞNG PHÒNG / ĐƠN VỊ XÁC NHẬN</b><div style="font-style:italic;font-size:11px">(Ký, ghi rõ họ tên, đóng dấu)</div><div style="margin-top:62px">&nbsp;</div></td>
    </tr></table>`;
  openPrintWindow(body, "Bien_ban_tong_hop_IT");
}

/* ---- Sao lưu ra Google Sheet (admin / IT) ---- */
const bkS = { info: null, loading: false, running: false, msg: "" };
function bkLoad() {
  if (bkS.loading || bkS.info) return; bkS.loading = true;
  fetch("/api/admin/backup-sheets", { credentials: "same-origin" }).then(r => r.json()).then(j => { bkS.info = j; }).catch(() => { bkS.info = { error: true }; }).finally(() => { bkS.loading = false; if (state.route === "admin_data") render(); });
}
function sheetsBackupCard() {
  const u = currentUser();
  if (!u || !["admin", "it"].includes(u.role)) return "";
  bkLoad();
  const i = bkS.info, last = i && i.last;
  const target = i && i.sheetUrl ? `<div style="margin-bottom:6px">📁 Nơi lưu: <a href="${esc(i.sheetUrl)}" target="_blank" rel="noopener">mở Google Sheet sao lưu</a>${i.email ? ` · Tài khoản ghi: <code>${esc(i.email)}</code> (phải được chia sẻ quyền <b>Người chỉnh sửa</b> trên Sheet)` : ""}</div>` : "";
  const guide = i && !i.error && !i.configured && !i.local ? `<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px;line-height:1.6">
      <b>Chưa thể sao lưu — cần thiết lập 3 bước (một lần):</b><ol style="margin:6px 0 0 18px;padding:0">
      <li>Vào <b>Google Drive</b> của đơn vị → tạo một <b>Google Sheet mới</b> (tên tùy ý, ví dụ “704-ASSETS Backup”) trong thư mục muốn lưu. Chép <b>ID</b> trong địa chỉ: <code>docs.google.com/spreadsheets/d/<u>ID</u>/edit</code>.</li>
      <li>Bấm <b>Chia sẻ</b> Sheet đó cho email <code>${esc(i.email || "client_email của service account (file JSON khóa)")}</code> với quyền <b>Người chỉnh sửa</b>.</li>
      <li>Vercel → Project → Settings → Environment Variables, thêm: ${(i.missing || []).map(m => `<code>${esc(m)}</code>`).join(", ") || "đủ biến"}. <code>BACKUP_SHEET_ID</code> = ID ở bước 1; <code>GOOGLE_CLIENT_EMAIL</code>, <code>GOOGLE_PRIVATE_KEY</code> lấy từ file JSON của service account. Rồi <b>Redeploy</b>.</li></ol>
      Cũng cần bật <b>Google Sheets API</b> trong Google Cloud của service account đó. Chi tiết: mục “Sao lưu Google Sheet” trong CAU_HINH_CHI_TIET.md.</div>` : "";
  const st = !i ? "Đang kiểm tra…" : i.error ? "Không kiểm tra được trạng thái." : i.local ? "Bản chạy nội bộ không dùng mục này (dùng Sao lưu .json)." : !i.configured ? "Chưa cấu hình." : last ? (last.ok ? `Lần gần nhất: ${fmtDateTime(last.at)} bởi ${esc(last.by || "")} — ` + Object.entries(last.counts || {}).map(([k, v]) => k + " " + v).join(", ") : `<span style="color:#dc2626">Lần gần nhất lỗi (${fmtDateTime(last.at)}): ${esc(last.error || "")}</span>`) : "Chưa có lần sao lưu nào.";
  return `<div style="margin: 24px 0; padding: 20px; border: 1px dashed var(--border); border-radius: 8px; background: #f0fdf4;">
    <h5>📊 Sao lưu ra Google Sheet</h5>
    <p style="font-size:14px;">Ghi toàn bộ dữ liệu (tài sản, nhật ký IT, phiếu, người dùng không kèm mật khẩu, khóa bản quyền được loại bỏ…) ra các tab <code>BK_…</code> trong Google Sheet của đơn vị. Chạy tay tại đây hoặc tự động mỗi tuần (Chủ nhật 18:00 UTC).</p>
    ${guide}${target}<div class="small text-muted" style="margin-bottom:10px">${st}</div>
    <button class="btn btn-primary" ${bkS.running || (i && !i.configured) ? "disabled" : ""} onclick="sheetsBackupNow()">${bkS.running ? "⏳ Đang sao lưu…" : "📤 Sao lưu ngay ra Google Sheet"}</button>
    ${bkS.msg ? `<div style="margin-top:8px">${bkS.msg}</div>` : ""}</div>`;
}
function sheetsBackupNow() {
  if (bkS.running) return; bkS.running = true; bkS.msg = ""; render();
  fetch("/api/admin/backup-sheets", { method: "POST", credentials: "same-origin" }).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => {
    bkS.msg = ok ? `<span style="color:#16a34a">✅ Đã sao lưu ${Object.values(j.counts || {}).reduce((s, n) => s + n, 0)} bản ghi.</span>` : `<span style="color:#dc2626">❌ ${esc(j.error || "Lỗi")}</span>`;
    bkS.info = null;
  }).catch(() => { bkS.msg = `<span style="color:#dc2626">❌ Không kết nối được máy chủ.</span>`; }).finally(() => { bkS.running = false; render(); });
}

/* ============================================================================
   GHI NHẬN TRUY CẬP (gửi gộp, nhẹ) + TRANG GIÁM SÁT & TRUY CẬP
   ============================================================================ */
const trk = { routes: {}, route: null, lastFlush: 0, timer: null };
function trkFlush(ping, beacon) {
  const body = JSON.stringify({ routes: trk.routes, ping: !!ping, route: trk.route });
  trk.routes = {}; trk.lastFlush = Date.now();
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/activity", new Blob([body], { type: "text/plain" }));
    else fetch("/api/activity", { method: "POST", credentials: "same-origin", body, keepalive: true }).catch(() => {});
  } catch (e) { /* bỏ qua */ }
}
function trackRoute() {
  const u = typeof currentUser === "function" ? currentUser() : null;
  if (!u || !/^https?:/.test(location.protocol)) return;
  if (state.route !== trk.route) { trk.route = state.route; trk.routes[state.route] = (trk.routes[state.route] || 0) + 1; }
  if (!trk.timer) {
    trk.timer = setInterval(() => { if (document.visibilityState === "visible" && currentUser()) trkFlush(true); }, 180000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && Object.keys(trk.routes).length) trkFlush(false, true); });
  }
  if (Date.now() - trk.lastFlush > 60000 && Object.keys(trk.routes).length) trkFlush(false);
}

const mon = { tab: "ov", days: 30, sys: null, use: null, loading: false, at: 0, err: "", q: "" };
const isAdmin2 = u => u && u.role === "admin";
function monLoad(force) {
  const u = currentUser();
  if (mon.loading || !u) return;
  if (!force && mon.sys && Date.now() - mon.at < 60000) return;
  mon.loading = true;
  const reqs = [fetch("/api/admin/monitor", { credentials: "same-origin" }).then(r => r.json())];
  if (isAdmin2(u)) reqs.push(fetch("/api/admin/usage?days=" + mon.days, { credentials: "same-origin" }).then(r => r.json()));
  Promise.all(reqs).then(([s, us]) => { mon.sys = s; mon.use = us && us.days ? us.days : null; mon.at = Date.now(); mon.err = s && s.error ? s.error : ""; })
    .catch(() => { mon.err = "Không tải được số liệu (mất kết nối hoặc đang dùng bản offline)."; })
    .finally(() => { mon.loading = false; if (state.route === "monitor") render(); });
}
function monTab(t) { mon.tab = t; render(); }
function monDays(n) { mon.days = Number(n) || 30; mon.use = null; mon.at = 0; monLoad(true); render(); }
function monRefresh() { monLoad(true); render(); }
function monQ(v) { mon.q = v; render(); const e = document.getElementById("monQ"); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }

const uaShort = ua => { ua = String(ua || ""); const dev = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "?"; const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ""; return dev + (br ? " · " + br : ""); };
const fmtUp = s => { s = Number(s) || 0; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + " ngày " : "") + (h ? h + " giờ " : "") + m + " phút"; };
const ago = ms => { if (!ms) return "chưa có"; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 90 ? "vừa xong" : s < 5400 ? Math.round(s / 60) + " phút trước" : s < 129600 ? Math.round(s / 3600) + " giờ trước" : Math.round(s / 86400) + " ngày trước"; };
const dFmt = id => String(id).slice(6, 8) + "/" + String(id).slice(4, 6);

function svgSeries(vals, labels, color) {
  const W = 640, H = 190, padL = 34, padB = 26, padT = 12, n = vals.length || 1, max = Math.max(1, ...vals), step = (W - padL - 8) / n, bw = Math.max(3, Math.min(22, step - 4));
  const bars = vals.map((v, i) => { const h = (H - padB - padT) * v / max, x = padL + i * step + (step - bw) / 2; return `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, v ? 1.5 : 0).toFixed(1)}" rx="3" fill="${color}"><title>${esc(labels[i])}: ${v}</title></rect>`; }).join("");
  const every = Math.ceil(n / 10), xl = labels.map((l, i) => i % every === 0 ? `<text x="${(padL + i * step + step / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${esc(l)}</text>` : "").join("");
  const yl = (max < 4 ? [0, 1] : [0, .5, 1]).map(f => `<line x1="${padL}" x2="${W - 4}" y1="${(H - padB - (H - padB - padT) * f).toFixed(1)}" y2="${(H - padB - (H - padB - padT) * f).toFixed(1)}" stroke="#e8edf5"/><text x="${padL - 6}" y="${(H - padB - (H - padB - padT) * f + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b">${Math.round(max * f)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${yl}${bars}${xl}</svg>`;
}
function hbars(items, color) {
  const max = Math.max(1, ...items.map(i => i.v));
  return items.map(i => `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:13px"><div style="width:150px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(i.label)}">${esc(i.label)}</div><div style="flex:1;background:#eef2f8;border-radius:6px;height:14px"><div style="width:${Math.max(2, i.v / max * 100)}%;height:14px;border-radius:6px;background:${color}"></div></div><div style="width:48px;text-align:right">${i.v}</div></div>`).join("") || `<div class="text-muted">Chưa có dữ liệu.</div>`;
}

function monAgg() {
  const days = mon.use || [], out = { days, byUser: {}, routes: {}, hourly: Array(24).fill(0), devices: { mobile: 0, desktop: 0 }, pv: 0, logins: 0, fails: 0, events: [] };
  days.forEach(d => {
    out.pv += d.pv || 0; out.logins += d.logins || 0; out.fails += d.fails || 0;
    Object.entries(d.routes || {}).forEach(([k, v]) => out.routes[k] = (out.routes[k] || 0) + v);
    Object.entries(d.hourly || {}).forEach(([h, v]) => out.hourly[+h] += v);
    out.devices.mobile += (d.devices || {}).mobile || 0; out.devices.desktop += (d.devices || {}).desktop || 0;
    Object.entries(d.users || {}).forEach(([id, x]) => { const a = out.byUser[id] ??= { pv: 0, mins: 0, logins: 0, last: 0 }; a.pv += x.pv || 0; a.mins += x.mins || 0; a.logins += x.logins || 0; a.last = Math.max(a.last, x.last || 0); });
    (d.events || []).forEach(e => out.events.push(e));
  });
  out.events.sort((a, b) => b.t - a.t);
  return out;
}
const routeLabel = r => (typeof PAGE_TITLES === "object" && PAGE_TITLES[r]) || ({ dashboard: "Trang chủ", assets: "Tài sản", asset_detail: "Chi tiết tài sản", itlog: "Nhật ký IT", repairs: "Bảo trì - Bảo hành", repair_detail: "Phiếu báo hỏng", transfers: "Cấp phát - Điều chuyển", reports: "Báo cáo", monitor: "Giám sát" })[r] || r;

function monOverview(u, A) {
  const s = mon.sys;
  if (!s) return `<div class="card text-muted">${mon.err ? esc(mon.err) : "Đang tải…"}</div>`;
  if (s.error) return `<div class="alert alert-error">${esc(s.error)}</div>`;
  const today = A.days.length ? A.days[A.days.length - 1] : null, todayId = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
  const td = today && today.date === todayId ? today : { users: {}, logins: 0, fails: 0, pv: 0 };
  const online = Object.entries(td.users || {}).filter(([, x]) => x.last && Date.now() - x.last < 6 * 60000).map(([id, x]) => ({ id, x }));
  const warn = [];
  if (s.security && s.security.default_admin_password) warn.push("Tài khoản admin vẫn dùng mật khẩu mặc định A@123456, hãy đổi ngay (Cấu hình → Người sử dụng).");
  if (td.fails >= 5) warn.push(`Hôm nay có ${td.fails} lần đăng nhập sai. Kiểm tra tab “Nhật ký đăng nhập”.`);
  if (s.telegram && s.telegram.last_error) warn.push("Telegram báo lỗi gần nhất: " + s.telegram.last_error);
  if (s.telegram && s.telegram.pending > 20) warn.push(`Telegram còn ${s.telegram.pending} tin chưa gửi được tới máy chủ.`);
  if (s.mode === "firestore" && s.config.sheets && (!s.backup || !s.backup.ok || Date.now() - Date.parse(s.backup.at) > 8 * 86400000)) warn.push("Chưa có bản sao lưu Google Sheet trong 8 ngày gần đây.");
  if (s.db_ms > 1500) warn.push(`Cơ sở dữ liệu phản hồi chậm (${s.db_ms} ms).`);
  const noTg = DB.users.filter(x => x.is_active !== false && ["admin", "it"].includes(x.role) && !x.telegram_id).length;
  if (noTg) warn.push(`${noTg} tài khoản IT/Admin chưa nhập Telegram ID (không dùng được bot).`);
  const ok = v => v ? `<span style="color:#16a34a">● Đã cấu hình</span>` : `<span style="color:#94a3b8">○ Chưa cấu hình</span>`;
  const openRep = DB.repairs.filter(r => ["pending_manager", "pending_tcth", "pending_it"].includes(r.status)).length;
  return `
  ${warn.length ? `<div class="card" style="border-left:4px solid #f59e0b"><h4 style="margin:0 0 6px">⚠️ Cần chú ý (${warn.length})</h4><ul style="margin:0;padding-left:18px">${warn.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : `<div class="card" style="border-left:4px solid #16a34a">✅ Hệ thống hoạt động bình thường.</div>`}
  <div class="kpis">
    <div class="kpi"><div class="ico" style="background:#dcfce7">🟢</div><div class="v">${isAdmin2(u) ? online.length : "-"}</div><div class="l">Đang trực tuyến (6 phút)</div></div>
    <div class="kpi"><div class="ico" style="background:#e0ecff">🔑</div><div class="v">${isAdmin2(u) ? td.logins || 0 : "-"}</div><div class="l">Đăng nhập hôm nay${td.fails ? ` <span class="d" style="color:#dc2626">${td.fails} sai</span>` : ""}</div></div>
    <div class="kpi"><div class="ico" style="background:#fef3c7">👥</div><div class="v">${isAdmin2(u) ? Object.keys(td.users || {}).length : "-"}</div><div class="l">Người dùng hoạt động hôm nay</div></div>
    <div class="kpi"><div class="ico" style="background:#ede9fe">👁️</div><div class="v">${isAdmin2(u) ? td.pv || 0 : "-"}</div><div class="l">Lượt xem màn hình hôm nay</div></div>
  </div>
  <div class="row">
   <div class="col col-6"><div class="card"><h4 style="margin-top:0">🖥️ Máy chủ</h4><table>
     <tr><td class="text-muted">Chế độ dữ liệu</td><td><b>${s.mode === "local" ? "Nội bộ (JSON)" : "Firestore"}</b></td></tr>
     <tr><td class="text-muted">Độ trễ cơ sở dữ liệu</td><td>${s.db_ms} ms</td></tr>
     <tr><td class="text-muted">Thời gian chạy tiến trình</td><td>${fmtUp(s.uptime_s)}</td></tr>
     <tr><td class="text-muted">Bộ nhớ / Node</td><td>${s.memory_mb} MB · ${esc(s.node)}</td></tr>
     <tr><td class="text-muted">Phiên bản dữ liệu (rev)</td><td>${s.rev}</td></tr></table>
     <div class="small text-muted" style="margin-top:8px">Điểm kiểm tra cho phần mềm giám sát ngoài (Uptime Kuma, Zabbix…): <code>/api/health</code></div></div></div>
   <div class="col col-6"><div class="card"><h4 style="margin-top:0">🔌 Dịch vụ</h4><table>
     <tr><td class="text-muted">Telegram bot</td><td>${s.telegram ? (s.telegram.ok && s.telegram.url_set ? `<span style="color:#16a34a">● Webhook hoạt động</span>${s.telegram.pending ? ` (chờ ${s.telegram.pending})` : ""}` : `<span style="color:#dc2626">● Lỗi / chưa đặt webhook</span>`) : ok(false)}</td></tr>
     <tr><td class="text-muted">AI (Gemini/Claude)</td><td>${ok(s.config.ai)}</td></tr>
     <tr><td class="text-muted">Google Sheet sao lưu</td><td>${ok(s.config.sheets)}${s.backup ? ` · lần cuối ${s.backup.ok ? "✅" : "❌"} ${ago(Date.parse(s.backup.at))}` : ""}</td></tr>
     <tr><td class="text-muted">Lịch nhắc việc (CRON_SECRET)</td><td>${ok(s.config.cron_secret)}</td></tr></table></div></div>
  </div>
  <div class="card"><h4 style="margin-top:0">📦 Dữ liệu hiện có</h4><div style="display:flex;gap:22px;flex-wrap:wrap">
   ${[["Tài sản", DB.assets.length], ["Người dùng", DB.users.length], ["Phòng ban", DB.departments.length], ["Phiếu báo hỏng đang mở", openRep], ["Nhật ký IT", (DB.worklogs || []).length], ["Địa điểm", (DB.locations || []).length], ["Phần mềm", (DB.software || []).length]].map(([k, v]) => `<div><div style="font-size:22px;font-weight:800">${v}</div><div class="text-muted small">${k}</div></div>`).join("")}</div></div>
  ${isAdmin2(u) && online.length ? `<div class="card"><h4 style="margin-top:0">🟢 Đang trực tuyến</h4>${online.map(({ id, x }) => { const us = byId(DB.users, id); return `<span style="display:inline-block;background:#f1f5f9;border-radius:99px;padding:4px 10px;margin:3px;font-size:13px">${esc(us ? us.full_name : id)} <span class="text-muted">· ${esc(routeLabel(x.route || ""))} · ${ago(x.last)}</span></span>`; }).join("")}</div>` : ""}`;
}

function monStats(A) {
  if (!mon.use) return `<div class="card text-muted">${mon.err ? esc(mon.err) : "Đang tải…"}</div>`;
  const labels = A.days.map(d => dFmt(d.date));
  const dau = A.days.map(d => Object.keys(d.users || {}).length);
  const topRoutes = Object.entries(A.routes).map(([k, v]) => ({ label: routeLabel(k), v })).sort((a, b) => b.v - a.v).slice(0, 10);
  const topUsers = Object.entries(A.byUser).map(([id, x]) => ({ label: (byId(DB.users, id) || {}).full_name || id, v: x.pv })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
  const totalDev = A.devices.mobile + A.devices.desktop;
  const uniq = Object.keys(A.byUser).length, active = DB.users.filter(x => x.is_active !== false).length;
  return `
  <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Khoảng thời gian:</b>${[7, 30, 90].map(n => `<button class="btn btn-sm ${mon.days === n ? "btn-primary" : "btn-outline"}" onclick="monDays(${n})">${n} ngày</button>`).join("")}
    <span class="text-muted small" style="margin-left:auto">${uniq}/${active} tài khoản có truy cập · ${A.logins} lượt đăng nhập · ${A.fails} lần sai · ${A.pv} lượt xem</span></div>
  <div class="card"><h4 style="margin-top:0">Người dùng hoạt động mỗi ngày</h4>${svgSeries(dau, labels, "#2f6df0")}</div>
  <div class="row"><div class="col col-6"><div class="card"><h4 style="margin-top:0">Lượt xem màn hình mỗi ngày</h4>${svgSeries(A.days.map(d => d.pv || 0), labels, "#7c3aed")}</div></div>
  <div class="col col-6"><div class="card"><h4 style="margin-top:0">Đăng nhập mỗi ngày</h4>${svgSeries(A.days.map(d => d.logins || 0), labels, "#16a34a")}</div></div></div>
  <div class="row"><div class="col col-6"><div class="card"><h4 style="margin-top:0">Màn hình dùng nhiều nhất</h4>${hbars(topRoutes, "#2f6df0")}</div></div>
  <div class="col col-6"><div class="card"><h4 style="margin-top:0">Người dùng nhiều nhất (lượt xem)</h4>${hbars(topUsers, "#f59e0b")}</div></div></div>
  <div class="row"><div class="col col-8"><div class="card"><h4 style="margin-top:0">Giờ cao điểm (giờ Việt Nam)</h4>${svgSeries(A.hourly, A.hourly.map((_, h) => h + "h"), "#0ea5e9")}</div></div>
  <div class="col col-4"><div class="card"><h4 style="margin-top:0">Thiết bị đăng nhập</h4><div style="display:flex;align-items:center;gap:14px">${svgDonut([{ v: A.devices.mobile, color: "#2f6df0" }, { v: A.devices.desktop, color: "#94a3b8" }], totalDev, 120).replace("Tổng tài sản", "lượt đăng nhập")}<div style="font-size:13px"><div>🔵 Điện thoại: <b>${A.devices.mobile}</b></div><div>⚪ Máy tính: <b>${A.devices.desktop}</b></div></div></div></div></div></div>`;
}

function monUsers(A, u) {
  if (!mon.use) return `<div class="card text-muted">${mon.err ? esc(mon.err) : "Đang tải…"}</div>`;
  const q = normTxt(mon.q).trim();
  const rows = DB.users.filter(x => !q || normTxt([x.full_name, x.username, x.employee_code].join(" ")).includes(q));
  return `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><h4 style="margin:0">Người dùng (${rows.length})</h4>
    <input class="form-control" id="monQ" placeholder="🔍 Tên, tài khoản…" value="${esc(mon.q)}" oninput="monQ(this.value)" style="max-width:240px;width:auto">
    <span class="text-muted small">Số liệu trong ${mon.days} ngày. Thêm / sửa / đặt lại mật khẩu: <a data-nav="admin_users">Người sử dụng</a></span></div>
    <div style="overflow:auto"><table><thead><tr><th>Họ tên</th><th>Tài khoản</th><th>Vai trò</th><th>Phòng ban</th><th>Telegram</th><th>Truy cập gần nhất</th><th class="text-end">Đăng nhập</th><th class="text-end">Lượt xem</th><th class="text-end">Phút dùng</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${rows.map(x => { const a = A.byUser[x.id] || { pv: 0, mins: 0, logins: 0, last: 0 }, act = x.is_active !== false; return `<tr><td><b>${esc(x.full_name)}</b></td><td class="mono">${esc(x.username)}</td><td>${esc(ROLE_LABELS[x.role] || x.role)}</td><td>${esc(depName(x.department_id) || "-")}</td><td>${x.telegram_id ? "✅" : "-"}</td><td>${a.last ? `${ago(a.last)}` : `<span class="text-muted">chưa có</span>`}</td><td class="text-end">${a.logins}</td><td class="text-end">${a.pv}</td><td class="text-end">${a.mins}</td>
      <td>${act ? `<span style="color:#16a34a">● Hoạt động</span>` : `<span style="color:#dc2626">● Đã khóa</span>`}</td><td style="white-space:nowrap">${x.id === u.id ? "" : `<a onclick="monToggleUser('${x.id}')" style="color:${act ? "#dc2626" : "#16a34a"}">${act ? "🔒 Khóa" : "🔓 Mở khóa"}</a>`}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
}
function monToggleUser(id) {
  const u = currentUser(), x = byId(DB.users, id); if (!x || !isAdmin2(u) || x.id === u.id) return;
  const act = x.is_active !== false;
  if (!confirm((act ? "Khóa tài khoản " : "Mở khóa tài khoản ") + x.full_name + "?" + (act ? "\nNgười này sẽ bị đăng xuất và không đăng nhập được." : ""))) return;
  x.is_active = !act; x.updated_at = nowIso(); saveDB(); flash(act ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản."); render();
}

function monEvents(A) {
  if (!mon.use) return `<div class="card text-muted">${mon.err ? esc(mon.err) : "Đang tải…"}</div>`;
  const ev = A.events.slice(0, 200);
  return `<div class="card"><h4 style="margin-top:0">Nhật ký đăng nhập (${ev.length} lần gần nhất, trong ${mon.days} ngày)</h4><div style="overflow:auto"><table><thead><tr><th>Thời gian</th><th>Tài khoản nhập</th><th>Kết quả</th><th>Địa chỉ IP</th><th>Thiết bị</th></tr></thead><tbody>
  ${ev.map(e => { const us = e.u ? byId(DB.users, e.u) : null; return `<tr><td class="text-nowrap">${fmtDateTime(new Date(e.t).toISOString())}</td><td>${esc(e.name)}${us ? `<div class="small text-muted">${esc(us.full_name)}</div>` : ""}</td><td>${e.ok ? `<span style="color:#16a34a">✓ Thành công</span>` : `<span style="color:#dc2626">✗ Sai</span>`}</td><td class="mono small">${esc(e.ip || "-")}</td><td class="small">${esc(uaShort(e.ua))}</td></tr>`; }).join("") || `<tr><td colspan="5" class="text-muted">Chưa có.</td></tr>`}
  </tbody></table></div><div class="small text-muted" style="margin-top:8px">Mật khẩu không bao giờ được ghi lại. Mỗi ngày giữ tối đa 200 lần đăng nhập gần nhất.</div></div>`;
}

function viewMonitor(u) {
  if (!["admin", "it"].includes(u.role)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  monLoad(false);
  const admin = isAdmin2(u), A = monAgg();
  const tabs = [["ov", "📡 Tổng quan"], ...(admin ? [["st", "📊 Thống kê truy cập"], ["us", "👥 Người dùng"], ["ev", "🔑 Nhật ký đăng nhập"]] : [])];
  if (!admin) mon.tab = "ov";
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">${tabs.map(([k, t]) => `<button class="btn btn-sm ${mon.tab === k ? "btn-primary" : "btn-outline"}" onclick="monTab('${k}')">${t}</button>`).join("")}
    <button class="btn btn-sm btn-outline-secondary" style="margin-left:auto" onclick="monRefresh()">${mon.loading ? "⏳ Đang tải…" : "↻ Làm mới"}</button>${mon.at ? `<span class="small text-muted">cập nhật ${ago(mon.at)}</span>` : ""}</div>
  ${mon.err && mon.tab !== "ov" ? `<div class="alert alert-error">${esc(mon.err)}</div>` : ""}
  ${mon.tab === "ov" ? monOverview(u, A) : mon.tab === "st" ? monStats(A) : mon.tab === "us" ? monUsers(A, u) : monEvents(A)}`;
}


/* ============================================================================
   PWA: cài như ứng dụng (Android/Chrome, iPhone/Safari "Thêm vào MH chính", Windows/Edge)
   ============================================================================ */
window.__pwa = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__pwa = e; try { if (currentUser()) render(); } catch (x) { /* bỏ qua */ } });
window.addEventListener("appinstalled", () => { window.__pwa = null; try { render(); } catch (x) { /* bỏ qua */ } });
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
function pwaBtn() {
  if (!/^https?:/.test(location.protocol) || isStandalone()) return "";
  if (window.__pwa) return `<button class="btn btn-sm" style="margin:8px 12px;background:#2f6df0;color:#fff;border:0" onclick="installApp()">📲 Cài ứng dụng</button>`;
  if (isIOS()) return `<button class="btn btn-sm" style="margin:8px 12px;background:#2f6df0;color:#fff;border:0" onclick="installApp()">📲 Cài ứng dụng</button>`;
  return "";
}
function installApp() {
  if (window.__pwa) { window.__pwa.prompt(); window.__pwa.userChoice.finally(() => { window.__pwa = null; render(); }); return; }
  alert("Cài ứng dụng trên iPhone/iPad:\n1. Mở trang này bằng Safari.\n2. Bấm nút Chia sẻ (hình vuông có mũi tên).\n3. Chọn “Thêm vào MH chính”.");
}
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}


/* ============================================================================
   QUẢN LÝ BIỂU MẪU: một danh sách loại + duyệt tới file (không tách cố định / tự do)
   ============================================================================ */
const TPL_FIXED = [["kk", "Biên bản kiểm kê", "template_kiem_ke_name", "template_kiem_ke_data"], ["tl", "Biên bản thanh lý", "template_thanh_ly_name", "template_thanh_ly_data"]];
function tplTypeChange(sel) { const e = document.getElementById("tplNewName"); if (e) e.style.display = sel.value === "__new" ? "" : "none"; }
function viewAdminTemplates(u) {
  if (!["admin", "tcth"].includes(u.role)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const t = DB.templateConfig || {}, custom = DB.customTemplates || [];
  const names = [...new Set(custom.map(x => x.type_name))].sort((a, b) => String(a).localeCompare(String(b), "vi"));
  const rows = [
    ...TPL_FIXED.map(f => ({ type: f[1], file: t[f[2]], href: t[f[3]], fixed: true })),
    ...custom.slice().sort((a, b) => String(a.type_name).localeCompare(String(b.type_name), "vi")).map(x => ({ type: x.type_name, file: x.filename, href: x.data, id: x.id })),
  ];
  return `<div class="card" style="margin-bottom:14px"><h4>Tải lên / thay mẫu biểu</h4>
    <form data-form="tpl_upload" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div class="form-group" style="margin:0;min-width:260px;flex:1"><label>Loại biểu mẫu</label>
        <select class="form-control" name="tpl_type" onchange="tplTypeChange(this)">
          <optgroup label="Dùng tự động trong hệ thống">${TPL_FIXED.map(f => `<option value="${f[0]}">${f[1]}</option>`).join("")}</optgroup>
          ${names.length ? `<optgroup label="Biểu mẫu khác">${names.map(n => `<option value="c:${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>` : ""}
          <option value="__new">➕ Loại biểu mẫu mới…</option></select></div>
      <div class="form-group" id="tplNewName" style="margin:0;min-width:220px;flex:1;display:none"><label>Tên loại mới</label><input class="form-control" name="tpl_new" placeholder="VD: BM05 - Bàn giao CCDC"></div>
      <div class="form-group" style="margin:0;min-width:240px;flex:1"><label>Duyệt đến file biểu mẫu (.docx, .xlsx…)</label><input type="file" class="form-control" id="tplFile" required></div>
      <button class="btn btn-sm" type="submit">💾 Lưu</button></form></div>
    <div class="card"><h4>Danh sách biểu mẫu (${rows.length})</h4>
      <table class="compact-tbl"><thead><tr><th>Loại biểu mẫu</th><th>Tên file</th><th class="text-end">Thao tác</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.type)}</b>${r.fixed ? ` <span class="small text-muted">(hệ thống)</span>` : ""}</td><td>${r.file ? esc(r.file) : `<span class="text-muted">Chưa có</span>`}</td>
        <td class="text-end" style="white-space:nowrap">${r.href ? `<a href="${r.href}" download="${esc(r.file || "bieu-mau")}" class="btn btn-sm btn-outline">⬇️ Tải</a>` : ""}${r.id ? ` <button class="btn btn-sm btn-outline-danger" data-action="deleteTemplate:${r.id}" data-confirm="Xoá biểu mẫu này?">🗑️</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
}
function submit_tpl_upload(form) {
  const fd = new FormData(form), file = (document.getElementById("tplFile") || {}).files && document.getElementById("tplFile").files[0];
  if (!file) return;
  let type = fd.get("tpl_type");
  const fx = TPL_FIXED.find(f => f[0] === type);
  let custName = null;
  if (!fx) { custName = type === "__new" ? String(fd.get("tpl_new") || "").trim() : String(type).replace(/^c:/, ""); if (!custName) { flash("Nhập tên loại biểu mẫu.", "error"); render(); return; } }
  const rd = new FileReader();
  rd.onload = e => {
    if (fx) { DB.templateConfig = DB.templateConfig || {}; DB.templateConfig[fx[2]] = file.name; DB.templateConfig[fx[3]] = e.target.result; }
    else { DB.customTemplates = DB.customTemplates || []; const ex = DB.customTemplates.find(x => normTxt(x.type_name) === normTxt(custName));
      if (ex) { ex.filename = file.name; ex.data = e.target.result; ex.created_at = nowIso(); } else DB.customTemplates.push({ id: uid(), type_name: custName, filename: file.name, data: e.target.result, created_at: nowIso() }); }
    saveDB(); flash("Đã lưu biểu mẫu."); nav("admin_templates");
  };
  rd.readAsDataURL(file);
}
