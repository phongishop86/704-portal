/* Máy chủ mini chạy NGAY TRONG TRÌNH DUYỆT — dùng cho bản HTML độc lập (không cần cài đặt).
   Chặn fetch("/api/...") và trả lời giống máy chủ thật; dữ liệu lưu trong IndexedDB của trình duyệt. */
(function () {
  "use strict";
  var COLS = ["departments","categories","users","assets","assetHistory","transfers","repairs","inventoryChecks","inventoryLines","worklogs","locations","accessories","software","config"];
  var WRITE_ROLES = { users:["admin"], departments:["admin","tcth"], categories:["admin","tcth"], config:["admin","tcth"], worklogs:["admin","tcth","it"], locations:["admin","tcth"], accessories:["admin","tcth","it"], software:["admin","tcth","it"], inventoryChecks:["admin","tcth"], inventoryLines:["admin","tcth","manager"] };
  var USER_PUBLIC = ["id","username","full_name","role","department_id","position","active","locked"];
  var IDB = "assets704_standalone", KEY = "state", SKEY = "a704_sess";
  var M = null, saveT = null, lastU = 0;

  function sha(str) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode("a704|" + str)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      });
    }
    var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Promise.resolve("w" + h);
  }
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open(IDB, 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function idbGet() { return idb().then(function (d) { return new Promise(function (res) { var q = d.transaction("kv").objectStore("kv").get(KEY); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbPut(v) { return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, KEY); t.oncomplete = res; t.onerror = res; }); }).catch(function () {}); }
  function persist() { clearTimeout(saveT); saveT = setTimeout(function () { idbPut(M); }, 300); }
  function nextU() { lastU = Math.max(Date.now(), lastU + 1); return lastU; }

  function empty() { var c = {}; COLS.forEach(function (k) { c[k] = {}; }); return { rev: 1, cols: c, avatars: {} }; }
  function seed() {
    M = empty();
    var el = document.getElementById("a704-seed"), d = {};
    try { d = JSON.parse(el.textContent); } catch (e) {}
    var u = nextU(), jobs = [];
    COLS.forEach(function (c) {
      if (c === "config") return;
      (d[c] || []).forEach(function (r) {
        var doc = Object.assign({}, r); doc._u = u; doc._del = false;
        if (c === "users") { var pw = doc.password; delete doc.password; doc.is_active = doc.is_active !== false; jobs.push(sha(String(pw || "123456")).then(function (h) { doc.password_hash = h; })); }
        M.cols[c][doc.id] = doc;
      });
    });
    Object.keys(d.templateConfig || {}).forEach(function (k) { M.cols.config[k] = { id: k, value: d.templateConfig[k], _u: u, _del: false }; });
    return Promise.all(jobs).then(persist);
  }
  var ready = idbGet().then(function (s) { if (s && s.cols) { M = s; COLS.forEach(function (c) { if (!M.cols[c]) M.cols[c] = {}; }); lastU = Date.now(); } else return seed(); });

  function resp(obj, status, headers) { return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) }); }
  function sessUser() {
    var id = null; try { id = sessionStorage.getItem(SKEY); } catch (e) {}
    var u = id && M.cols.users[id];
    if (!u || u._del || u.is_active === false) return null;
    return { id: u.id, username: u.username, full_name: u.full_name, role: u.role || "user", department_id: u.department_id || null };
  }
  function pub(d) { var o = {}; Object.keys(d).forEach(function (k) { if (["_u","_del","_kw","password_hash","password"].indexOf(k) < 0) o[k] = d[k]; }); return o; }
  function visibleToUser(col, d, u) {
    var dep = String(u.department_id || "");
    if (col === "assets") return (dep !== "" && String(d.department_id) === dep) || d.current_user_id === u.id;
    if (col === "repairs") return d.reported_by === u.id;
    if (col === "transfers") return d.requested_by === u.id;
    return true;
  }
  function cmp(a, b) { return a._u - b._u || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

  function handleGet(url, user) {
    var col = url.searchParams.get("col");
    if (col === null) return resp({ now: Date.now(), rev: M.rev });
    if (COLS.indexOf(col) < 0) return resp({ error: "Bảng không hợp lệ." }, 400);
    var since = Number(url.searchParams.get("since")) || 0, limit = Math.min(1500, Math.max(1, Number(url.searchParams.get("limit")) || 800)), after = url.searchParams.get("after");
    var all = Object.keys(M.cols[col]).map(function (k) { return M.cols[col][k]; }).filter(function (d) { return d._u > since; }).sort(cmp);
    if (after && M.cols[col][after]) { var c = M.cols[col][after]; all = all.filter(function (d) { return cmp(d, c) > 0; }); }
    var page = all.slice(0, limit), items = [];
    page.forEach(function (d) {
      if (d._del) { items.push({ id: d.id, deleted: true }); return; }
      var p = pub(d);
      if (col === "users" && ["admin","tcth"].indexOf(user.role) < 0 && d.id !== user.id) { var q = {}; USER_PUBLIC.forEach(function (k) { if (k in p) q[k] = p[k]; }); p = q; }
      if (user.role === "user" && !visibleToUser(col, p, user)) return;
      if (col === "software" && ["admin","tcth","it"].indexOf(user.role) < 0) delete p.license_key;
      items.push({ id: d.id, data: p });
    });
    return resp({ now: Date.now(), items: items, next: all.length > limit ? page[page.length - 1].id : null });
  }

  async function handleSync(body, user) {
    var ops = body && Array.isArray(body.ops) ? body.ops : [], now = nextU(), rejected = [], applied = 0, skipped = 0;
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (!o || COLS.indexOf(o.col) < 0 || (o.op !== "set" && o.op !== "delete") || typeof o.id !== "string" || !o.id) return resp({ error: "Thao tác không hợp lệ." }, 400);
      var allowed = WRITE_ROLES[o.col];
      if (allowed && allowed.indexOf(user.role) < 0) { rejected.push({ col: o.col, id: o.id }); continue; }
      if (["assets","assetHistory","repairs","transfers"].indexOf(o.col) >= 0 && o.op === "delete" && user.role !== "admin") { rejected.push({ col: o.col, id: o.id }); continue; }
      if (o.op === "delete") {
        if (o.col === "users" && o.id === user.id) { skipped++; continue; }
        M.cols[o.col][o.id] = { id: o.id, _del: true, _u: now }; applied++; continue;
      }
      var data = Object.assign({}, o.data || {}); data.id = o.id;
      ["_u","_del","_kw","password_hash"].forEach(function (k) { delete data[k]; });
      if (o.col === "users") {
        var uname = String(data.username || "").trim();
        if (!uname) return resp({ error: "Thiếu tên đăng nhập." }, 400);
        data.username = uname;
        var dup = Object.keys(M.cols.users).some(function (k) { var x = M.cols.users[k]; return k !== o.id && !x._del && String(x.username).toLowerCase() === uname.toLowerCase(); });
        if (dup) return resp({ error: "Tên đăng nhập '" + uname + "' đã tồn tại." }, 409);
        var prev = M.cols.users[o.id], ph = prev && prev.password_hash;
        if (typeof data.password === "string" && data.password) ph = await sha(data.password);
        delete data.password; data.password_hash = ph || await sha("123456");
      }
      data._u = now; data._del = false; M.cols[o.col][o.id] = data; applied++;
    }
    if (applied) { M.rev++; persist(); }
    return resp({ ok: true, now: now, applied: applied, skipped: skipped, rejected: rejected });
  }

  async function handle(url, init) {
    await ready;
    var path = url.pathname, method = (init && init.method || "GET").toUpperCase();
    var body = null; if (init && typeof init.body === "string") { try { body = JSON.parse(init.body); } catch (e) {} }
    if (path === "/api/auth/login" && method === "POST") {
      var un = String(body && body.username || "").trim().toLowerCase(), pw = String(body && body.password || "");
      if (!un || !pw) return resp({ error: "Thiếu tên đăng nhập hoặc mật khẩu." }, 400);
      var id = Object.keys(M.cols.users).filter(function (k) { var x = M.cols.users[k]; return !x._del && String(x.username).toLowerCase() === un; })[0];
      var u = id && M.cols.users[id];
      if (!u || u.is_active === false || u.password_hash !== await sha(pw)) return resp({ error: "Sai tên đăng nhập hoặc mật khẩu." }, 401);
      try { sessionStorage.setItem(SKEY, id); } catch (e) {}
      return resp({ ok: true, user: { id: id, username: u.username, full_name: u.full_name, role: u.role } });
    }
    if (path === "/api/auth/logout") { try { sessionStorage.removeItem(SKEY); } catch (e) {} return resp({ ok: true }); }
    var user = sessUser();
    if (!user) return resp({ error: "Chưa đăng nhập." }, 401);
    if (path === "/api/auth/me") return resp({ ok: true, user: user });
    if (path === "/api/db" && method === "GET") return handleGet(url, user);
    if (path === "/api/db/sync" && method === "POST") return handleSync(body, user);
    if (path === "/api/profile/avatar") {
      if (method === "POST") { M.avatars[user.id] = body && body.data || null; persist(); return resp({ ok: true }); }
      return resp({ data: M.avatars[user.id] || null });
    }
    if (path === "/api/activity") return new Response(null, { status: 204 });
    return resp({ error: "Chức năng này chỉ có trên bản cài đặt máy chủ (không có trong bản HTML chạy độc lập)." }, 404);
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var u; try { u = new URL(typeof input === "string" ? input : input.url, location.href); } catch (e) { return realFetch(input, init); }
    if (u.pathname.indexOf("/api/") !== 0 && !/\/api\//.test(u.pathname)) return realFetch(input, init);
    u = new URL(u.href.replace(/^.*?(\/api\/)/, "http://x$1")); // chuẩn hoá: file:///.../api/x -> /api/x
    return handle(u, init);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return true; };

  // --- Thanh thông tin bản dùng thử ---
  window.__a704Reset = function () {
    if (!confirm("Xoá toàn bộ dữ liệu đang có trong trình duyệt này và nạp lại dữ liệu mẫu?")) return;
    try { sessionStorage.clear(); Object.keys(localStorage).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    var r = indexedDB.deleteDatabase(IDB); r.onsuccess = r.onerror = r.onblocked = function () { location.reload(); };
  };
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.style.cssText = "position:fixed;left:12px;bottom:60px;z-index:9999;font:12px/1.4 system-ui,sans-serif";
    b.innerHTML = '<details style="background:#0f172a;color:#e2e8f0;border-radius:10px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:330px"><summary style="cursor:pointer">🧪 Bản dùng thử — chạy trong trình duyệt</summary>' +
      '<div style="margin-top:8px">Dữ liệu lưu ngay trong trình duyệt này (không gửi đi đâu). Mật khẩu mọi tài khoản mẫu: <b>Demo@2026</b><br>' +
      '<code>demo.admin</code> Admin · <code>demo.tcth</code> TCTH · <code>demo.it1</code> Điện toán · <code>demo.lanhdao</code> LĐP · <code>demo.nhanvien</code> Nhân viên<br>' +
      '<a href="#" onclick="__a704Reset();return false" style="color:#7dd3fc">↺ Đặt lại dữ liệu mẫu</a></div></details>';
    document.body.appendChild(b);
  });
})();
