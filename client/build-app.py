# Tạo public/app.html từ file 704-assets offline gốc + lớp đồng bộ máy chủ.
# Chạy: python3 -I client/build-app.py <đường dẫn file offline gốc>
import re, sys, pathlib

src_path = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent.parent
engine = (root / "client" / "sync-engine.js").read_text(encoding="utf8")
modules = (root / "client" / "modules.js").read_text(encoding="utf8")
qr = (root / "client" / "qr.js").read_text(encoding="utf8")
modules2 = (root / "client" / "modules2.js").read_text(encoding="utf8")
s = src_path.read_text(encoding="utf8")

def sub_once(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] mong đợi 1 vị trí, tìm thấy {n}")
    s = s.replace(old, new)

def regex_once(pattern, repl, label, flags=re.S):
    global s
    s, n = re.subn(pattern, lambda m: repl, s, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f"[{label}] không tìm thấy mẫu")

# 1. Lớp dữ liệu: thay localStorage bằng lớp đồng bộ
regex_once(r'let DB = null;\nfunction loadDB\(\)\{.*?function hardReset\(\)\{ localStorage\.removeItem\(STORAGE_KEY\); loadDB\(\); \}',
           engine.rstrip("\n"), "data-layer")

# 2. Danh mục phòng ban / nhóm tài sản chỉ nạp mẫu khi máy chủ chưa có (trước đây ghi đè mỗi lần tải)
sub_once('  db.departments = [{"id": "dept_12"', '  if(!db.departments || !db.departments.length) db.departments = [{"id": "dept_12"', "migrate-dept")
sub_once('  db.categories = [{"id": "cat_34"', '  if(!db.categories || !db.categories.length) db.categories = [{"id": "cat_34"', "migrate-cat")

# 3. Đăng nhập qua máy chủ
regex_once(r'function bindLogin\(\)\{.*?\n\}\n\nfunction bindGlobalEvents', '''function bindLogin(){
  document.getElementById("loginForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]");
    if(btn){ btn.disabled = true; btn.textContent = "Đang đăng nhập…"; }
    try{
      await doLogin(fd.get("username").trim(), fd.get("password"));
    }catch(err){
      stopPolling(); DB = emptyDB(); resetMirror();
      render();
      const box = document.getElementById("login-error");
      if(box) box.innerHTML = `<div class="alert alert-error">${esc(err.message || "Đăng nhập thất bại.")}</div>`;
    }
  });
}

function bindGlobalEvents''', "login")

sub_once('if(action === "logout"){ DB.session.userId = null; saveDB(); render(); return; }',
         'if(action === "logout"){ doLogout(); return; }', "logout")

# 4. Khởi động
sub_once('loadDB();\nrender();\n</script>', modules.rstrip("\n") + "\n\n" + qr.rstrip("\n") + "\n\n" + modules2.rstrip("\n") + '\n\nboot();\n</script>', "boot")

# 5. Bỏ biểu ngữ "OFFLINE", sửa chân trang
regex_once(r'<div id="notice" class="notice-banner">.*?</div>\n', '', "notice")
sub_once('704-assets Offline · dữ liệu lưu trên trình duyệt này', '704-assets · dữ liệu lưu trên máy chủ, dùng chung với chatbot IT', "footer")

# 6. Khôi phục backup: đẩy lên máy chủ, giữ nguyên phiên đăng nhập hiện tại
sub_once('''      Object.assign(DB, importedDB);
      saveDB();
      alert("Khôi phục toàn vẹn dữ liệu thành công! Hệ thống sẽ tự động tải lại để nạp số liệu mới.");
      location.reload();''', '''      const sess = DB.session;
      SYNC_COLS.forEach(c => { DB[c] = Array.isArray(importedDB[c]) ? importedDB[c] : []; });
      DB.templateConfig = importedDB.templateConfig || {};
      DB.session = sess;
      migrateDB(DB);
      flushNow().then(() => {
        alert("Khôi phục dữ liệu thành công! Hệ thống sẽ tải lại để nạp số liệu mới.");
        location.reload();
      });''', "restore")
