/* =========================================================
   SYNC LAYER — 704-assets bản máy chủ (Vercel + Firestore)
   Thay cho localStorage: DB vẫn là một object trong bộ nhớ như trước, mọi nơi gọi saveDB()
   không phải sửa. saveDB() so sánh từng bản ghi với "bản sao đã đồng bộ" (mirror) rồi chỉ đẩy
   phần thay đổi lên /api/db/sync. Thay đổi của người khác/chatbot về qua việc thăm dò /api/db.
   ========================================================= */
const SYNC_COLS = ["departments","categories","users","assets","assetHistory","transfers","repairs","inventoryChecks","inventoryLines","worklogs","locations","accessories","software"];
const ALL_SYNC_COLS = SYNC_COLS.concat(["config"]);   // "config" = templateConfig, mỗi khoá một bản ghi {id,value}
const CACHE_KEY = "assets704_cloud_cache_v1";
const POLL_MS = 20000;
const FLUSH_DELAY_MS = 500;

function emptyDB(){
  return {version:3, departments:[], categories:[], users:[], assets:[], assetHistory:[], transfers:[],
    repairs:[], inventoryChecks:[], inventoryLines:[], worklogs:[], locations:[], accessories:[], software:[], templateConfig:{}, session:{userId:null}};
}
let DB = emptyDB();

const mirror = {};          // col -> Map(id -> chuỗi canon): trạng thái bản ghi lần cuối đã khớp với máy chủ
let syncMarker = 0;         // mốc thời gian máy chủ: chỉ cần lấy thay đổi sau mốc này
let lastRev = -1;           // số rev máy chủ đã thấy
let flushTimer = null, cacheTimer = null, pollTimer = null;
let flushChain = Promise.resolve();
let syncBusy = false, pollBusy = false;

function resetMirror(){ ALL_SYNC_COLS.forEach(c => { mirror[c] = new Map(); }); syncMarker = 0; lastRev = -1; }
resetMirror();

/* JSON ổn định (khoá sắp xếp) để so sánh bản ghi không phụ thuộc thứ tự khoá */
function canon(v){
  return JSON.stringify(v, (k, val) =>
    (val && typeof val === "object" && !Array.isArray(val))
      ? Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {})
      : val);
}

function colItems(col){
  if(col === "config") return Object.entries(DB.templateConfig || {}).map(([k, v]) => ({id:k, value:v}));
  return DB[col] || (DB[col] = []);
}

/* ---------- API ---------- */
async function api(path, opts){
  const res = await fetch(path, Object.assign({credentials:"same-origin", headers:{"Content-Type":"application/json"}}, opts || {}));
  let body = null;
  try{ body = await res.json(); }catch(e){}
  if(!res.ok){
    const err = new Error((body && body.error) || ("Lỗi máy chủ (" + res.status + ")"));
    err.status = res.status;
    throw err;
  }
  return body;
}

