// Kiểm thử lớp đồng bộ (client/sync-engine.js) với một "máy chủ" giả trong bộ nhớ.
// Chạy: node client/sync-engine.test.js
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const engineSrc = fs.readFileSync(path.join(__dirname, "sync-engine.js"), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Máy chủ giả: mô phỏng đúng hợp đồng của /api/db và /api/db/sync ---------- */
function makeServer(sessionRole = "admin", sessionId = "u1") {
  const cols = {};
  const S = {
    cols, rev: 0, calls: [], failNext: 0, sessionRole, sessionId,
    col(c) { return cols[c] || (cols[c] = new Map()); },
    seed(c, id, data) { S.col(c).set(id, { ...data, id, _u: Date.now(), _del: false }); S.rev = Date.now(); },
    pub(d) { const { _u, _del, _kw, password_hash, password, ...r } = d; return r; },
  };
  S.fetch = async (url, opts = {}) => {
    S.calls.push({ url, method: opts.method || "GET" });
    if (S.failNext > 0) { S.failNext--; throw new TypeError("network down"); }
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const u = new URL(url, "http://x");
    if (u.pathname === "/api/auth/me") return reply(200, { ok: true, user: { id: S.sessionId } });
    if (u.pathname === "/api/db" && (opts.method || "GET") === "GET") {
      const now = Date.now();
      const col = u.searchParams.get("col");
      if (col === null) return reply(200, { now, rev: S.rev });
      const since = Number(u.searchParams.get("since")) || 0;
      const limit = Number(u.searchParams.get("limit")) || 800;
      const after = u.searchParams.get("after");
      let docs = [...S.col(col).values()].filter(d => d._u > since).sort((a, b) => a._u - b._u || (a.id < b.id ? -1 : 1));
      if (after) { const i = docs.findIndex(d => d.id === after); docs = docs.slice(i + 1); }
      const page = docs.slice(0, limit);
      return reply(200, { now, items: page.map(d => d._del ? { id: d.id, deleted: true } : { id: d.id, data: S.pub(d) }), next: page.length === limit ? page[page.length - 1].id : null });
    }
    if (u.pathname === "/api/db/sync") {
      const body = JSON.parse(opts.body);
      const now = Date.now();
      const rejected = [];
      for (const o of body.ops) {
        if (o.col === "users" && S.sessionRole !== "admin") { rejected.push({ col: o.col, id: o.id }); continue; }
        if (o.op === "set" && o.col === "users") {
          const dup = [...S.col("users").values()].find(d => d.username === o.data.username && d.id !== o.id && !d._del);
          if (dup) return reply(409, { error: "Tên đăng nhập '" + o.data.username + "' đã tồn tại." });
        }
      }
      for (const o of body.ops) {
        if (o.col === "users" && S.sessionRole !== "admin") continue;
        const m = S.col(o.col);
        if (o.op === "delete") { m.set(o.id, { id: o.id, _del: true, _u: now }); continue; }
        const data = { ...o.data, id: o.id };
        if (o.col === "users") {
          const prev = m.get(o.id);
          data.password_hash = data.password ? "hash(" + data.password + ")" : prev && prev.password_hash;
          delete data.password;
        }
        m.set(o.id, { ...data, _u: now, _del: false });
      }
      S.rev = now + 1;
      return reply(200, { ok: true, now, applied: body.ops.length - rejected.length, rejected });
    }
    return reply(404, { error: "not found" });
  };
  return S;
}

/* ---------- Môi trường trình duyệt giả ---------- */
function makeBrowser(server, storage = {}) {
  const log = { renders: 0, alerts: [], rootHtml: "", confirms: 0 };
  const el = () => ({ style: {}, className: "", textContent: "", set onclick(f) {}, appendChild() {} });
  const byId = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, JSON, Date, Math, Object, Array, Map, Set, Promise, Error, URL,
    fetch: server.fetch,
    localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } },
    document: { visibilityState: "visible", head: { appendChild() {} }, body: { appendChild() {} }, createElement: el, getElementById: id => byId[id] || (byId[id] = el()), addEventListener() {} },
    window: { addEventListener() {}, scrollY: 0, scrollTo() {} },
    alert: m => log.alerts.push(m),
    confirm: () => { log.confirms++; return true; },
    state: { route: "dashboard", history: [] },
    esc: s => String(s),
    uid: () => "id" + Math.random().toString(36).slice(2, 10),
    migrateDB: db => db,
    currentUser: () => { const x = vm.runInContext("DB", ctx); return x.session.userId ? x.users.find(u => u.id === x.session.userId) : null; },
    render: () => { log.renders++; },
    root: () => ({ set innerHTML(v) { log.rootHtml = v; }, querySelectorAll: () => [] }),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(engineSrc, ctx);
  return { ctx, log, storage, run: code => vm.runInContext(code, ctx) };
}

const asset = (id, extra = {}) => ({ id, code: "FA" + id, name: "May " + id, status: "in_use", original_value: 1000, ...extra });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.log("FAIL  " + name + "\n      " + (e.stack || e)); process.exitCode = 1; }
}