sub_once('toàn bộ CSDL hiện tại trên máy này', 'toàn bộ CSDL hiện tại trên MÁY CHỦ (ảnh hưởng tất cả người dùng và chatbot)', "restore-confirm")

# 7. Tài khoản: thêm Telegram ID (để chatbot nhận diện nhân viên IT)
sub_once('<div class="form-group"><label>Mật khẩu (mặc định 123456)</label><input class="form-control" name="password"></div>',
         '<div class="form-group"><label>Mật khẩu (mặc định 123456)</label><input class="form-control" name="password"></div>\n'
         '          <div class="form-group"><label>Telegram ID (tuỳ chọn, để dùng chatbot)</label><input class="form-control" name="telegram_id" placeholder="VD: 123456789"></div>', "user-new-form")
sub_once('    employee_code: (fd.get("employee_code")||"").trim(),\n    role: fd.get("role")',
         '    employee_code: (fd.get("employee_code")||"").trim(),\n    telegram_id: (fd.get("telegram_id")||"").trim(),\n    role: fd.get("role")', "user-new-submit")
sub_once('      </div>\n      <button class="btn" type="submit">💾 Lưu thay đổi</button>',
         '        <div class="col col-6"><div class="form-group"><label>Telegram ID (chatbot)</label>\n'
         '          <input class="form-control" name="telegram_id" value="${esc(x.telegram_id||\'\')}" placeholder="VD: 123456789"></div></div>\n'
         '      </div>\n      <button class="btn" type="submit">💾 Lưu thay đổi</button>', "user-edit-form")
sub_once('  x.employee_code = (fd.get("employee_code")||"").trim();',
         '  x.employee_code = (fd.get("employee_code")||"").trim();\n  x.telegram_id = (fd.get("telegram_id")||"").trim();', "user-edit-submit")

# 8. Xoá trắng: vô hiệu trên bản dùng chung
sub_once('function doHardReset(){\n  const txt = prompt("Nhập chính xác: XOA TOAN BO để tiếp tục");',
         'function doHardReset(){\n  hardReset(); return;\n  const txt = prompt("Nhập chính xác: XOA TOAN BO để tiếp tục");', "hard-reset")
sub_once('Thao tác này sẽ XOÁ VĨNH VIỄN toàn bộ dữ liệu trong trình duyệt này và\n      khởi tạo lại dữ liệu mẫu. Không thể hoàn tác.',
         'Chức năng xoá trắng đã bị vô hiệu trên bản dùng chung qua máy chủ để tránh xoá nhầm dữ liệu của cả đơn vị.\n      Cần xoá dữ liệu thì liên hệ quản trị hệ thống (xoá trực tiếp trên Firestore).', "hard-reset-text")

