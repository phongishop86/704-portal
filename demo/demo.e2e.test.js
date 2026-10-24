// Chạy kịch bản DEMO trong trình duyệt thật (Chromium không giao diện) trên máy chủ demo cục bộ.
// Chạy: node demo/demo.e2e.test.js        (tự khởi động và tắt máy chủ demo)
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/home/claude/.npm-global/lib/node_modules/playwright"); }
const { chromium } = pw;

const ROOT = path.join(__dirname, "..");
const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const localTsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const tsx = fs.existsSync(localTsx) ? localTsx : "tsx";

const ok = (m) => console.log("  ok  " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(BASE + "/demo/api/chats")).ok) return; } catch (e) { /* chưa lên */ }
    await sleep(250);
  }
  throw new Error("Máy chủ demo không khởi động được");
}

(async () => {
  const srv = spawn(tsx, ["--tsconfig", "test/tsconfig.fakes.json", "demo/server.ts"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  srv.stdout.on("data", (d) => (log += d));
  srv.stderr.on("data", (d) => (log += d));
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    await waitUp();

    /* ===== Kịch bản bot (trang giả lập Telegram) ===== */
    const chat = await browser.newPage();
    chat.on("pageerror", (e) => errors.push("chat: " + e.message));
    chat.on("dialog", (d) => d.accept());
    await chat.goto(BASE + "/demo/chat");
    await chat.waitForSelector("nav button");
    const say = async (text) => {
      const before = await chat.locator(".col:not([hidden]) .b.bot").count();
      await chat.fill("#in", text);
      await chat.press("#in", "Enter");
      await chat.waitForFunction((n) => document.querySelectorAll(".col:not([hidden]) .b.bot").length > n, before, { timeout: 15000 });
      return chat.locator(".col:not([hidden]) .b.bot").last();
    };

    let b = await say("Xong máy FA0001, thay nguồn 45 phút");
    let t = await b.textContent();
    assert.match(t, /FA0001/); assert.match(t, /Thay nguồn/); assert.match(t, /45 phút/); assert.match(t, /sẽ đóng phiếu/);
    assert.match(t, /Phiếu: GBH-KHDN-/);
    ok("bot hiểu câu báo xong, tạo bản nháp có nút và ghi rõ sẽ đóng phiếu");

    await b.locator("button", { hasText: "Ghi" }).click();
    await chat.waitForFunction(() => /Đã ghi WL-0001 và đóng phiếu/.test(document.querySelector(".col:not([hidden]) .b.bot:last-of-type").textContent), null, { timeout: 15000 });
    ok("bấm ✅: ghi nhật ký WL-0001 và đóng phiếu (không trùng mã WL-D… của dữ liệu mẫu)");

    b = await say("/lichsu FA0001");
    t = await b.textContent();
    assert.match(t, /Lịch sử FA0001/); assert.match(t, /Thay nguồn/); assert.match(t, /Thay RAM 8GB lên 16GB/); assert.match(t, /⚠️/);
    ok("/lichsu FA0001: có 3 lần xử lý và cảnh báo thiết bị hay hỏng");

    b = await say("/phieu");
    t = await b.textContent();
    assert.match(t, /Phiếu chờ Điện toán xử lý \(1\)/); assert.match(t, /FA0002/); assert.ok(!/FA0001/.test(t));
    ok("/phieu: chỉ còn phiếu máy in FA0002 (phiếu FA0001 đã đóng)");

    // Nhóm IT: nhắc việc, phiếu FA0002 quá hạn
    await chat.locator("nav button", { hasText: "Nhóm IT" }).click();
    await chat.click("#cron");
    await chat.waitForSelector(".col:not([hidden]) .b.bot");
    t = await chat.locator(".col:not([hidden]) .b.bot").last().textContent();
    assert.match(t, /1 phiếu chờ Điện toán xử lý, 1 quá hạn/); assert.match(t, /⏰ quá hạn/);
    ok("nhắc việc 08:00 vào nhóm IT: báo phiếu FA0002 quá hạn");

    // Nhân viên thường không ghi được nhật ký
    await chat.locator("nav button", { hasText: "Võ Minh Nhân Viên" }).click();
    b = await say("Thay RAM máy FA0006, 15 phút");
    assert.match(await b.textContent(), /chỉ dùng được/);
    ok("tài khoản nhân viên bị từ chối ghi nhật ký");

    // IT 2 gõ câu thường (không đóng phiếu)
    await chat.locator("nav button", { hasText: "Lê Thị Mạng" }).click();
    b = await say("Thay RAM máy PC-0051, 15 phút");
    t = await b.textContent();
    assert.match(t, /FA0006/); assert.match(t, /Sửa chữa phần cứng/); assert.match(t, /15 phút/); assert.ok(!/đóng phiếu/.test(t));
    await b.locator("button", { hasText: "Ghi" }).click();
    await chat.waitForFunction(() => /Đã ghi WL-0002\./.test(document.querySelector(".col:not([hidden]) .b.bot:last-of-type").textContent), null, { timeout: 15000 });
    ok("tìm tài sản bằng mã nội bộ PC-0051, ghi nhật ký thường (WL-0002)");

    /* ===== Kịch bản web 704-assets ===== */
    const web = await browser.newPage();
    web.on("pageerror", (e) => errors.push("web: " + e.message));
    web.on("dialog", (d) => d.accept());
    const login = async (user) => {
      await web.goto(BASE + "/");
      await web.waitForSelector("#loginForm, .sidebar");
      if (await web.locator(".sidebar").count()) { await web.click('[data-action="logout"]'); await web.waitForSelector("#loginForm"); }
      await web.fill("input[name=username]", user);
      await web.fill("input[name=password]", "Demo@2026");
      await web.click("#loginForm button[type=submit]");
      await web.waitForSelector(".sidebar", { timeout: 20000 });
    };

    await login("demo.admin");
    await web.evaluate(() => nav("asset_detail", { id: "a_fa0001" }));
    await web.waitForSelector("text=Nhật ký xử lý của IT");
    const asset = await web.textContent(".container");
    assert.match(asset, /Đang sử dụng/); assert.match(asset, /Thay nguồn/); assert.match(asset, /Thay RAM 8GB lên 16GB/);
    assert.match(asset, /IT ghi nhật ký \(Sửa chữa phần cứng\)/); assert.match(asset, /IT khắc phục xong phiếu GBH-KHDN-/);
    assert.match(asset, /đã được xử lý 3 lần/);
    ok("web: hồ sơ FA0001 đã về 'Đang sử dụng', có nhật ký IT, lịch sử 360° và cảnh báo ≥3 lần (do bot vừa ghi)");

    await web.evaluate(() => nav("itlog"));
    await web.waitForSelector("#itlogSearch");
    const itlog = await web.textContent(".container");
    assert.match(itlog, /FA0001/); assert.match(itlog, /Thay nguồn/); assert.match(itlog, /Thay RAM máy|Thay RAM/);
    ok("web: trang 'Nhật ký IT' liệt kê cả nhật ký mẫu lẫn nhật ký bot vừa ghi");

    // TCTH điều phối phiếu R3 trên web → bot (IT1) thấy ngay
    await login("demo.tcth");
    await web.evaluate(() => nav("repair_detail", { id: "r_3" }));
    await web.waitForSelector('form[data-form="repair_dispatch"]');
    await web.selectOption('form[data-form="repair_dispatch"] select[name=it_id]', "u_it1");
    await web.click('form[data-form="repair_dispatch"] button[type=submit]');
    await web.waitForFunction(() => byId(DB.repairs, "r_3").status === "pending_it" && flushTimer === null && !syncBusy && computeOps().length === 0, null, { timeout: 15000 });
    ok("web: TCTH điều phối phiếu GBH-BANLE cho IT 1, đã lưu lên máy chủ");

    await chat.locator("nav button", { hasText: "Trần Văn Điện Toán" }).click();
    b = await say("/phieu");
    t = await b.textContent();
    assert.match(t, /GBH-BANLE-/); assert.match(t, /FA0003/);
    ok("bot: /phieu của IT 1 thấy ngay phiếu laptop vừa được TCTH giao (web → bot)");

    // Nhân viên: không thấy menu Nhật ký IT, IT thì thấy
    await login("demo.nhanvien");
    assert.strictEqual(await web.locator('[data-nav="itlog"]').count(), 0);
    await login("demo.it1");
    assert.strictEqual(await web.locator('[data-nav="itlog"]').count(), 1);
    ok("web: phân quyền menu Nhật ký IT (nhân viên không thấy, IT thấy)");

    // Đặt lại dữ liệu demo
    await chat.click("#reset");
    await chat.waitForSelector("nav button");
    await sleep(500);
    await chat.locator("nav button", { hasText: "Trần Văn Điện Toán" }).click();
    b = await say("/phieu");
    t = await b.textContent();
    assert.match(t, /Phiếu chờ Điện toán xử lý \(2\)/); assert.match(t, /FA0001/);
    ok("nút 'Đặt lại dữ liệu demo' đưa mọi thứ về trạng thái ban đầu (phiếu FA0001 mở lại)");
  } catch (e) {
    console.log("FAIL  " + (e.stack || e));
    process.exitCode = 1;
  }
  if (errors.length) { console.log("Lỗi script trong trang:\n" + errors.join("\n")); process.exitCode = 1; }
  if (/Error|error/.test(log.replace(/Lỗi/g, "")) && process.exitCode) console.log("--- log máy chủ ---\n" + log.slice(-1500));
  await browser.close();
  srv.kill();
  console.log(process.exitCode ? "\nCÓ LỖI" : "\nTất cả đạt");
})();
