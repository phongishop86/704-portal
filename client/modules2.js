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
const locName = id => { const l = id ? (DB.locations || []).find(x => x.id === id) : null; return l ? l.name : null; };
const dayDiff = iso => { if (!iso) return null; const t = Date.parse(String(iso).slice(0, 10)); return isNaN(t) ? null : Math.floor((t - Date.now()) / 86400000); };
const initials = n => String(n || "?").replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(w => /\p{L}/u.test(w[0] || "")).slice(-2).map(w => w[0]).join("").toUpperCase() || "?";
const PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#94a3b8", "#06b6d4", "#ec4899"];

Object.assign(PAGE_TITLES, {
  dashboard: "Trang chủ", assets: "Tài sản", ccdc: "Công cụ dụng cụ", transfers: "Cấp phát / Điều chuyển",
  repairs: "Bảo trì - Bảo hành", reports: "Báo cáo", itlog: "Nhật ký IT", admin_inventory: "Kiểm kê",
  admin_users: "Người sử dụng", admin_departments: "Phòng ban", admin_data: "Nhập / Xuất dữ liệu", admin_settings: "Cấu hình hệ thống",
  locations: "Địa điểm", qr: "QR Code", accessories: "Phụ kiện", accessory_detail: "Chi tiết phụ kiện",
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
.sidebar-section-title{color:#7f9bd1;padding:14px 18px 4px;font-size:10.5px;}
.sidebar-link{color:#cfdcf4;margin:2px 8px;padding:9px 14px;border-radius:10px;font-size:13.5px;box-shadow:none;}
.sidebar-link:hover{background:rgba(255,255,255,.09);color:#fff;}
.sidebar-link.active{background:#2f6df0;color:#fff;box-shadow:0 6px 14px rgba(47,109,240,.45);}
.sidebar-link .ic{font-size:15px;}
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
    const late = DB.repairs.filter(r => r.status === "pending_it" && now - (Date.parse(r.tcth_at || r.created_at || "") || now) > slaMs).length;
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
      <div class="dd" id="ddUser"><button class="dd-btn" onclick="uiToggle('ddUser')"><span class="avatar">${esc(initials(u.full_name))}</span>
        <span class="who2" style="text-align:left;line-height:1.2"><b style="font-size:13px">${esc(u.full_name)}</b><br><small class="text-muted">${esc(ROLE_LABELS[u.role] || u.role)}</small></span> <span class="who2">▾</span></button>
        <div class="dd-menu" style="min-width:200px"><a class="menu-it" data-action="logout">🚪 Đăng xuất</a></div></div>
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
      ${item("transfers", "🔁", "Cấp phát / Điều chuyển")}
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
      ${ta ? item("admin_data", "🔄", "Nhập / Xuất dữ liệu") : ""}
      ${ta ? item("admin_settings", "⚙️", "Cấu hình") : ""}
    </div>
    <div class="sb-user"><span class="avatar">${esc(initials(u.full_name))}</span>
      <div style="min-width:0"><div class="nm">${esc(u.full_name)}</div><div class="rl">${esc(ROLE_LABELS[u.role] || u.role)}${u.department_id ? " · " + esc(depName(u.department_id) || "") : ""}</div></div></div>
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
    <div style="text-align:center">${qrSvg(url, 220)}</div><div class="mono small text-muted" style="word-break:break-all;margin:8px 0 14px">${esc(url)}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="closeModal2()">Đóng</button><button class="btn btn-primary" onclick="qrPrintIds(['${a.id}'],'roll')">🖨️ In tem</button></div>`);
  return d;
}
const QR_LAYOUTS = {
  a3x8: { label: "A4 · 3 cột × 8 hàng (70 × 34 mm)", cols: 3, h: 34, qr: 28, page: "A4", margin: "8mm" },
  a4x10: { label: "A4 · 4 cột × 10 hàng (52 × 26 mm)", cols: 4, h: 26, qr: 21, page: "A4", margin: "8mm" },
  roll: { label: "Tem cuộn 50 × 30 mm (1 tem / trang)", cols: 1, h: 30, qr: 24, page: "50mm 30mm", margin: "0", roll: true },
};
function qrPrintIds(ids, layoutKey) {
  const L = QR_LAYOUTS[layoutKey] || QR_LAYOUTS.a3x8;
  const assets = ids.map(id => byId(DB.assets, id)).filter(Boolean);
  if (!assets.length) { alert("Chưa chọn tài sản nào."); return; }
  const w = window.open("", "_blank");
  if (!w) { alert("Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên cho trang này rồi thử lại."); return; }
  const labels = assets.map(a => `<div class="lab"><div class="q">${qrSvg(qrUrl(a), 0)}</div><div class="t"><b>${esc(a.code)}</b><span>${esc(a.name)}</span><small>${esc(depName(a.department_id) || "")}${a.serial ? " · SN " + esc(a.serial) : ""}</small></div></div>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tem QR tài sản</title><style>
    @page{size:${L.page};margin:${L.margin}} body{margin:0;font-family:Arial,sans-serif}
    .grid{display:grid;grid-template-columns:repeat(${L.cols},1fr)}
    .lab{height:${L.h}mm;box-sizing:border-box;display:flex;align-items:center;gap:2mm;padding:1.5mm;${L.roll ? "page-break-after:always;" : "border:0.2mm dashed #bbb;"}page-break-inside:avoid;overflow:hidden}
    .q{width:${L.qr}mm;height:${L.qr}mm;flex-shrink:0}.q svg{width:100%;height:100%;display:block}
    .t{display:flex;flex-direction:column;min-width:0;line-height:1.15}.t b{font-size:${L.roll ? 10 : 11}pt}.t span{font-size:${L.roll ? 7 : 8}pt;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.t small{font-size:6.5pt;color:#444}
  </style></head><body><div class="grid">${labels}</div><script>setTimeout(function(){window.print()},350)<\/script></body></html>`);
  w.document.close();
}

const qrF = { q: "", dept: "", cat: "", kind: "", loc: "", page: 1, layout: "a3x8", sel: new Set() };
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
    <div class="form-group"><label>Mẫu tem</label><select class="form-control" id="qr_layout" onchange="qrApply()">${Object.entries(QR_LAYOUTS).map(([k, v]) => `<option value="${k}" ${qrF.layout === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></div>
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
  if (!("BarcodeDetector" in window)) { modal2(`<h3 style="margin-top:0">📷 Quét QR bằng camera</h3><p>Trình duyệt này chưa hỗ trợ quét QR trực tiếp. Hãy dùng Chrome / Edge bản mới, hoặc dùng ứng dụng Camera của điện thoại để quét tem.</p><div style="text-align:right"><button class="btn" onclick="closeModal2()">Đóng</button></div>`); return; }
  const d = modal2(`<h3 style="margin-top:0">📷 Đưa tem QR vào khung hình</h3><video id="scanVid" playsinline muted style="width:100%;border-radius:12px;background:#000"></video><div id="scanMsg" class="small text-muted" style="margin:8px 0"></div><div style="text-align:right"><button class="btn" onclick="closeModal2()">Đóng</button></div>`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    window.__scanStream = stream; window.__scanOn = true;
    const vid = document.getElementById("scanVid"); vid.srcObject = stream; await vid.play();
    const det = new BarcodeDetector({ formats: ["qr_code"] });
    const tick = async () => {
      if (!window.__scanOn) return;
      try { const r = await det.detect(vid); if (r.length) { const val = r[0].rawValue; closeModal2(d); if (!qrLookup(val, true)) { /* đã báo lỗi */ } return; } } catch (e) { /* khung hình chưa sẵn sàng */ }
      setTimeout(tick, 250);
    };
    tick();
  } catch (e) { const m = document.getElementById("scanMsg"); if (m) m.textContent = "Không mở được camera: " + (e.message || e); }
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
    <div class="col col-6"><div class="form-group"><label>Địa điểm</label><select class="form-control" name="location_id"><option value="">-- Chưa gán --</option>
      ${(DB.locations || []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name))).map(l => `<option value="${l.id}" ${a && a.location_id === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div></div>
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
  a.location_id = fd.get("location_id") || null;
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
  <div class="row"><div class="col col-4"><div class="card"><h4 style="margin-top:0">🔳 Mã QR tài sản</h4><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span style="display:block;width:120px">${qrSvg(url, 120)}</span>
    <div style="min-width:0"><div class="mono small text-muted" style="word-break:break-all;margin-bottom:8px">${esc(url)}</div><button class="btn btn-sm btn-outline" onclick="qrPrintIds(['${a.id}'],'roll')">🏷️ In tem</button></div></div></div></div>
  ${isStaff2(u) ? `<div class="col col-8"><div class="card"><h4 style="margin-top:0">💿 Phần mềm đã cài (${sw.length}) · 🧩 Phụ kiện đang dùng (${acc.length})</h4>
    ${sw.length || acc.length ? `<ul style="margin:0;padding-left:18px">${sw.map(s => `<li><a data-nav="software_detail" data-params='{"id":"${s.id}"}'>${esc(s.name)}</a> ${esc(s.version || "")}</li>`).join("")}${acc.map(({ x, s }) => `<li><a data-nav="accessory_detail" data-params='{"id":"${x.id}"}'>${esc(x.name)}</a> × ${s.qty} <span class="text-muted small">(${esc(s.to_label)})</span></li>`).join("")}</ul>` : `<p class="text-muted" style="margin:0">Chưa ghi nhận phần mềm / phụ kiện cho tài sản này.</p>`}</div></div>` : ""}</div>`;
}
