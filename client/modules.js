/* ============================================================================
   MODULE: CÔNG CỤ DỤNG CỤ (CCDC) + KIỂM KÊ / ĐỐI CHIẾU
   File này được build-app.py chèn vào cuối <script> của app.html (cùng phạm vi với mã gốc).
   Hàm khai báo ở đây ghi đè hàm cùng tên của bản gốc (viewAdminInventory, submit_new_inventory).

   Phân quyền (giao diện áp dụng; máy chủ chặn ghi theo vai trò ở lib/store.ts → WRITE_ROLES):
   ┌──────────────┬───────────────────────────────────────────────────────────────────────┐
   │ admin, tcth  │ xem tất cả CCDC; cấp phát/thu hồi; phân loại TSCĐ↔CCDC; tạo/chốt phiên │
   │              │ kiểm kê; kiểm kê mọi phòng; xem nguyên giá                              │
   │ manager      │ xem CCDC phòng mình; báo hỏng/điều chuyển (quy trình có sẵn); kiểm kê   │
   │              │ phần của phòng mình trong phiên đang mở                                 │
   │ it           │ xem tất cả CCDC (không cấp phát, không xem nguyên giá)                  │
   │ user         │ chỉ xem CCDC đang được giao cho mình, báo hỏng                          │
   └──────────────┴───────────────────────────────────────────────────────────────────────┘
   ============================================================================ */

/* ---------- Tiện ích dùng chung ---------- */
const isCCDC = a => a.kind === "ccdc" || (a.kind !== "asset" && /^CC/i.test(String(a.code || "")));
const isStaffRole = u => ["admin", "tcth"].includes(u.role);
const encId = id => encodeURIComponent(String(id));
const decId = s => decodeURIComponent(String(s));
const PAGE_SIZE = 50;

function pagerHtml(total, page, fnName) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return "";
  return `<div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px">
    <button class="btn btn-sm btn-outline" ${page <= 1 ? "disabled" : ""} data-action="${fnName}:${page - 1}">‹ Trước</button>
    <span class="small text-muted">Trang ${page}/${pages} (${total} dòng)</span>
    <button class="btn btn-sm btn-outline" ${page >= pages ? "disabled" : ""} data-action="${fnName}:${page + 1}">Sau ›</button>
  </div>`;
}

function activeUsersFor(u, deptId) {
  const list = DB.users.filter(x => x.is_active !== false);
  const same = list.filter(x => deptId && x.department_id === deptId);
  const rest = list.filter(x => !(deptId && x.department_id === deptId));
  return { same, rest };
}

/* ============================================================================
   1. CÔNG CỤ DỤNG CỤ
   ============================================================================ */
const ccdcF = { q: "", dept: "", user: "", status: "", holder: "", view: "ccdc", page: 1, assignId: null };

function ccdcSetPage(p) { ccdcF.page = Number(p) || 1; render(); }
function ccdcApplyFilters() {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  ccdcF.q = g("cc_q"); ccdcF.dept = g("cc_dept"); ccdcF.status = g("cc_status"); ccdcF.holder = g("cc_holder");
  ccdcF.page = 1; render();
}
function ccdcSetView(v) { ccdcF.view = v === "all" ? "all" : "ccdc"; ccdcF.page = 1; render(); }