(async () => {
  console.log("Kiểm thử lớp đồng bộ");

  await test("tải đầy đủ lần đầu, mirror khớp, không còn gì để đẩy", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin", full_name: "Admin" });
    for (let i = 0; i < 1700; i++) S.seed("assets", "a" + i, asset("a" + i));   // > 2 trang
    S.seed("config", "tpl", { value: "data:abc" });
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    assert.strictEqual(b.run("DB.assets.length"), 1700);
    assert.strictEqual(b.run("DB.templateConfig.tpl"), "data:abc");
    assert.strictEqual(b.run("computeOps().length"), 0);
    b.run("stopPolling()");
  });

  await test("sửa 1 bản ghi: chỉ đẩy đúng 1 thao tác, lần sau không đẩy lại", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin", full_name: "Admin" });
    S.seed("assets", "a1", asset("a1")); S.seed("assets", "a2", asset("a2"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    S.calls.length = 0;
    b.run("DB.assets[0].status = 'broken'; saveDB(); flushNow()");
    await b.run("flushChain");
    const posts = S.calls.filter(c => c.method === "POST");
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(S.col("assets").get("a1").status, "broken");
    assert.strictEqual(S.col("assets").get("a2").status, "in_use");
    S.calls.length = 0;
    await b.run("flushNow()");
    assert.strictEqual(S.calls.filter(c => c.method === "POST").length, 0);
    b.run("stopPolling()");
  });

  await test("thêm tài khoản có mật khẩu: máy chủ nhận hash, bộ nhớ local không giữ mật khẩu chữ", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin", full_name: "Admin" });
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    b.run("DB.users.push({id:'u9', username:'it9', password:'abc12345', full_name:'IT 9', role:'it', is_active:true}); flushNow()");
    await b.run("flushChain");
    assert.strictEqual(S.col("users").get("u9").password_hash, "hash(abc12345)");
    assert.ok(!("password" in S.col("users").get("u9")));
    assert.ok(!("password" in b.run("DB.users.find(u=>u.id==='u9')")));
    assert.ok(!b.run("mirror.users.get('u9')").includes("abc12345"));
    // sửa tên không gửi mật khẩu: hash cũ phải còn
    b.run("DB.users.find(u=>u.id==='u9').full_name='IT Chín'; flushNow()");
    await b.run("flushChain");
    assert.strictEqual(S.col("users").get("u9").password_hash, "hash(abc12345)");
    assert.strictEqual(S.col("users").get("u9").full_name, "IT Chín");
    b.run("stopPolling()");
  });

  await test("xoá bản ghi: thành 'mồ' trên máy chủ", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1")); S.seed("assets", "a2", asset("a2"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    b.run("DB.assets.splice(0,1); flushNow()");
    await b.run("flushChain");
    assert.strictEqual(S.col("assets").get("a1")._del, true);
    assert.strictEqual(b.run("DB.assets.length"), 1);
    b.run("stopPolling()");
  });

  await test("thay đổi từ máy khác/chatbot về qua thăm dò và gây vẽ lại", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    S.seed("repairs", "r1", { asset_id: "a1", status: "pending_it", ticket_code: "GBH-1" });
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    const before = b.log.renders;
    await new Promise(r => setTimeout(r, 15));
    // chatbot đóng phiếu + thêm nhật ký
    S.col("repairs").set("r1", { ...S.col("repairs").get("r1"), status: "completed", _u: Date.now() });
    S.seed("worklogs", "WL-0001", { asset_id: "a1", description: "Thay RAM" });
    S.rev = Date.now();
    await b.run("pollOnce()");
    assert.strictEqual(b.run("DB.repairs[0].status"), "completed");
    assert.strictEqual(b.run("DB.worklogs.length"), 1);
    assert.strictEqual(b.log.renders, before + 1);
    // poll tiếp mà không có gì mới: không vẽ lại
    await b.run("pollOnce()");
    assert.strictEqual(b.log.renders, before + 1);
    b.run("stopPolling()");
  });

  await test("thay đổi do chính mình ghi không kích hoạt vẽ lại khi thăm dò", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    b.run("DB.assets[0].name = 'Doi ten'; flushNow()");
    await b.run("flushChain");
    const before = b.log.renders;
    await b.run("pollOnce()");
    assert.strictEqual(b.log.renders, before);
    assert.strictEqual(b.run("DB.assets[0].name"), "Doi ten");
    b.run("stopPolling()");
  });

  await test("bản ghi đang sửa dở ở máy này không bị thay bằng bản từ máy chủ", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    await new Promise(r => setTimeout(r, 15));
    b.run("DB.assets[0].name = 'Sua do'");           // chưa saveDB
    S.col("assets").set("a1", { ...S.col("assets").get("a1"), name: "Nguoi khac", _u: Date.now() });
    S.rev = Date.now();
    await b.run("pollOnce()");
    assert.strictEqual(b.run("DB.assets[0].name"), "Sua do");
    b.run("stopPolling()");
  });

  await test("máy chủ báo trùng tên đăng nhập (409): hoàn tác bản ghi, bản ghi khác vẫn lưu", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    b.run("DB.users.push({id:'u2', username:'admin', password:'x', full_name:'Trung', role:'user'}); DB.assets[0].name='Van luu'; flushNow()");
    await b.run("flushChain");
    assert.strictEqual(b.run("DB.users.length"), 1, "người dùng trùng phải bị gỡ");
    assert.strictEqual(S.col("assets").get("a1").name, "Van luu", "thay đổi hợp lệ khác vẫn phải lưu");
    assert.ok(b.log.alerts.some(a => a.includes("đã tồn tại")));
    b.run("stopPolling()");
  });

  await test("vai trò không đủ quyền: máy chủ bỏ qua, hàng đợi không bị kẹt", async () => {
    const S = makeServer("it", "u3");
    S.seed("users", "u3", { username: "it1", role: "it" });
    S.seed("assets", "a1", asset("a1"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u3')");
    b.run("DB.users[0].employee_code = 'NV9'; DB.assets[0].name = 'IT sua'; flushNow()");
    await b.run("flushChain");
    assert.strictEqual(S.col("assets").get("a1").name, "IT sua");
    assert.strictEqual(b.run("computeOps().length"), 0);
    b.run("stopPolling()");
  });

  await test("hơn 400 thay đổi được chia lô", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    S.calls.length = 0;
    b.run("for(let i=0;i<1000;i++) DB.assets.push({id:'n'+i, code:'N'+i, name:'M'+i}); flushNow()");
    await b.run("flushChain");
    assert.strictEqual(S.calls.filter(c => c.method === "POST").length, 3);
    assert.strictEqual(S.col("assets").size, 1000);
    b.run("stopPolling()");
  });

  await test("mất mạng: báo lỗi, giữ thay đổi, tự thử lại và lưu được", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    const b = makeBrowser(S);
    await b.run("bootAfterAuth('u1')");
    S.failNext = 1;
    b.run("DB.assets[0].name = 'Offline edit'; flushNow()");
    await b.run("flushChain");
    assert.strictEqual(b.run("computeOps().length"), 1, "thay đổi phải còn chờ");
    assert.notStrictEqual(S.col("assets").get("a1").name, "Offline edit");
    await b.run("flushNow()");   // mạng đã về
    assert.strictEqual(S.col("assets").get("a1").name, "Offline edit");
    b.run("stopPolling(); clearTimeout(flushTimer)");
  });

  await test("bộ đệm: tải lại trang chỉ kéo thay đổi sau mốc, không tải lại toàn bộ", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    for (let i = 0; i < 50; i++) S.seed("assets", "a" + i, asset("a" + i));
    const storage = {};
    const b1 = makeBrowser(S, storage);
    await b1.run("bootAfterAuth('u1')");
    b1.run("saveCache(); stopPolling()");
    assert.ok(storage["assets704_cloud_cache_v1"], "phải có bộ đệm");
    await sleep(20);
    S.col("assets").set("a3", { ...S.col("assets").get("a3"), name: "Moi doi", _u: Date.now() });
    S.rev = Date.now();
    S.calls.length = 0;
    const b2 = makeBrowser(S, storage);
    await b2.run("bootAfterAuth('u1')");
    assert.strictEqual(b2.run("DB.assets.length"), 50);
    assert.strictEqual(b2.run("DB.assets.find(a=>a.id==='a3').name"), "Moi doi");
    const sinceZero = S.calls.filter(c => /col=assets/.test(c.url) && /since=0(&|$)/.test(c.url));
    assert.strictEqual(sinceZero.length, 0, "không được tải lại từ mốc 0");
    b2.run("stopPolling()");
  });

  await test("đăng xuất xoá bộ đệm và dữ liệu trong bộ nhớ", async () => {
    const S = makeServer();
    S.seed("users", "u1", { username: "admin", role: "admin" });
    S.seed("assets", "a1", asset("a1"));
    const storage = {};
    const b = makeBrowser(S, storage);
    S.fetch = S.fetch;  // giữ nguyên
    await b.run("bootAfterAuth('u1')");
    b.run("saveCache()");
    assert.ok(storage["assets704_cloud_cache_v1"]);
    // máy chủ giả chưa có /api/auth/logout → trả 404, doLogout phải vẫn tiếp tục
    await b.run("doLogout()");
    assert.ok(!storage["assets704_cloud_cache_v1"]);
    assert.strictEqual(b.run("DB.assets.length"), 0);
    assert.strictEqual(b.run("DB.session.userId"), null);
  });

  await test("tài khoản không có trong dữ liệu: ném lỗi 401, không bật thăm dò", async () => {
    const S = makeServer();
    S.seed("users", "u2", { username: "khac", role: "user" });
    const b = makeBrowser(S);
    let err = null;
    try { await b.run("bootAfterAuth('u1')"); } catch (e) { err = e; }
    assert.ok(err && err.status === 401);
    assert.strictEqual(b.run("pollTimer"), null);
  });

  console.log("\n" + passed + " kiểm thử đạt" + (process.exitCode ? ", CÓ KIỂM THỬ LỖI" : ""));
})();