/* ---------- Áp dữ liệu từ máy chủ vào DB ---------- */
// Trả về true nếu có thay đổi thật sự trên DB.
function applyRemote(col, items){
  const m = mirror[col];
  let changed = false;

  if(col === "config"){
    items.forEach(it => {
      if(it.deleted){
        if(m.has(it.id)){ delete DB.templateConfig[it.id]; m.delete(it.id); changed = true; }
        return;
      }
      const rec = {id: it.id, value: it.data.value};
      const sig = canon(rec);
      const local = (it.id in DB.templateConfig) ? canon({id: it.id, value: DB.templateConfig[it.id]}) : null;
      if(m.get(it.id) === sig) return;                       // đã khớp (thường là bản do chính mình vừa ghi)
      if(local !== null && local !== m.get(it.id)) return;   // máy này đang sửa dở: giữ bản local, sẽ đẩy lên sau
      DB.templateConfig[it.id] = it.data.value; m.set(it.id, sig); changed = true;
    });
    return changed;
  }

  const arr = colItems(col);
  const bulk = arr.length === 0;
  const idx = bulk ? null : new Map(arr.map((x, i) => [x.id, i]));
  items.forEach(it => {
    const at = bulk ? -1 : (idx.has(it.id) ? idx.get(it.id) : -1);
    if(it.deleted){
      if(at >= 0 && canon(arr[at]) === m.get(it.id)){      // chỉ xoá nếu local chưa sửa dở
        arr.splice(at, 1);
        idx.clear(); arr.forEach((x, i) => idx.set(x.id, i));
        changed = true;
      }
      m.delete(it.id);   // nếu local đang sửa dở: bản ghi sẽ được đẩy lại như bản ghi mới (ưu tiên bản của người đang sửa)
      return;
    }
    const sig = canon(it.data);
    if(m.get(it.id) === sig) return;
    if(at >= 0 && canon(arr[at]) !== m.get(it.id)) return;   // local đang sửa dở: không ghi đè
    m.set(it.id, sig);
    if(at >= 0) arr[at] = it.data; else { arr.push(it.data); if(idx) idx.set(it.id, arr.length - 1); }
    changed = true;
  });
  return changed;
}

/* ---------- Tính thay đổi cần đẩy ---------- */
function computeOps(){
  const ops = [];
  ALL_SYNC_COLS.forEach(col => {
    const m = mirror[col];
    const seen = new Set();
    colItems(col).forEach(it => {
      if(col !== "config" && !it.id) it.id = uid();
      seen.add(it.id);
      const json = canon(it);
      if(m.get(it.id) !== json) ops.push({col, op:"set", id:it.id, json});
    });
    m.forEach((_, id) => { if(!seen.has(id)) ops.push({col, op:"delete", id}); });
  });
  return ops;
}

// Chia lô: tối đa 400 thao tác và ~2.5MB mỗi yêu cầu (Vercel giới hạn ~4.5MB).
function takeBatch(ops){
  const parts = []; const taken = []; let size = 0;
  while(ops.length && taken.length < 400){
    const o = ops[0];
    const piece = o.op === "set"
      ? '{"col":' + JSON.stringify(o.col) + ',"op":"set","id":' + JSON.stringify(o.id) + ',"data":' + o.json + '}'
      : JSON.stringify({col:o.col, op:"delete", id:o.id});
    if(taken.length && size + piece.length > 2500000) break;
    parts.push(piece); size += piece.length; taken.push(ops.shift());
  }
  return {items: taken, body: '{"ops":[' + parts.join(",") + ']}'};
}

// Ghi nhận thao tác đã lên máy chủ: mirror = đúng nội dung đã gửi (nếu local lại sửa tiếp, lần sau sẽ lệch và đẩy tiếp).
function ackOp(o){
  const m = mirror[o.col];
  if(o.op === "delete"){ m.delete(o.id); return; }
  const sent = JSON.parse(o.json);
  if(o.col === "users" && "password" in sent){
    const pw = sent.password;
    delete sent.password;
    const local = (DB.users || []).find(x => x.id === o.id);
    if(local && local.password === pw) delete local.password;   // không giữ mật khẩu dạng chữ trong bộ nhớ
  }
  if(o.col === "config"){ m.set(o.id, canon(sent)); return; }
  m.set(o.id, canon(sent));
}

// Hoàn tác bản ghi mà máy chủ từ chối (ví dụ trùng tên đăng nhập): trả về đúng trạng thái đã đồng bộ.
function revertOp(o){
  const m = mirror[o.col];
  if(o.col === "config"){
    if(m.has(o.id)) DB.templateConfig[o.id] = JSON.parse(m.get(o.id)).value; else delete DB.templateConfig[o.id];
    return;
  }
  const arr = colItems(o.col);
  const at = arr.findIndex(x => x.id === o.id);
  if(m.has(o.id)){ const back = JSON.parse(m.get(o.id)); if(at >= 0) arr[at] = back; else arr.push(back); }
  else if(at >= 0){ arr.splice(at, 1); }
}