function ccdcList(u) {
  let list = assetsScope(u, DB.assets);
  if (!(isStaffRole(u) && ccdcF.view === "all")) list = list.filter(isCCDC);
  if (ccdcF.dept && ["admin", "tcth", "it"].includes(u.role)) list = list.filter(a => a.department_id === ccdcF.dept);
  if (ccdcF.status) list = list.filter(a => a.status === ccdcF.status);
  if (ccdcF.holder === "assigned") list = list.filter(a => a.current_user_id);
  if (ccdcF.holder === "free") list = list.filter(a => !a.current_user_id);
  if (ccdcF.q) {
    const q = stripDiacritics(ccdcF.q).toLowerCase();
    list = list.filter(a => stripDiacritics(a.code + " " + a.name + " " + (userName(a.current_user_id) || "")).toLowerCase().includes(q));
  }
  return list.slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

function viewCCDC(u) {
  const staff = isStaffRole(u);
  const all = assetsScope(u, DB.assets).filter(isCCDC);
  const kpi = {
    total: all.length,
    assigned: all.filter(a => a.current_user_id).length,
    free: all.filter(a => !a.current_user_id).length,
    broken: all.filter(a => a.status === "broken").length,
    liq: all.filter(a => a.status === "liquidation").length,
  };
  const list = ccdcList(u);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (ccdcF.page > pages) ccdcF.page = pages;
  const rows = list.slice((ccdcF.page - 1) * PAGE_SIZE, ccdcF.page * PAGE_SIZE);
  const f = ccdcF;
  const canReport = a => a.status === "in_use" && (u.role === "admin" || a.department_id === u.department_id || a.current_user_id === u.id);

  const assignCard = (() => {
    if (!staff || !f.assignId) return "";
    const a = byId(DB.assets, f.assignId);
    if (!a) return "";
    const { same, rest } = activeUsersFor(u, a.department_id);
    const opt = x => `<option value="${x.id}" ${x.id === a.current_user_id ? "selected" : ""}>${esc(x.full_name)}${x.department_id ? " · " + esc(depName(x.department_id) || "") : ""}</option>`;
    return `<div class="card" style="border:2px solid var(--brand)">
      <h4>👤 Cấp phát / thu hồi: ${esc(a.code)} · ${esc(a.name)}</h4>
      <p class="small text-muted">Phòng ban: ${esc(depName(a.department_id) || "-")} · Đang giao cho: <b>${esc(userName(a.current_user_id) || "(chưa giao)")}</b></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select id="cc_assign_sel" class="form-control" style="max-width:340px">
          <option value="">-- Chọn người nhận --</option>
          ${same.length ? `<optgroup label="Cùng phòng ban">${same.map(opt).join("")}</optgroup>` : ""}
          <optgroup label="Phòng ban khác">${rest.map(opt).join("")}</optgroup>
        </select>
        <button class="btn btn-sm" data-action="ccdcAssignApply:${encId(a.id)}">✔ Cấp phát</button>
        ${a.current_user_id ? `<button class="btn btn-sm btn-outline-danger" data-confirm="Thu hồi ${esc(a.code)} từ ${esc(userName(a.current_user_id))}?" data-action="ccdcRecall:${encId(a.id)}">↩ Thu hồi</button>` : ""}
        <button class="btn btn-sm btn-outline" data-action="ccdcAssignClose">Đóng</button>
      </div>
    </div>`;
  })();

  return `
  <div class="help-box" style="margin-bottom:14px">
    <b>Quyền của bạn (${esc(ROLE_LABELS[u.role])}):</b>
    ${u.role === "admin" || u.role === "tcth" ? "xem toàn bộ CCDC, cấp phát / thu hồi, phân loại TSCĐ ↔ CCDC, xem nguyên giá." : ""}
    ${u.role === "manager" ? "xem CCDC của phòng mình, báo hỏng hoặc lập lệnh điều chuyển (qua quy trình duyệt). Cấp phát / thu hồi do TCTH thực hiện." : ""}
    ${u.role === "it" ? "xem CCDC toàn đơn vị để hỗ trợ kỹ thuật (không cấp phát, không xem nguyên giá)." : ""}
    ${u.role === "user" ? "chỉ thấy CCDC đang được giao cho bạn; có thể báo hỏng khi thiết bị trục trặc." : ""}
  </div>

  <div class="row" style="margin-bottom:6px">
    ${[["Tổng CCDC", kpi.total, ""], ["Đã cấp phát", kpi.assigned, ""], ["Chưa giao người", kpi.free, "free"], ["Hỏng", kpi.broken, "broken"], ["Đề nghị thanh lý", kpi.liq, "liquidation"]]
      .map(([l, n]) => `<div class="col" style="min-width:140px"><div class="card" style="text-align:center;padding:12px"><div style="font-size:24px;font-weight:800">${n}</div><div class="small text-muted">${l}</div></div></div>`).join("")}
  </div>

  ${assignCard}

  <div class="card">
    <div class="filters">
      <div class="form-group"><label>Tìm mã / tên / người giữ</label><input id="cc_q" class="form-control" value="${esc(f.q)}" placeholder="VD: CC0012" onkeydown="if(event.key==='Enter') ccdcApplyFilters()"></div>
      ${["admin", "tcth", "it"].includes(u.role) ? `<div class="form-group"><label>Phòng ban</label>
        <select id="cc_dept" class="form-control" onchange="ccdcApplyFilters()"><option value="">-- Tất cả --</option>
        ${DB.departments.map(d => `<option value="${d.id}" ${f.dept === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>` : ""}
      <div class="form-group"><label>Trạng thái</label>
        <select id="cc_status" class="form-control" onchange="ccdcApplyFilters()"><option value="">-- Tất cả --</option>
        ${Object.keys(STATUS_LABELS).map(k => `<option value="${k}" ${f.status === k ? "selected" : ""}>${esc(STATUS_LABELS[k])}</option>`).join("")}</select></div>
      ${u.role !== "user" ? `<div class="form-group"><label>Người giữ</label>
        <select id="cc_holder" class="form-control" onchange="ccdcApplyFilters()">
          <option value="">-- Tất cả --</option><option value="assigned" ${f.holder === "assigned" ? "selected" : ""}>Đã giao người</option>
          <option value="free" ${f.holder === "free" ? "selected" : ""}>Chưa giao người</option></select></div>` : ""}
      <button class="btn btn-sm" data-action="ccdcApplyFilters" style="height:36px;align-self:flex-end">🔍 Lọc</button>
      <button class="btn btn-sm btn-outline" data-action="ccdcExportCSV" style="height:36px;align-self:flex-end">⬇ Xuất CSV</button>
    </div>
    ${staff ? `<div style="margin-top:8px" class="small">
      Chế độ hiển thị:
      <a class="chip ${f.view === "ccdc" ? "active" : ""}" data-action="ccdcSetView:ccdc">Chỉ CCDC</a>
      <a class="chip ${f.view === "all" ? "active" : ""}" data-action="ccdcSetView:all">Tất cả (để phân loại lại)</a>
      <span class="text-muted">· Hệ thống tự nhận CCDC theo mã bắt đầu bằng <b>CC</b> hoặc khi nhập file CC0203; mục nhận sai có thể sửa ở đây.</span>
    </div>` : ""}
  </div>

  <div class="card">
    ${staff && f.view === "all" ? `<div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="small text-muted">Với các dòng đã tích:</span>
      <button class="btn btn-sm" data-action="ccdcBulkKind:ccdc">→ Đặt là CCDC</button>
      <button class="btn btn-sm btn-outline" data-action="ccdcBulkKind:asset">→ Đặt là Tài sản cố định</button>
      <button class="btn btn-sm btn-outline" data-action="ccdcBulkKind:auto">→ Tự nhận theo mã</button>
    </div>` : ""}
    <table>
      <thead><tr>
        ${staff && f.view === "all" ? `<th style="width:24px"><input type="checkbox" onclick="document.querySelectorAll('.ccChk').forEach(c=>c.checked=this.checked)"></th>` : ""}
        <th>Mã</th><th>Tên</th>${staff && f.view === "all" ? "<th>Loại</th>" : ""}<th>Nhóm</th><th>Phòng ban</th><th>Người giữ</th>
        ${staff ? '<th class="text-end">Nguyên giá</th>' : ""}<th>Trạng thái</th><th></th>
      </tr></thead>
      <tbody>
      ${rows.map(a => `<tr>
        ${staff && f.view === "all" ? `<td><input type="checkbox" class="ccChk" value="${esc(a.id)}"></td>` : ""}
        <td><a data-nav="asset_detail" data-params='{"id":"${esc(a.id)}"}'>${esc(a.code)}</a></td>
        <td>${esc(a.name)}</td>
        ${staff && f.view === "all" ? `<td>${isCCDC(a) ? "CCDC" : "TSCĐ"}${a.kind ? "" : ' <span class="small text-muted">(tự nhận)</span>'}</td>` : ""}
        <td>${esc(catName(a.category_id) || "-")}</td>
        <td>${esc(depName(a.department_id) || "-")}</td>
        <td>${a.current_user_id ? esc(userName(a.current_user_id)) : '<span class="text-muted">—</span>'}</td>
        ${staff ? `<td class="text-end" style="white-space:nowrap">${fmtVND(a.original_value)}</td>` : ""}
        <td><span class="badge badge-${a.status}">${esc(STATUS_LABELS[a.status] || a.status)}</span></td>
        <td style="white-space:nowrap">
          ${staff ? `<button class="btn btn-sm btn-outline" data-action="ccdcAssignOpen:${encId(a.id)}">👤 Cấp phát</button>` : ""}
          ${canReport(a) ? `<a class="btn btn-sm btn-outline-danger" data-nav="repair_new" data-params='{"assetId":"${esc(a.id)}"}'>🛠️ Báo hỏng</a>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="10" class="text-muted" style="text-align:center;padding:18px">Không có công cụ dụng cụ nào trong phạm vi của bạn.</td></tr>`}
      </tbody>
    </table>
    ${pagerHtml(list.length, f.page, "ccdcSetPage")}
  </div>`;
}

function ccdcAssignOpen(id) { ccdcF.assignId = decId(id); render(); window.scrollTo(0, 0); }
function ccdcAssignClose() { ccdcF.assignId = null; render(); }

function ccdcAssignApply(id) {
  const u = currentUser();
  if (!isStaffRole(u)) { flash("Chỉ Admin/TCTH được cấp phát CCDC.", "error"); render(); return; }
  const a = byId(DB.assets, decId(id));
  const sel = document.getElementById("cc_assign_sel");
  const newId = sel ? sel.value : "";
  if (!a) return;
  if (!newId) { alert("Hãy chọn người nhận."); return; }
  if (newId === a.current_user_id) { alert("CCDC đang giao cho người này rồi."); return; }
  const oldName = userName(a.current_user_id);
  a.current_user_id = newId; a.updated_at = nowIso();
  logHistory(a.id, "assign_user", `Cấp phát CCDC: ${oldName || "(chưa giao)"} → ${userName(newId)}`);
  ccdcF.assignId = null;
  saveDB(); flash(`Đã cấp phát ${a.code} cho ${userName(newId)}.`); render();
}

function ccdcRecall(id) {
  const u = currentUser();
  if (!isStaffRole(u)) { flash("Chỉ Admin/TCTH được thu hồi CCDC.", "error"); render(); return; }
  const a = byId(DB.assets, decId(id));
  if (!a || !a.current_user_id) return;
  const old = userName(a.current_user_id);
  a.current_user_id = null; a.updated_at = nowIso();
  logHistory(a.id, "assign_user", `Thu hồi CCDC từ ${old} (về TCTH / dùng chung)`);
  ccdcF.assignId = null;
  saveDB(); flash(`Đã thu hồi ${a.code} từ ${old}.`); render();
}

function ccdcApplyKind(ids, kind) {
  const u = currentUser();
  if (!isStaffRole(u)) { flash("Chỉ Admin/TCTH được phân loại.", "error"); render(); return 0; }
  let n = 0;
  ids.forEach(id => {
    const a = byId(DB.assets, id);
    if (!a) return;
    if (kind === "auto") delete a.kind; else a.kind = kind;
    a.updated_at = nowIso();
    n++;
  });
  return n;
}
function ccdcBulkKind(kind) {
  const ids = Array.from(document.querySelectorAll(".ccChk:checked")).map(c => c.value);
  if (!ids.length) { alert("Hãy tích chọn ít nhất một dòng."); return; }
  const lbl = { ccdc: "CCDC", asset: "Tài sản cố định", auto: "Tự nhận theo mã" }[kind];
  if (!confirm(`Đặt ${ids.length} mục thành "${lbl}"?`)) return;
  const n = ccdcApplyKind(ids, kind);
  saveDB(); flash(`Đã phân loại ${n} mục: ${lbl}.`); render();
}
function setAssetKind(id, kind) {
  const a = byId(DB.assets, decId(id));
  if (!a) return;
  ccdcApplyKind([a.id], kind);
  logHistory(a.id, "update", `Phân loại hồ sơ: ${kind === "auto" ? "tự nhận theo mã" : kind === "ccdc" ? "Công cụ dụng cụ" : "Tài sản cố định"}`);
  saveDB(); flash("Đã cập nhật phân loại."); nav("asset_detail", { id: a.id });
}
function ccdcKindCard(a, u) {
  if (!isStaffRole(u)) return "";
  return `<div class="card"><h4>🏷️ Phân loại hồ sơ</h4>
    <p>Hiện là: <b>${isCCDC(a) ? "Công cụ dụng cụ (CCDC)" : "Tài sản cố định (TSCĐ)"}</b> ${a.kind ? "" : '<span class="small text-muted">(tự nhận theo mã)</span>'}</p>
    <button class="btn btn-sm" data-action="setAssetKind:${encId(a.id)}:ccdc">Đặt là CCDC</button>
    <button class="btn btn-sm btn-outline" data-action="setAssetKind:${encId(a.id)}:asset">Đặt là TSCĐ</button>
    <button class="btn btn-sm btn-outline" data-action="setAssetKind:${encId(a.id)}:auto">Tự nhận theo mã</button>
  </div>`;
}

function ccdcExportCSV() {
  const u = currentUser(), staff = isStaffRole(u);
  const list = ccdcList(u);
  if (!list.length) { alert("Không có dòng nào để xuất."); return; }
  const headers = ["Mã", "Tên", "Nhóm", "Phòng ban", "Người giữ", "Trạng thái"].concat(staff ? ["Nguyên giá", "Giá trị còn lại"] : []);
  const lines = [headers.map(csvEscape).join(",")];
  list.forEach(a => lines.push([a.code, a.name, catName(a.category_id) || "", depName(a.department_id) || "", userName(a.current_user_id) || "", STATUS_LABELS[a.status] || a.status]
    .concat(staff ? [a.original_value, a.remaining_value] : []).map(csvEscape).join(",")));
  downloadCSV(lines, "CCDC");
}
function downloadCSV(lines, prefix) {
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ============================================================================
   2. KIỂM KÊ / ĐỐI CHIẾU
   Phiên kiểm kê  = bản ghi trong inventoryChecks (có status open/closed, kind_scope).
   Kết quả từng dòng = bản ghi trong inventoryLines, id = "<checkId>__<assetId>".
   Dòng "thừa" (có thực tế, không có trong sổ) có id "<checkId>__x_<uid>", extra:true.
   ============================================================================ */
const invF = { tab: "all", q: "", page: 1 };
const INV_RESULT = {
  ok: { label: "Có, đúng", icon: "✅", color: "#16a34a" },
  missing: { label: "Không thấy", icon: "❌", color: "#dc2626" },
  mismatch: { label: "Sai thông tin", icon: "⚠️", color: "#d97706" },
};
const KIND_SCOPE_LABELS = { all: "Tất cả (TSCĐ + CCDC)", asset: "Chỉ tài sản cố định", ccdc: "Chỉ công cụ dụng cụ" };

const invCanMark = u => isStaffRole(u) || u.role === "manager";
const invOpen = c => c.status !== "closed";

function invSessionsFor(u) {
  const all = DB.inventoryChecks.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (isStaffRole(u)) return all;
  if (u.role === "manager") return all.filter(c => c.department_id === "ALL" || c.department_id === u.department_id);
  return [];
}
function invAssets(c, u) {
  let list = DB.assets.filter(a => c.department_id === "ALL" || a.department_id === c.department_id);
  if (c.kind_scope === "ccdc") list = list.filter(isCCDC);
  else if (c.kind_scope === "asset") list = list.filter(a => !isCCDC(a));
  if (!isStaffRole(u)) list = list.filter(a => a.department_id === u.department_id);
  return list.slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
function invLines(c) { return DB.inventoryLines.filter(l => l.check_id === c.id); }
function invStats(c, u) {
  const assets = invAssets(c, u);
  const lines = invLines(c);
  const by = new Map(lines.filter(l => !l.extra).map(l => [l.asset_id, l]));
  const st = { total: assets.length, ok: 0, missing: 0, mismatch: 0, unchecked: 0, extra: 0 };
  assets.forEach(a => { const l = by.get(a.id); if (l && st[l.result] !== undefined) st[l.result]++; else st.unchecked++; });
  st.extra = lines.filter(l => l.extra && (isStaffRole(u) || l.department_id === u.department_id)).length;
  st.checked = st.total - st.unchecked;
  st.pct = st.total ? Math.round(st.checked * 100 / st.total) : 0;
  return st;
}

function viewAdminInventory(u) {
  if (!invCanMark(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const staff = isStaffRole(u);
  const qLabel = currentQuarterLabel(), hLabel = currentHalfYearLabel();
  const sessions = invSessionsFor(u);
  return `
  <div class="help-box" style="margin-bottom:14px">
    <b>Cách làm:</b> TCTH/Admin tạo <b>phiên kiểm kê</b> (theo phòng ban, theo loại) → người kiểm tích từng tài sản <b>✅ Có / ❌ Không thấy / ⚠️ Sai thông tin</b>,
    ghi thêm tài sản <b>thừa</b> (có thực tế mà không có trong sổ) → <b>Chốt phiên</b> → in biên bản đối chiếu hoặc xuất CSV chênh lệch.
    ${u.role === "manager" ? "<br>Lãnh đạo phòng chỉ kiểm kê phần của <b>phòng mình</b> trong phiên đang mở." : ""}
  </div>
  <div class="row">
    ${staff ? `<div class="col col-4"><div class="card">
      <h4>➕ Tạo phiên kiểm kê</h4>
      <form data-form="new_inventory">
        <div class="form-group"><label>Phạm vi</label>
          <select class="form-control" name="department_id" required><option value="">-- Chọn --</option>
          <option value="ALL">🏢 Toàn chi nhánh (tất cả phòng ban)</option>
          ${DB.departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
        <div class="form-group"><label>Đối tượng kiểm kê</label>
          <select class="form-control" name="kind_scope">
            ${Object.keys(KIND_SCOPE_LABELS).map(k => `<option value="${k}">${esc(KIND_SCOPE_LABELS[k])}</option>`).join("")}</select></div>
        <div class="form-group"><label>Kỳ kiểm kê</label>
          <select class="form-control" name="period_type">
            <option value="quarter">Theo Quý (${qLabel})</option>
            <option value="half_year">Theo Bán niên (${hLabel})</option></select></div>
        <div class="form-group"><label>Ghi chú</label><textarea class="form-control" name="note" rows="2"></textarea></div>
        <button class="btn btn-sm btn-block" type="submit">Tạo phiên</button>
      </form>
    </div></div>` : ""}
    <div class="col ${staff ? "col-8" : "col-12"}"><div class="card">
      <h4>Các phiên kiểm kê (${sessions.length})</h4>
      <table><thead><tr><th>Phạm vi</th><th>Đối tượng</th><th>Kỳ</th><th>Trạng thái</th><th>Tiến độ</th><th>Người tạo</th><th></th></tr></thead><tbody>
      ${sessions.map(c => {
        const st = invStats(c, u);
        return `<tr>
        <td>${c.department_id === "ALL" ? "🏢 Toàn chi nhánh" : esc(depName(c.department_id) || "-")}<div class="small text-muted">${esc(c.note || "")}</div></td>
        <td>${esc(KIND_SCOPE_LABELS[c.kind_scope || "all"])}</td>
        <td>${esc(c.period_label)}<div class="small text-muted">${fmtDateTime(c.created_at)}</div></td>
        <td>${invOpen(c) ? '<span class="badge badge-pending_confirm">Đang mở</span>' : '<span class="badge badge-completed">Đã chốt</span>'}</td>
        <td style="min-width:130px"><div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${st.pct}%"></div></div>
          <div class="small text-muted">${st.checked}/${st.total} (${st.pct}%)${st.missing || st.mismatch ? ` · lệch ${st.missing + st.mismatch}` : ""}</div></td>
        <td>${esc(userName(c.created_by) || "-")}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-action="invOpenRun:${encId(c.id)}">${invOpen(c) ? "▶ Kiểm kê" : "📊 Kết quả"}</button>
          ${staff ? `<button class="btn btn-sm btn-outline" data-action="printInventoryReport:${c.id}" title="In danh sách theo mẫu có sẵn">🖨️ Mẫu</button>` : ""}
        </td></tr>`;
      }).join("") || `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:18px">Chưa có phiên kiểm kê nào.</td></tr>`}
      </tbody></table>
    </div></div>
  </div>`;
}

function submit_new_inventory(form) {
  const u = currentUser();
  if (!isStaffRole(u)) { flash("Chỉ Admin/TCTH được tạo phiên kiểm kê.", "error"); render(); return; }
  const fd = new FormData(form);
  const periodType = fd.get("period_type");
  const label = periodType === "quarter" ? currentQuarterLabel() : currentHalfYearLabel();
  const id = uid();
  DB.inventoryChecks.push({
    id, department_id: fd.get("department_id"), kind_scope: fd.get("kind_scope") || "all", period_type: periodType,
    period_label: label, note: (fd.get("note") || "").trim(), status: "open", created_by: u.id, created_at: nowIso(),
  });
  saveDB(); flash(`Đã tạo phiên kiểm kê kỳ ${label}. Bấm "Kiểm kê" để bắt đầu.`); nav("admin_inventory");
}

function invOpenRun(id) { invF.tab = "all"; invF.q = ""; invF.page = 1; nav("inventory_run", { id: decId(id) }); }
function invSetTab(t) { invF.tab = t; invF.page = 1; render(); }
function invSetPage(p) { invF.page = Number(p) || 1; render(); }
function invSearch(v) { invF.q = v; invF.page = 1; render(); }

function invMark(checkId, assetId, result) {
  const u = currentUser();
  const c = byId(DB.inventoryChecks, decId(checkId));
  const a = byId(DB.assets, decId(assetId));
  if (!c || !a || !invCanMark(u) || !invOpen(c)) { flash("Không thể ghi kết quả (phiên đã chốt hoặc bạn không có quyền).", "error"); render(); return; }
  if (!isStaffRole(u) && a.department_id !== u.department_id) { flash("Chỉ được kiểm kê tài sản của phòng mình.", "error"); render(); return; }
  const lid = `${c.id}__${a.id}`;
  const idx = DB.inventoryLines.findIndex(l => l.id === lid);
  if (result === "clear") {
    if (idx >= 0) DB.inventoryLines.splice(idx, 1);
    saveDB(); render(); return;
  }
  let note = "";
  if (result === "missing" || result === "mismatch") {
    const msg = result === "missing" ? "Không thấy tài sản này. Ghi chú (đã tìm ở đâu, ai giữ lần cuối…):" : "Sai thông tin gì? (người dùng, vị trí, tình trạng, nhãn…):";
    const r = prompt(msg, idx >= 0 ? (DB.inventoryLines[idx].note || "") : "");
    if (r === null) return;
    note = r.trim();
    if (!note) { alert("Cần ghi chú ngắn để TCTH đối chiếu."); return; }
  }
  const line = { id: lid, check_id: c.id, asset_id: a.id, asset_code: a.code, department_id: a.department_id, result, note, checked_by: u.id, checked_at: nowIso() };
  if (idx >= 0) DB.inventoryLines[idx] = line; else DB.inventoryLines.push(line);
  saveDB(); render();
}

function invMarkAllOk(checkId) {
  const u = currentUser();
  const c = byId(DB.inventoryChecks, decId(checkId));
  if (!c || !invCanMark(u) || !invOpen(c)) return;
  const by = new Set(invLines(c).filter(l => !l.extra).map(l => l.asset_id));
  const todo = invFilteredAssets(c, u).filter(a => !by.has(a.id));
  if (!todo.length) { alert("Không có dòng chưa kiểm nào trong danh sách đang lọc."); return; }
  if (!confirm(`Đánh dấu ✅ "Có, đúng" cho ${todo.length} tài sản CHƯA KIỂM đang hiển thị (theo bộ lọc hiện tại)?\nChỉ làm khi bạn đã đối chiếu thực tế đủ các tài sản này.`)) return;
  const now = nowIso();
  todo.forEach(a => DB.inventoryLines.push({ id: `${c.id}__${a.id}`, check_id: c.id, asset_id: a.id, asset_code: a.code, department_id: a.department_id, result: "ok", note: "", checked_by: u.id, checked_at: now }));
  saveDB(); flash(`Đã đánh dấu Có cho ${todo.length} tài sản.`); render();
}

function invFilteredAssets(c, u) {
  const by = new Map(invLines(c).filter(l => !l.extra).map(l => [l.asset_id, l]));
  let list = invAssets(c, u);
  if (["ok", "missing", "mismatch"].includes(invF.tab)) list = list.filter(a => by.get(a.id) && by.get(a.id).result === invF.tab);
  else if (invF.tab === "unchecked") list = list.filter(a => !by.get(a.id));
  if (invF.q) {
    const q = stripDiacritics(invF.q).toLowerCase();
    list = list.filter(a => stripDiacritics(a.code + " " + a.name + " " + (userName(a.current_user_id) || "")).toLowerCase().includes(q));
  }
  return list;
}

function viewInventoryRun(u, id) {
  if (!invCanMark(u)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const c = byId(DB.inventoryChecks, id);
  if (!c) return `<div class="alert alert-error">Không tìm thấy phiên kiểm kê.</div>`;
  if (!isStaffRole(u) && c.department_id !== "ALL" && c.department_id !== u.department_id) return `<div class="alert alert-error">Phiên này không thuộc phòng ban của bạn.</div>`;
  const staff = isStaffRole(u);
  const canMark = invOpen(c);
  const st = invStats(c, u);
  const by = new Map(invLines(c).filter(l => !l.extra).map(l => [l.asset_id, l]));
  const extras = invLines(c).filter(l => l.extra && (staff || l.department_id === u.department_id));
  const list = invFilteredAssets(c, u);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (invF.page > pages) invF.page = pages;
  const rows = list.slice((invF.page - 1) * PAGE_SIZE, invF.page * PAGE_SIZE);
  const tab = (key, label, n) => `<a class="chip ${invF.tab === key ? "active" : ""}" data-action="invSetTab:${key}">${label}${n === undefined ? "" : ` (${n})`}</a>`;
  const cid = encId(c.id);

  return `
  <div class="top-actions"><a class="btn btn-sm btn-outline" data-nav="admin_inventory">‹ Danh sách phiên</a></div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h4 style="margin:0">${c.department_id === "ALL" ? "🏢 Toàn chi nhánh" : esc(depName(c.department_id))} · ${esc(KIND_SCOPE_LABELS[c.kind_scope || "all"])} · ${esc(c.period_label)}</h4>
        <div class="small text-muted">Tạo bởi ${esc(userName(c.created_by) || "-")} lúc ${fmtDateTime(c.created_at)}${c.note ? " · " + esc(c.note) : ""}
        ${c.status === "closed" ? ` · <b>Đã chốt</b> bởi ${esc(userName(c.closed_by) || "-")} lúc ${fmtDateTime(c.closed_at)}` : ""}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
        <button class="btn btn-sm btn-outline" data-action="invPrint:${cid}">🖨️ In biên bản đối chiếu</button>
        <button class="btn btn-sm btn-outline" data-action="invExportCSV:${cid}">⬇ CSV kết quả</button>
        ${staff && canMark ? `<button class="btn btn-sm" data-confirm="Chốt phiên kiểm kê? Sau khi chốt không ghi thêm kết quả được (Admin có thể mở lại)." data-action="invClose:${cid}">🔒 Chốt phiên</button>` : ""}
        ${u.role === "admin" && !canMark ? `<button class="btn btn-sm btn-outline-danger" data-action="invReopen:${cid}">🔓 Mở lại</button>` : ""}
      </div>
    </div>
    <div class="progress-bar-outer" style="margin:12px 0 6px"><div class="progress-bar-inner" style="width:${st.pct}%"></div></div>
    <div class="small">Đã kiểm <b>${st.checked}/${st.total}</b> (${st.pct}%) ·
      <span style="color:#16a34a">✅ ${st.ok}</span> · <span style="color:#dc2626">❌ ${st.missing}</span> ·
      <span style="color:#d97706">⚠️ ${st.mismatch}</span> · chưa kiểm ${st.unchecked} · thừa ${st.extra}</div>
    ${!canMark ? `<div class="alert alert-info" style="margin-top:10px">Phiên đã chốt: chỉ xem. ${u.role === "admin" ? "Admin có thể mở lại nếu cần bổ sung." : ""}</div>` : ""}
  </div>

  <div class="card">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      ${tab("all", "Tất cả", st.total)}${tab("unchecked", "Chưa kiểm", st.unchecked)}${tab("ok", "✅ Có", st.ok)}${tab("missing", "❌ Không thấy", st.missing)}${tab("mismatch", "⚠️ Sai TT", st.mismatch)}
      <input class="form-control" id="inv_q" placeholder="🔍 Mã, tên, người dùng (Enter)" value="${esc(invF.q)}" style="max-width:280px;margin-left:auto"
        onkeydown="if(event.key==='Enter') invSearch(this.value)">
      ${canMark ? `<button class="btn btn-sm btn-outline" data-action="invMarkAllOk:${cid}" title="Chỉ các dòng chưa kiểm đang hiển thị">✅ Đánh dấu Có cho dòng chưa kiểm đang lọc</button>` : ""}
    </div>
    <table>
      <thead><tr><th>Mã</th><th>Tên</th><th>Phòng ban</th><th>Người dùng (theo sổ)</th><th>Trạng thái sổ</th><th>Kết quả kiểm kê</th>${canMark ? "<th></th>" : ""}</tr></thead>
      <tbody>
      ${rows.map(a => {
        const l = by.get(a.id);
        const r = l ? INV_RESULT[l.result] : null;
        return `<tr>
          <td><a data-nav="asset_detail" data-params='{"id":"${esc(a.id)}"}'>${esc(a.code)}</a></td>
          <td>${esc(a.name)}${isCCDC(a) ? ' <span class="small text-muted">· CCDC</span>' : ""}</td>
          <td>${esc(depName(a.department_id) || "-")}</td>
          <td>${esc(userName(a.current_user_id) || "-")}</td>
          <td><span class="badge badge-${a.status}">${esc(STATUS_LABELS[a.status] || a.status)}</span></td>
          <td>${r ? `<b style="color:${r.color}">${r.icon} ${r.label}</b>${l.note ? `<div class="small">${esc(l.note)}</div>` : ""}<div class="small text-muted">${esc(userName(l.checked_by) || "")} · ${fmtDateTime(l.checked_at)}</div>` : '<span class="text-muted">Chưa kiểm</span>'}</td>
          ${canMark ? `<td style="white-space:nowrap">
            <button class="btn btn-sm" title="Có, đúng" data-action="invMark:${cid}:${encId(a.id)}:ok">✅</button>
            <button class="btn btn-sm btn-outline-danger" title="Không thấy" data-action="invMark:${cid}:${encId(a.id)}:missing">❌</button>
            <button class="btn btn-sm btn-outline" title="Sai thông tin" data-action="invMark:${cid}:${encId(a.id)}:mismatch">⚠️</button>
            ${l ? `<button class="btn btn-sm btn-outline" title="Bỏ kết quả" data-action="invMark:${cid}:${encId(a.id)}:clear">↩</button>` : ""}
          </td>` : ""}
        </tr>`;
      }).join("") || `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:18px">Không có dòng nào theo bộ lọc.</td></tr>`}
      </tbody>
    </table>
    ${pagerHtml(list.length, invF.page, "invSetPage")}
  </div>

  <div class="card">
    <h4>➕ Tài sản thừa <span class="small text-muted">(có thực tế nhưng không có trong sổ) · ${extras.length} dòng</span></h4>
    ${canMark ? `<form data-form="inv_extra" data-check-id="${esc(c.id)}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
      <div class="form-group" style="margin:0"><label>Mã/nhãn (nếu có)</label><input class="form-control" name="code" style="width:140px"></div>
      <div class="form-group" style="margin:0"><label>Tên / mô tả *</label><input class="form-control" name="name" required style="width:240px"></div>
      <div class="form-group" style="margin:0"><label>Phòng ban</label><select class="form-control" name="department_id">
        ${(staff ? DB.departments : DB.departments.filter(d => d.id === u.department_id)).map(d => `<option value="${d.id}" ${d.id === u.department_id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
      <div class="form-group" style="margin:0"><label>Ghi chú</label><input class="form-control" name="note" style="width:200px"></div>
      <button class="btn btn-sm" type="submit">Ghi nhận</button>
    </form>` : ""}
    ${extras.length ? `<table><thead><tr><th>Mã/nhãn</th><th>Mô tả</th><th>Phòng ban</th><th>Ghi chú</th><th>Người ghi</th>${canMark ? "<th></th>" : ""}</tr></thead><tbody>
      ${extras.map(l => `<tr><td>${esc(l.asset_code || "-")}</td><td>${esc(l.name)}</td><td>${esc(depName(l.department_id) || "-")}</td><td>${esc(l.note || "")}</td>
        <td>${esc(userName(l.checked_by) || "")}<div class="small text-muted">${fmtDateTime(l.checked_at)}</div></td>
        ${canMark ? `<td><button class="btn btn-sm btn-outline-danger" data-confirm="Xoá dòng thừa này?" data-action="invDelExtra:${cid}:${encId(l.id)}">🗑</button></td>` : ""}</tr>`).join("")}
    </tbody></table>` : '<p class="text-muted small">Chưa ghi nhận tài sản thừa.</p>'}
  </div>`;
}

function submit_inv_extra(form) {
  const u = currentUser();
  const c = byId(DB.inventoryChecks, form.dataset.checkId);
  if (!c || !invCanMark(u) || !invOpen(c)) { flash("Không thể ghi (phiên đã chốt hoặc không có quyền).", "error"); render(); return; }
  const fd = new FormData(form);
  const dept = fd.get("department_id");
  if (!isStaffRole(u) && dept !== u.department_id) { flash("Chỉ ghi nhận cho phòng của bạn.", "error"); render(); return; }
  const name = (fd.get("name") || "").trim();
  if (!name) return;
  DB.inventoryLines.push({
    id: `${c.id}__x_${uid()}`, check_id: c.id, extra: true, asset_id: null, asset_code: (fd.get("code") || "").trim(), name,
    department_id: dept, result: "extra", note: (fd.get("note") || "").trim(), checked_by: u.id, checked_at: nowIso(),
  });
  saveDB(); flash("Đã ghi nhận tài sản thừa."); render();
}
function invDelExtra(checkId, lineId) {
  const c = byId(DB.inventoryChecks, decId(checkId));
  const u = currentUser();
  if (!c || !invOpen(c) || !invCanMark(u)) return;
  const i = DB.inventoryLines.findIndex(l => l.id === decId(lineId) && l.extra);
  if (i >= 0) { DB.inventoryLines.splice(i, 1); saveDB(); render(); }
}

function invClose(checkId) {
  const u = currentUser();
  const c = byId(DB.inventoryChecks, decId(checkId));
  if (!c || !isStaffRole(u) || !invOpen(c)) return;
  const st = invStats(c, u);
  c.status = "closed"; c.closed_by = u.id; c.closed_at = nowIso();
  c.summary = { total: st.total, ok: st.ok, missing: st.missing, mismatch: st.mismatch, unchecked: st.unchecked, extra: st.extra };
  saveDB(); flash(`Đã chốt phiên kiểm kê (${st.checked}/${st.total} đã kiểm, ${st.unchecked} chưa kiểm).`); render();
}
function invReopen(checkId) {
  const u = currentUser();
  const c = byId(DB.inventoryChecks, decId(checkId));
  if (!c || u.role !== "admin" || invOpen(c)) return;
  c.status = "open"; delete c.closed_by; delete c.closed_at; delete c.summary;
  saveDB(); flash("Đã mở lại phiên kiểm kê."); render();
}

/* ---------- Kết quả: CSV + biên bản đối chiếu ---------- */
function invResultRows(c, u) {
  const by = new Map(invLines(c).filter(l => !l.extra).map(l => [l.asset_id, l]));
  const rows = invAssets(c, u).map(a => {
    const l = by.get(a.id);
    return { a, l, label: l ? INV_RESULT[l.result].label : "Chưa kiểm", key: l ? l.result : "unchecked" };
  });
  const extras = invLines(c).filter(l => l.extra && (isStaffRole(u) || l.department_id === u.department_id));
  return { rows, extras };
}
function invExportCSV(checkId) {
  const u = currentUser(), staff = isStaffRole(u);
  const c = byId(DB.inventoryChecks, decId(checkId));
  if (!c || !invCanMark(u)) return;
  const { rows, extras } = invResultRows(c, u);
  const headers = ["Loại dòng", "Mã", "Tên", "Phòng ban", "Người dùng (sổ)", "Trạng thái sổ", "Kết quả", "Ghi chú", "Người kiểm", "Thời điểm"].concat(staff ? ["Nguyên giá"] : []);
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach(({ a, l, label }) => lines.push(["Trong sổ", a.code, a.name, depName(a.department_id) || "", userName(a.current_user_id) || "", STATUS_LABELS[a.status] || a.status,
    label, l ? l.note : "", l ? userName(l.checked_by) || "" : "", l ? fmtDateTime(l.checked_at) : ""].concat(staff ? [a.original_value] : []).map(csvEscape).join(",")));
  extras.forEach(l => lines.push(["Thừa", l.asset_code || "", l.name, depName(l.department_id) || "", "", "", "Thừa (không có trong sổ)", l.note || "", userName(l.checked_by) || "", fmtDateTime(l.checked_at)]
    .concat(staff ? [""] : []).map(csvEscape).join(",")));
  downloadCSV(lines, `KiemKe_${c.period_label}`);
}
function invPrint(checkId) {
  const u = currentUser(), staff = isStaffRole(u);
  const c = byId(DB.inventoryChecks, decId(checkId));
  if (!c || !invCanMark(u)) return;
  const { rows, extras } = invResultRows(c, u);
  const st = invStats(c, u);
  const scope = c.department_id === "ALL" ? "Toàn chi nhánh" : (depName(c.department_id) || "-");
  const diff = rows.filter(r => r.key === "missing" || r.key === "mismatch");
  const tr = (r, i) => `<tr><td>${i + 1}</td><td>${esc(r.a.code)}</td><td>${esc(r.a.name)}</td><td>${esc(depName(r.a.department_id) || "-")}</td>
    <td>${esc(userName(r.a.current_user_id) || "-")}</td>${staff ? `<td class="text-end" style="white-space:nowrap">${fmtVND(r.a.original_value)}</td>` : ""}
    <td>${esc(r.label)}</td><td>${esc(r.l ? r.l.note : "")}</td></tr>`;
  const head = `<tr><th>STT</th><th>Mã</th><th>Tên</th><th>Phòng ban</th><th>Người dùng (sổ)</th>${staff ? "<th>Nguyên giá</th>" : ""}<th>Kết quả</th><th>Ghi chú</th></tr>`;
  const body = `
    ${reportLetterheadHtml()}
    <h2 style="text-align:center;margin:18px 0 4px">BIÊN BẢN ĐỐI CHIẾU KIỂM KÊ</h2>
    <p style="text-align:center;margin:0 0 14px">Kỳ: <b>${esc(c.period_label)}</b> · Phạm vi: <b>${esc(scope)}</b> · Đối tượng: <b>${esc(KIND_SCOPE_LABELS[c.kind_scope || "all"])}</b><br>
      Trạng thái phiên: <b>${invOpen(c) ? "ĐANG MỞ (chưa chốt)" : "Đã chốt " + fmtDateTime(c.closed_at)}</b></p>
    <table class="print-table" style="margin-bottom:14px"><thead><tr><th>Tổng theo sổ</th><th>Có, đúng</th><th>Không thấy</th><th>Sai thông tin</th><th>Chưa kiểm</th><th>Thừa</th></tr></thead>
      <tbody><tr style="text-align:center"><td>${st.total}</td><td>${st.ok}</td><td>${st.missing}</td><td>${st.mismatch}</td><td>${st.unchecked}</td><td>${st.extra}</td></tr></tbody></table>
    <h3>A. Chênh lệch cần xử lý (${diff.length})</h3>
    <table class="print-table"><thead>${head}</thead><tbody>${diff.map(tr).join("") || `<tr><td colspan="8" style="text-align:center">Không có chênh lệch.</td></tr>`}</tbody></table>
    <h3 style="margin-top:16px">B. Tài sản thừa, không có trong sổ (${extras.length})</h3>
    <table class="print-table"><thead><tr><th>STT</th><th>Mã/nhãn</th><th>Mô tả</th><th>Phòng ban</th><th>Ghi chú</th></tr></thead><tbody>
      ${extras.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.asset_code || "-")}</td><td>${esc(l.name)}</td><td>${esc(depName(l.department_id) || "-")}</td><td>${esc(l.note || "")}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center">Không có.</td></tr>`}
    </tbody></table>
    <h3 style="margin-top:16px">C. Toàn bộ danh sách (${rows.length})</h3>
    <table class="print-table"><thead>${head}</thead><tbody>${rows.map(tr).join("")}</tbody></table>
    ${reportSignatureHtml()}`;
  openPrintWindow(body, `Doi_chieu_kiem_ke_${c.period_label}`);
}