# 9. Nhật ký IT: thẻ trong hồ sơ tài sản + trang riêng
sub_once('    </div></div>\n  </div>`;\n}\n\nfunction assignUser(assetId){', '''    </div></div>
  </div>
  ${itWorklogCard(a.id)}
  ${ccdcKindCard(a,u)}`;
}

function itWorklogCard(assetId){
  const list = (DB.worklogs||[]).filter(w=>w.asset_id===assetId)
    .slice().sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  const total = list.reduce((s,w)=>s+(Number(w.duration_min)||0),0);
  return `<div class="card"><h4>🧰 Nhật ký xử lý của IT <span class="text-muted small">(${list.length} lần${list.length?`, tổng ${total} phút`:""})</span></h4>
    ${list.length ? `<table><thead><tr><th>Thời gian</th><th>IT</th><th>Loại</th><th>Nội dung</th><th>Phút</th><th>Phiếu</th></tr></thead><tbody>
      ${list.map(w=>`<tr><td class="text-nowrap">${fmtDateTime(w.created_at)}</td><td>${esc(w.it_user||"-")}</td><td>${esc(w.category||"-")}</td>
        <td>${esc(w.description||"")}</td><td>${esc(w.duration_min||0)}</td><td>${esc(w.ticket_code||"-")}</td></tr>`).join("")}
    </tbody></table>${list.length>=3?`<div class="alert alert-error" style="margin-top:10px">⚠️ Thiết bị đã được xử lý ${list.length} lần. Cân nhắc đề xuất thay thế / thanh lý.</div>`:""}`
      : `<p class="text-muted">Chưa có nhật ký xử lý. IT ghi qua chatbot Telegram sẽ hiện ở đây.</p>`}
  </div>`;
}

function viewItLog(u){
  if(!["admin","tcth","it"].includes(u.role)) return `<div class="alert alert-error">Bạn không có quyền truy cập.</div>`;
  const q = (state.params.q||"").toLowerCase();
  let list = (DB.worklogs||[]).slice().sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  if(q) list = list.filter(w=>[w.asset_code,w.asset_name,w.description,w.it_user,w.category,w.ticket_code].join(" ").toLowerCase().includes(q));
  const total = list.reduce((s,w)=>s+(Number(w.duration_min)||0),0);
  const shown = list.slice(0, 300);
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
      <h4 style="margin:0">Nhật ký công việc IT (${list.length} việc · ${total} phút)</h4>
      <input class="form-control" id="itlogSearch" placeholder="🔍 Mã tài sản, nội dung, người ghi… (Enter)" value="${esc(state.params.q||"")}"
        style="max-width:320px" onkeydown="if(event.key==='Enter') nav('itlog',{q:this.value})">
    </div>
    ${shown.length ? `<table><thead><tr><th>Thời gian</th><th>IT</th><th>Tài sản</th><th>Phòng ban</th><th>Loại</th><th>Nội dung</th><th>Phút</th><th>Phiếu</th></tr></thead><tbody>
      ${shown.map(w=>`<tr><td class="text-nowrap">${fmtDateTime(w.created_at)}</td><td>${esc(w.it_user||"-")}</td>
        <td>${w.asset_id?`<a data-nav="asset_detail" data-params='{"id":"${esc(w.asset_id)}"}'>${esc(w.asset_code||"")}</a>`:esc(w.asset_code||"")}<div class="small text-muted">${esc(w.asset_name||"")}</div></td>
        <td>${esc(depName(w.department_id)||"-")}</td><td>${esc(w.category||"-")}</td><td>${esc(w.description||"")}</td>
        <td>${esc(w.duration_min||0)}</td><td>${esc(w.ticket_code||"-")}</td></tr>`).join("")}
    </tbody></table>${list.length>shown.length?`<p class="text-muted small">Hiển thị ${shown.length}/${list.length} việc mới nhất. Dùng ô tìm kiếm để lọc.</p>`:""}`
      : `<p class="text-muted">Chưa có nhật ký nào.</p>`}
  </div>`;
}

function assignUser(assetId){''', "worklog-card")
sub_once('      case "reports": body = viewReports(u); break;', '      case "reports": body = viewReports(u); break;\n      case "itlog": body = viewItLog(u); break;', "route-itlog")
sub_once('  repair_detail:"Chi tiết Phiếu Báo hỏng",', '  repair_detail:"Chi tiết Phiếu Báo hỏng", itlog:"🧰 Nhật ký công việc IT",', "title-itlog")
sub_once('      ${item("reports","📈","Báo cáo & Lịch sử")}', '      ${item("reports","📈","Báo cáo & Lịch sử")}\n      ${["admin","tcth","it"].includes(u.role)?item("itlog","🧰","Nhật ký IT"):""}', "sidebar-itlog")