async function sendBatch(batch){
  return api("/api/db/sync", {method:"POST", body: batch.body});
}

async function doFlush(){
  if(!DB.session || !DB.session.userId) return;
  const ops = computeOps();
  if(!ops.length){ setSyncStatus("ok"); return; }
  syncBusy = true; setSyncStatus("saving");
  const failures = [];
  try{
    while(ops.length){
      const batch = takeBatch(ops);
      try{
        const res = await sendBatch(batch);
        batch.items.forEach(ackOp);
        if(res && res.rejected && res.rejected.length) console.warn("Máy chủ bỏ qua do không đủ quyền:", res.rejected);
      }catch(e){
        if(e.status === 401 || !e.status || e.status >= 500 || e.status === 429) throw e;   // lỗi tạm thời/phiên: thử lại sau
        // Lỗi dữ liệu (400/409/413): tách từng thao tác để một bản ghi hỏng không chặn các bản ghi khác.
        for(const o of batch.items){
          try{ await sendBatch(takeBatch([o])); ackOp(o); }
          catch(e2){
            if(e2.status === 401 || !e2.status || e2.status >= 500 || e2.status === 429) throw e2;
            failures.push({o, msg: e2.message});
          }
        }
      }
    }
    failures.forEach(f => revertOp(f.o));
    setSyncStatus("ok"); scheduleCacheSave();
    if(failures.length){
      alert("Không lưu được " + failures.length + " thay đổi và đã hoàn tác:\n- " +
        failures.slice(0, 5).map(f => f.o.col + "/" + f.o.id + ": " + f.msg).join("\n- "));
      render();
    }
  }catch(e){
    if(e.status === 401){ handleSessionExpired(); }
    else { setSyncStatus("error", e.message); scheduleFlush(5000); }
  }finally{ syncBusy = false; }
}

function flushNow(){
  clearTimeout(flushTimer); flushTimer = null;
  flushChain = flushChain.then(doFlush).catch(e => console.error(e));
  return flushChain;
}
function scheduleFlush(delay){
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; flushNow(); }, delay == null ? FLUSH_DELAY_MS : delay);
}

/* saveDB(): giữ nguyên tên để mọi nơi gọi cũ vẫn chạy — nay là "đánh dấu đã đổi, lát nữa đẩy lên". */
function saveDB(){
  if(!DB.session || !DB.session.userId) return;
  setSyncStatus("pending");
  scheduleFlush();
}
function loadDB(){ /* dữ liệu nay nạp từ máy chủ sau khi đăng nhập (xem bootAfterAuth) */ }
function hardReset(){
  alert("Chức năng xoá trắng bị vô hiệu trên bản dùng chung qua máy chủ. Liên hệ quản trị hệ thống nếu cần xoá dữ liệu.");
}

/* ---------- Bộ đệm cục bộ (giảm số lần đọc Firestore khi tải lại trang) ---------- */
function scheduleCacheSave(){
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(saveCache, 3000);
}
function saveCache(){
  try{
    if(!DB.session || !DB.session.userId) return;
    const cols = {};
    ALL_SYNC_COLS.forEach(c => { cols[c] = Array.from(mirror[c].values()); });
    localStorage.setItem(CACHE_KEY, JSON.stringify({v:1, uid:DB.session.userId, marker:syncMarker, rev:lastRev, cols}));
  }catch(e){ /* hết dung lượng: bỏ qua, lần sau tải đầy đủ */ }
}
function clearCache(){ try{ localStorage.removeItem(CACHE_KEY); }catch(e){} }
function restoreCache(userId){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return false;
    const c = JSON.parse(raw);
    if(!c || c.v !== 1 || c.uid !== userId || !c.cols) return false;
    ALL_SYNC_COLS.forEach(col => {
      (c.cols[col] || []).forEach(str => {
        const obj = JSON.parse(str);
        if(col === "config") DB.templateConfig[obj.id] = obj.value;
        else colItems(col).push(obj);
        mirror[col].set(obj.id, str);
      });
    });
    syncMarker = c.marker || 0; lastRev = -1;
    return true;
  }catch(e){ DB = Object.assign(emptyDB(), {session: DB.session}); resetMirror(); return false; }
}

