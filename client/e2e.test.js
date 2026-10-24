// Chạy giao diện thật (public/app.html) trong Chromium không giao diện, máy chủ API giả trong bộ nhớ.
// Chạy: node client/e2e.test.js
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/home/claude/.npm-global/lib/node_modules/playwright"); }
const { chromium } = pw;
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "app.html"), "utf8");

const cols = {};
const col = c => cols[c] || (cols[c] = new Map());
let rev = 1, session = null, posts = 0;
const seed = (c, id, d) => { col(c).set(id, { ...d, id, _u: Date.now(), _del: false }); rev = Date.now(); };
const pub = d => { const { _u, _del, _kw, password_hash, password, ...r } = d; return r; };

seed("users", "u1", { username: "admin", role: "admin", full_name: "Quản trị", employee_code: "NV001", department_id: null, is_active: true, password_hash: "pw:Admin#2026" });
seed("users", "u3", { username: "it1", role: "it", full_name: "Trần Văn IT", employee_code: "NV003", department_id: null, is_active: true, password_hash: "pw:Admin#2026" });
seed("departments", "d1", { code: "D1", name: "Phòng KHDN - chung" });
seed("categories", "c1", { code: "710102", name: "Máy vi tính để bàn" });
seed("assets", "a1", { code: "FA0001", name: "Máy tính PC-0042", category_id: "c1", department_id: "d1", status: "in_use", original_value: 15000000, remaining_value: 5000000, current_user_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_changed_at: new Date().toISOString() });
seed("worklogs", "WL-0001", { asset_id: "a1", asset_code: "FA0001", asset_name: "Máy tính PC-0042", department_id: "d1", it_user: "Trần Văn IT", category: "Sửa chữa phần cứng", description: "Thay RAM 8GB", duration_min: 30, created_at: new Date().toISOString(), ticket_code: "" });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("dialog", d => d.accept());

  await page.route("**/*", async route => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: html });
    if (!u.pathname.startsWith("/api/")) return route.fulfill({ status: 404, body: "" });
    const now = Date.now();
    if (u.pathname === "/api/auth/me") return session ? json(200, { ok: true, user: { id: session } }) : json(401, { error: "Chưa đăng nhập." });
    if (u.pathname === "/api/auth/login") {
      const b = JSON.parse(req.postData());
      const user = [...col("users").values()].find(x => x.username === b.username);
      if (!user || user.password_hash !== "pw:" + b.password) return json(401, { error: "Sai tên đăng nhập hoặc mật khẩu." });
      session = user.id; return json(200, { ok: true, user: { id: user.id } });
    }
    if (u.pathname === "/api/auth/logout") { session = null; return json(200, { ok: true }); }
    if (!session) return json(401, { error: "Chưa đăng nhập." });
    if (u.pathname === "/api/db") {
      const c = u.searchParams.get("col");
      if (c === null) return json(200, { now, rev });
      const since = Number(u.searchParams.get("since")) || 0;
      const docs = [...col(c).values()].filter(d => d._u > since).sort((a, b) => a._u - b._u);
      return json(200, { now, items: docs.map(d => d._del ? { id: d.id, deleted: true } : { id: d.id, data: pub(d) }), next: null });
    }
    if (u.pathname === "/api/db/sync") {
      posts++;
      const b = JSON.parse(req.postData());
      for (const o of b.ops) {
        if (o.op === "delete") { col(o.col).set(o.id, { id: o.id, _del: true, _u: now }); continue; }
        const d = { ...o.data, id: o.id };
        if (o.col === "users") { const prev = col("users").get(o.id); d.password_hash = d.password ? "pw:" + d.password : prev && prev.password_hash; delete d.password; }
        col(o.col).set(o.id, { ...d, _u: now, _del: false });
      }
      rev = now + 1;
      return json(200, { ok: true, now, applied: b.ops.length, rejected: [] });
    }
    return json(404, { error: "?" });
  });

  let step = 0;
  const ok = m => console.log("  ok  " + m);
  try {
    await page.goto("http://localhost/");
    await page.waitForSelector("#loginForm", { timeout: 10000 });
    ok("hiện màn hình đăng nhập khi chưa có phiên");

    await page.fill("input[name=username]", "admin");
    await page.fill("input[name=password]", "sai-mat-khau");
    await page.click("#loginForm button[type=submit]");
    await page.waitForSelector(".alert-error", { timeout: 10000 });
    assert.match(await page.textContent(".alert-error"), /Sai tên đăng nhập/);
    ok("sai mật khẩu: báo lỗi từ máy chủ, vẫn ở màn hình đăng nhập");

    await page.fill("input[name=username]", "admin");
    await page.fill("input[name=password]", "Admin#2026");
    await page.click("#loginForm button[type=submit]");
    await page.waitForSelector(".sidebar", { timeout: 15000 });
    assert.match(await page.textContent(".sidebar-user"), /Quản trị/);
    ok("đăng nhập đúng: tải dữ liệu từ máy chủ và vào giao diện");

    // Nhật ký IT hiện trong hồ sơ tài sản và trang Nhật ký IT
    assert.ok(await page.evaluate(() => !!document.querySelector('[data-nav="itlog"]')), "thiếu mục Nhật ký IT");
    await page.click('[data-nav="itlog"]');
    await page.waitForSelector("#itlogSearch");
    assert.match(await page.textContent(".container"), /Thay RAM 8GB/);
    ok("trang Nhật ký IT hiển thị nhật ký do chatbot ghi");

    await page.evaluate(() => nav("asset_detail", { id: "a1" }));
    await page.waitForSelector("text=Nhật ký xử lý của IT");
    assert.match(await page.textContent(".container"), /Thay RAM 8GB/);
    ok("hồ sơ tài sản có thẻ Nhật ký xử lý của IT");

    // Sửa dữ liệu qua giao diện → lên máy chủ
    await page.evaluate(() => { byId(DB.assets, "a1").address = "Tầng 2"; saveDB(); });
    await page.waitForFunction(() => document.getElementById("sync-status") && /Đã lưu/.test(document.getElementById("sync-status").textContent), null, { timeout: 8000 });
    assert.strictEqual(col("assets").get("a1").address, "Tầng 2");
    ok("sửa tài sản trên giao diện được lưu lên máy chủ");

    // Tạo tài khoản với Telegram ID qua đúng form của giao diện
    await page.evaluate(() => nav("admin_settings", { tab: "users" }));
    await page.waitForSelector('form[data-form="new_user"]');
    await page.fill('form[data-form="new_user"] input[name=employee_code]', "NV009");
    await page.fill('form[data-form="new_user"] input[name=username]', "it9");
    await page.fill('form[data-form="new_user"] input[name=full_name]', "IT Chín");
    await page.selectOption('form[data-form="new_user"] select[name=role]', "it");
    await page.fill('form[data-form="new_user"] input[name=password]', "Kho#Matkhau9");
    await page.fill('form[data-form="new_user"] input[name=telegram_id]', "555111");
    await page.click('form[data-form="new_user"] button[type=submit]');
    await page.waitForFunction(() => document.getElementById("sync-status") && /Đã lưu/.test(document.getElementById("sync-status").textContent), null, { timeout: 8000 });
    const nu = [...col("users").values()].find(x => x.username === "it9");
    assert.ok(nu, "tài khoản mới chưa lên máy chủ");
    assert.strictEqual(nu.telegram_id, "555111");
    assert.strictEqual(nu.password_hash, "pw:Kho#Matkhau9");
    assert.ok(!("password" in nu));
    assert.ok(!(await page.evaluate(() => JSON.stringify(DB.users).includes("Kho#Matkhau9"))), "mật khẩu chữ còn trong bộ nhớ trình duyệt");
    ok("tạo tài khoản: có Telegram ID, mật khẩu lên máy chủ và không còn trong bộ nhớ trình duyệt");

    // Thay đổi từ chatbot (ghi thẳng Firestore) về giao diện qua thăm dò
    seed("worklogs", "WL-0002", { asset_id: "a1", asset_code: "FA0001", asset_name: "Máy tính PC-0042", department_id: "d1", it_user: "Trần Văn IT", category: "Mạng", description: "Đổi cáp mạng", duration_min: 10, created_at: new Date().toISOString() });
    await page.evaluate(() => nav("asset_detail", { id: "a1" }));
    await page.evaluate(() => pollOnce());
    await page.waitForFunction(() => /Đổi cáp mạng/.test(document.querySelector(".container").textContent), null, { timeout: 8000 });
    ok("nhật ký mới do chatbot ghi tự hiện trên giao diện sau khi thăm dò");

    // Tải lại trang: phiên còn, dữ liệu về từ bộ đệm + máy chủ
    await page.reload();
    await page.waitForSelector(".sidebar", { timeout: 15000 });
    assert.ok(await page.evaluate(() => DB.assets.length === 1 && DB.worklogs.length === 2));
    ok("tải lại trang vẫn đăng nhập và đủ dữ liệu");

    // Đăng xuất
    await page.click('[data-action="logout"]');
    await page.waitForSelector("#loginForm");
    assert.ok(await page.evaluate(() => localStorage.getItem("assets704_cloud_cache_v1") === null));
    ok("đăng xuất: về màn hình đăng nhập, xoá bộ đệm");

    // Vai trò IT đăng nhập được
    await page.fill("input[name=username]", "it1");
    await page.fill("input[name=password]", "Admin#2026");
    await page.click("#loginForm button[type=submit]");
    await page.waitForSelector(".sidebar");
    assert.match(await page.textContent(".role-badge"), /Điện toán|IT/);
    ok("tài khoản vai trò IT đăng nhập và thấy giao diện của mình");
  } catch (e) {
    console.log("FAIL  " + (e.stack || e));
    process.exitCode = 1;
  }
  if (errors.length) { console.log("Lỗi script trong trang:\n" + errors.join("\n")); process.exitCode = 1; }
  await browser.close();
  console.log(process.exitCode ? "\nCÓ LỖI" : "\nTất cả đạt");
})();