# 10. Module CCDC + kiểm kê đối chiếu: route, tiêu đề, menu, phân loại khi nhập Excel ngân hàng
sub_once('      case "itlog": body = viewItLog(u); break;', '      case "itlog": body = viewItLog(u); break;\n      case "ccdc": body = viewCCDC(u); break;\n      case "inventory_run": body = viewInventoryRun(u, state.params.id); break;', "route-ccdc")
sub_once('itlog:"🧰 Nhật ký công việc IT",', 'itlog:"🧰 Nhật ký công việc IT", ccdc:"🔧 Công cụ dụng cụ", inventory_run:"📋 Phiên kiểm kê",', "title-ccdc")
sub_once('      ${item("assets","🗄️","Sổ tài sản")}', '      ${item("assets","🗄️","Sổ tài sản")}\n      ${item("ccdc","🔧","Công cụ dụng cụ")}', "menu-ccdc")
sub_once('      ${item("reports","📈","Báo cáo & Lịch sử")}\n', '      ${item("reports","📈","Báo cáo & Lịch sử")}\n      ${u.role==="manager"?item("admin_inventory","📋","Kiểm kê phòng ban"):""}\n', "menu-inventory-manager")
sub_once('        department_id: dept.id, address: row.address, updated_at: now,\n      });', '        department_id: dept.id, address: row.address, updated_at: now,\n        kind: st.kindLabel.indexOf("CC")===0 ? "ccdc" : "asset",\n      });', "import-kind-update")
sub_once('current_user_id: null,\n        created_at: now, updated_at: now,\n      });', 'current_user_id: null,\n        kind: st.kindLabel.indexOf("CC")===0 ? "ccdc" : "asset",\n        created_at: now, updated_at: now,\n      });', "import-kind-create")

# 11. Giao diện mới + QR + địa điểm/phụ kiện/phần mềm (logic nằm ở client/modules2.js và client/qr.js)
sub_once('function viewDashboard(u){', 'function viewDashboardLegacy(u){', "dash-legacy")
sub_once('function submit_asset(form){', 'function submit_asset_base(form){', "asset-base")
regex_once(r'<div class="topbar">\s*<div style="display:flex;align-items:center;gap:10px">.*?</span>\s*</div>\s*</div>', '${renderTopbar(u,title)}', "topbar")
sub_once('      case "itlog": body = viewItLog(u); break;', '      case "itlog": body = viewItLog(u); break;\n      case "locations": body = viewLocations(u); break;\n      case "qr": body = viewQR(u); break;\n      case "accessories": body = viewAccessories(u); break;\n      case "accessory_detail": body = viewAccessoryDetail(u); break;\n      case "software": body = viewSoftware(u); break;\n      case "software_detail": body = viewSoftwareDetail(u); break;', "routes2")
sub_once('const STATUS_LABELS = {in_use:"Đang sử dụng",', 'const STATUS_LABELS = {in_use:"Đang sử dụng", unused:"Chưa sử dụng",', "status-label")
# danh sách tài sản: lọc theo địa điểm / bảo hành, tìm theo serial, cột Serial + Địa điểm
sub_once('  if(f.current_user_id) list = list.filter(a=>a.current_user_id===f.current_user_id);\n',
         '  if(f.current_user_id) list = list.filter(a=>a.current_user_id===f.current_user_id);\n  if(f.location_id) list = list.filter(a=>a.location_id===f.location_id);\n  if(f.warranty==="soon") list = list.filter(a=>{ const d = dayDiff(a.warranty_until); return d!==null && d>=0 && d<=30; });\n', "list-filter")
sub_once('a.code.toLowerCase().includes(q)||a.name.toLowerCase().includes(q)', 'a.code.toLowerCase().includes(q)||a.name.toLowerCase().includes(q)||String(a.serial||"").toLowerCase().includes(q)', "list-search")
sub_once('        <th style="cursor:pointer; user-select:none;" data-action="sortAssets:category_id">Nhóm${icon(\'category_id\')}</th>',
         '        <th style="cursor:pointer; user-select:none;" data-action="sortAssets:serial">Serial${icon(\'serial\')}</th>\n        <th style="cursor:pointer; user-select:none;" data-action="sortAssets:category_id">Nhóm${icon(\'category_id\')}</th>', "list-th-serial")