/* ---------- Kéo thay đổi từ máy chủ ---------- */
async function pullChanges(){
  const since = Math.max(0, syncMarker - 10000);   // chồng lấn 10 giây cho an toàn; applyRemote bỏ qua bản ghi trùng
  let firstNow = null, changed = false;
  for(const col of ALL_SYNC_COLS){
    let after = null;
    do{
      const r = await api("/api/db?col=" + col + "&since=" + since + "&limit=800" + (after ? "&after=" + encodeURIComponent(after) : ""));
      if(firstNow === null) firstNow = r.now;
      if(r.items.length && applyRemote(col, r.items)) changed = true;
      after = r.next;
    }while(after);
  }
  if(firstNow !== null) syncMarker = firstNow;
  return changed;
}

async function pollOnce(){
  if(pollBusy || syncBusy || !DB.session || !DB.session.userId) return;
  pollBusy = true;
  try{
    const head = await api("/api/db");
    if(head.rev === lastRev) return;
    const changed = await pullChanges();
    lastRev = head.rev;
    if(changed){ scheduleCacheSave(); afterRemoteChange(); }
  }catch(e){
    if(e.status === 401) handleSessionExpired();
    /* lỗi mạng: lần thăm dò sau thử lại */
  }finally{ pollBusy = false; }
}
function startPolling(){
  stopPolling();
  pollTimer = setInterval(() => { if(document.visibilityState !== "hidden") pollOnce(); }, POLL_MS);
}
function stopPolling(){ clearInterval(pollTimer); pollTimer = null; }