sub_once('data-action="sortAssets:department_id">Phòng ban${icon(\'department_id\')}</th>', 'data-action="sortAssets:department_id">Phòng ban${icon(\'department_id\')}</th>\n        <th>Địa điểm</th>', "list-th-loc")
sub_once('        <td>${esc(catName(a.category_id)||"-")}</td>\n        <td>${esc(depName(a.department_id)||"-")}</td>', '        <td class="mono">${esc(a.serial||"-")}</td>\n        <td>${esc(catName(a.category_id)||"-")}</td>\n        <td>${esc(depName(a.department_id)||"-")}</td>\n        <td>${esc(locName(a.location_id)||"-")}</td>', "list-td")
sub_once('<td colspan="8" class="text-muted" style="text-align:center;padding:24px">Không có tài sản phù hợp.', '<td colspan="10" class="text-muted" style="text-align:center;padding:24px">Không có tài sản phù hợp.', "list-colspan")
sub_once('<button class="btn btn-sm" data-action="applyAssetFilters" style="height:36px; align-self:flex-end;">', '${locFilterHtml(f)}\n      <button class="btn btn-sm" data-action="applyAssetFilters" style="height:36px; align-self:flex-end;">', "list-filter-ui")
sub_once('  state.assetFilters.status = document.getElementById("f_status").value;', '  state.assetFilters.status = document.getElementById("f_status").value;\n  { const le = document.getElementById("f_loc"); if(le) state.assetFilters.location_id = le.value; }', "apply-filter")
sub_once('<option value="in_use" ${f.status==="in_use"?"selected":""}>Đang sử dụng</option>', '<option value="in_use" ${f.status==="in_use"?"selected":""}>Đang sử dụng</option>\n          <option value="unused" ${f.status==="unused"?"selected":""}>Chưa sử dụng</option>', "filter-unused")
sub_once('            <option value="in_use">Đang sử dụng</option>\n            <option value="broken">', '            <option value="in_use">Đang sử dụng</option>\n            <option value="unused">Chưa sử dụng</option>\n            <option value="broken">', "bulk-unused")
sub_once('      <div style="text-align: right; margin-bottom: 16px;">\n        <button class="btn btn-sm btn-success" data-action="applyBulkActions"', '      ${bulkLocHtml()}\n      <div style="text-align: right; margin-bottom: 16px;">\n        <button class="btn btn-sm btn-success" data-action="applyBulkActions"', "bulk-loc")
# hồ sơ tài sản
sub_once('${a.status==="in_use" && (u.role==="admin" || a.department_id===u.department_id) ? `', '${["in_use","unused"].includes(a.status) && (u.role==="admin" || a.department_id===u.department_id) ? `', "detail-actions")
sub_once('          <tr><td class="text-muted">Địa chỉ</td>', '          ${assetExtraRows(a)}\n          <tr><td class="text-muted">Địa chỉ</td>', "detail-rows")
sub_once('  ${ccdcKindCard(a,u)}`;', '  ${ccdcKindCard(a,u)}\n  ${assetExtraCards(a,u)}`;', "detail-cards")
sub_once('        <div class="col col-6"><div class="form-group"><label>Địa chỉ</label>\n          <input class="form-control" name="address"', '        ${assetFormExtra(a,u)}\n        <div class="col col-6"><div class="form-group"><label>Địa chỉ</label>\n          <input class="form-control" name="address"', "form-extra")
sub_once('let assets = DB.assets.filter(a=>a.status==="in_use");', 'let assets = DB.assets.filter(a=>["in_use","unused"].includes(a.status));', "transfer-new-unused")

sub_once('<div style="margin: 24px 0; padding: 20px; border: 1px dashed var(--border); border-radius: 8px; background: #fff1f2;">', '${sheetsBackupCard()}\n    <div style="margin: 24px 0; padding: 20px; border: 1px dashed var(--border); border-radius: 8px; background: #fff1f2;">', "sheets-backup-card")

sub_once('function render(){\n  const u = currentUser();', 'function render(){\n  sortLists();\n  const u = currentUser();', "render-sort")
s = s.replace('${assets.map(a=>`<option value="${a.id}" ${presetAssetId', '${assets.slice().sort(cmpName).map(a=>`<option value="${a.id}" ${presetAssetId')


# ---- Luồng phiếu báo hỏng: LĐP chọn chuyển thẳng Điện toán (bỏ bước TCTH) hoặc chuyển TCTH (hư hỏng lớn) ----
sub_once('<button class="btn btn-success btn-block" type="submit">LĐP phê duyệt &amp; Chuyển TCTH</button>',
 """<div class="form-group" style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:600;">Chuyển tiếp đến *</label>
            <select class="form-control" name="route" required>
              <option value="">-- Chọn nơi chuyển --</option>
              <option value="it">Dịch vụ khách hàng / Điện toán (IT) xử lý trực tiếp (bỏ bước TCTH)</option>
              <option value="tcth">LĐP TCTH xử lý (hư hỏng lớn, ngoài chuyên môn IT)</option>
            </select>
          </div>
          <button class="btn btn-success btn-block" type="submit">LĐP phê duyệt &amp; Chuyển tiếp</button>""", "rp-route-form")
sub_once('  rt.status = "pending_tcth";\n  rt.manager_id = u.id;',
 '  const route = new FormData(form).get("route") === "it" ? "it" : "tcth";\n  rt.route = route;\n  rt.status = route === "it" ? "pending_it" : "pending_tcth";\n  rt.manager_id = u.id;', "rp-route-status")
sub_once('alert("Cập nhật và chuyển tiếp đến TCTH thành công!");', 'alert(route === "it" ? "Đã phê duyệt và chuyển trực tiếp đến Điện toán (IT)!" : "Đã phê duyệt và chuyển tiếp đến TCTH!");', "rp-route-alert")
sub_once('LĐP phê duyệt phiếu ${rt.ticket_code || rt.id.slice(-5)} (Mức độ: ${priority})', 'LĐP phê duyệt phiếu ${rt.ticket_code || rt.id.slice(-5)} (Mức độ: ${priority}) và chuyển ${route === "it" ? "trực tiếp Điện toán (bỏ bước TCTH)" : "TCTH (hư hỏng lớn)"}', "rp-route-hist")
sub_once('{label:"3. TCTH điều phối", who:userName(rt.tcth_id), at:rt.tcth_at},', '{label:"3. TCTH điều phối", who:(rt.route === "it" ? "Bỏ qua — LĐP chuyển thẳng Điện toán" : userName(rt.tcth_id)), at:(rt.route === "it" ? rt.manager_at : rt.tcth_at)},', "rp-route-step")
sub_once('  if(rt.status === "pending_manager") steps[1].cls = "active";', '  if(rt.route === "it") steps[2].cls = "skipped";\n  if(rt.status === "pending_manager") steps[1].cls = "active";', "rp-route-skipcls")
sub_once('<tr><td class="text-muted">Ngày lập</td><td>${fmtDateTime(rt.created_at)}</td></tr>', '<tr><td class="text-muted">Ngày lập</td><td>${fmtDateTime(rt.created_at)}</td></tr>\n          ${rt.route ? `<tr><td class="text-muted">LĐP chuyển tới</td><td>${rt.route === "it" ? "Điện toán (IT) trực tiếp" : "TCTH (hư hỏng lớn)"}</td></tr>` : ""}', "rp-route-row")


# Tiêu đề khung tiến độ phiếu báo hỏng: 4 bước khi LĐP chuyển thẳng Điện toán
_h = '<h4>Tiến độ quy trình (5 bước)</h4>'
_pos = [m.start() for m in re.finditer(re.escape(_h), s) if 'rt.status==="rejected"' in s[m.start():m.start()+600]]
if len(_pos) != 1:
    raise SystemExit(f"[rp-title] mong đợi 1 vị trí, tìm thấy {len(_pos)}")
s = s[:_pos[0]] + '<h4>Tiến độ quy trình (${rt.route === "it" ? "4 bước · chuyển thẳng Điện toán" : "5 bước"})</h4>' + s[_pos[0]+len(_h):]

out = root / "public" / "app.html"
out.write_text(s, encoding="utf8")
print("OK ->", out, len(s), "ký tự")