function formIsDirty(){
  const r = root(); if(!r) return false;
  return Array.from(r.querySelectorAll("input,textarea,select")).some(el => {
    const t = el.type;
    if(t === "file" || t === "hidden" || t === "button" || t === "submit") return false;
    if(el.tagName === "SELECT"){
      if(el.multiple) return false;
      // Ô chọn không có option mặc định thì trình duyệt tự chọn option đầu: không tính là "đã sửa"
      const def = Array.from(el.options).findIndex(o => o.defaultSelected);
      return el.selectedIndex !== (def >= 0 ? def : 0);
    }
    if(t === "checkbox" || t === "radio") return el.checked !== el.defaultChecked;
    return el.value !== el.defaultValue;
  });
}
function afterRemoteChange(){
  if(!DB.session || !DB.session.userId) return;
  if(formIsDirty()){ showStaleBanner(true); return; }
  showStaleBanner(false);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------- Giao diện trạng thái ---------- */
function ensureSyncUi(){
  if(document.getElementById("sync-status")) return;
  const st = document.createElement("style");
  st.textContent = "#sync-status{position:fixed;left:12px;bottom:12px;z-index:9999;padding:5px 12px;border-radius:14px;font-size:12px;" +
    "background:#e2e8f0;color:#334155;box-shadow:0 1px 4px rgba(0,0,0,.15);display:none}" +
    "#sync-status.error{background:#fee2e2;color:#991b1b}#sync-status.saving{background:#fef3c7;color:#92400e}" +
    "#stale-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:9999;background:#1e3a8a;color:#fff;" +
    "padding:8px 16px;border-radius:8px;font-size:13px;display:none;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}";
  document.head.appendChild(st);
  const a = document.createElement("div"); a.id = "sync-status"; document.body.appendChild(a);
  const b = document.createElement("div"); b.id = "stale-banner";
  b.textContent = "🔄 Có cập nhật mới từ người khác / chatbot — bấm để làm mới";
  b.onclick = () => { showStaleBanner(false); const y = window.scrollY; render(); window.scrollTo(0, y); };
  document.body.appendChild(b);
}
function setSyncStatus(kind, msg){
  ensureSyncUi();
  const el = document.getElementById("sync-status");
  if(!(DB.session && DB.session.userId)){ el.style.display = "none"; return; }
  el.className = kind === "error" ? "error" : kind === "ok" ? "" : "saving";
  el.textContent = kind === "ok" ? "✅ Đã lưu" : kind === "error" ? "⚠️ Chưa lưu được, đang thử lại… " + (msg || "") : "⏳ Đang lưu…";
  el.style.display = "block";
  if(kind === "ok"){ clearTimeout(el._t); el._t = setTimeout(() => { if(el.textContent === "✅ Đã lưu") el.style.display = "none"; }, 2500); }
}
function showStaleBanner(on){ ensureSyncUi(); document.getElementById("stale-banner").style.display = on ? "block" : "none"; }

window.addEventListener("beforeunload", e => {
  if(flushTimer !== null || syncBusy){ e.preventDefault(); e.returnValue = ""; }
});
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") pollOnce(); });

/* ---------- Đăng nhập / khởi động / đăng xuất ---------- */
function handleSessionExpired(){
  stopPolling();
  DB = emptyDB(); resetMirror();
  alert("Phiên đăng nhập đã hết hạn hoặc tài khoản không còn quyền. Vui lòng đăng nhập lại.");
  render();
}

async function bootAfterAuth(userId){
  stopPolling();
  DB = emptyDB(); resetMirror();
  DB.session.userId = userId;
  root().innerHTML = '<div style="padding:60px;text-align:center;color:#475569;font-size:15px">⏳ Đang tải dữ liệu từ máy chủ…</div>';
  if(!restoreCache(userId)) syncMarker = 0;
  const head = await api("/api/db");
  await pullChanges();
  lastRev = head.rev;
  if(!currentUser()){ throw Object.assign(new Error("Tài khoản không tồn tại trong dữ liệu."), {status:401}); }
  migrateDB(DB);
  saveCache();
  startPolling();
  scheduleFlush(1500);   // đẩy các chuẩn hoá do migrateDB (nếu có)
}

async function doLogin(username, password){
  const r = await api("/api/auth/login", {method:"POST", body: JSON.stringify({username, password})});
  await bootAfterAuth(r.user.id);
  state.route = "dashboard"; state.history = [];
  if(typeof handleDeepLink === "function") handleDeepLink();
  render();
}

async function boot(){
  root().innerHTML = '<div style="padding:60px;text-align:center;color:#475569;font-size:15px">⏳ Đang kết nối máy chủ…</div>';
  try{
    const me = await api("/api/auth/me");
    await bootAfterAuth(me.user.id);
    if(typeof handleDeepLink === "function") handleDeepLink();
    render();
  }catch(e){
    DB = emptyDB(); resetMirror();
    if(e.status === 401){ render(); return; }
    root().innerHTML = '<div style="padding:60px;text-align:center;color:#991b1b;font-size:15px">Không kết nối được máy chủ: ' + esc(e.message) +
      '<br><br><button class="btn" onclick="boot()">Thử lại</button></div>';
  }
}

async function doLogout(){
  await flushNow();
  if(computeOps().length && !confirm("Còn thay đổi chưa lưu được lên máy chủ. Vẫn đăng xuất (sẽ mất các thay đổi này)?")) return;
  stopPolling();
  try{ await api("/api/auth/logout", {method:"POST"}); }catch(e){}
  clearCache();
  DB = emptyDB(); resetMirror();
  state.route = "dashboard"; state.history = [];
  setSyncStatus("ok"); showStaleBanner(false);
  render();
}
