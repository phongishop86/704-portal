// Kiểm thử quy trình báo hỏng 5 bước trên giao diện thật, qua máy chủ demo:
// nhân viên báo → lãnh đạo phòng duyệt → TCTH điều phối → IT xử lý → người báo xác nhận.
// Chạy: node demo/workflow.e2e.test.js
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/home/claude/.npm-global/lib/node_modules/playwright"); }
const ROOT = path.join(__dirname, "..");
const PORT = 4200 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const localTsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const tsx = fs.existsSync(localTsx) ? localTsx : "tsx";
const ok = (m) => console.log("  ok  " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn(tsx, ["--tsconfig", "test/tsconfig.fakes.json", "demo/server.ts"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; srv.stdout.on("data", (d) => (log += d)); srv.stderr.on("data", (d) => (log += d));
  const browser = await pw.chromium.launch({ headless: true });
  const errors = [];
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/demo/api/chats")).ok) break; } catch (e) { /* chưa lên */ } await sleep(250); }
    const web = await (await browser.newContext()).newPage();
    web.on("pageerror", (e) => errors.push(e.message));
    web.on("dialog", (d) => d.accept());
    const login = async (user) => {
      await web.goto(BASE + "/");
      await web.waitForSelector("#loginForm, .sidebar");
      if (await web.locator(".sidebar").count()) { await web.click('[data-action="logout"]'); await web.waitForSelector("#loginForm"); }
      await web.fill("input[name=username]", user); await web.fill("input[name=password]", "Demo@2026");
      await web.click("#loginForm button[type=submit]"); await web.waitForSelector(".sidebar");
    };
    const synced = () => web.waitForFunction(() => flushTimer === null && !syncBusy && computeOps().length === 0, null, { timeout: 15000 });
    const repairId = () => web.evaluate(() => (DB.repairs.find((r) => r.asset_id === "a_cc0001" && r.status !== "rejected") || {}).id);
    const openTicket = async (id) => { await web.evaluate((i) => nav("repair_detail", { id: i }), id); await web.waitForSelector(".wf-step"); };
    const serverStatus = (id) => web.evaluate(async (i) => (await (await fetch("/api/db?col=repairs&since=0&limit=100")).json()).items.find((x) => x.id === i).data, id);

    // 1. Nhân viên báo hỏng CCDC được giao cho mình
    await login("demo.nhanvien");
    await web.locator(".sidebar-link", { hasText: "Công cụ dụng cụ" }).click();
    await web.locator("tbody tr", { has: web.locator('a:text-is("CC0001")') }).locator('[data-nav="repair_new"]').click();
    await web.fill('textarea[name="description"]', "Ghế bị gãy chân, không ngồi được");
    await web.click('form[data-form="repair_new"] button[type=submit]');
    await synced();
    const id = await repairId();
    assert.ok(id); assert.strictEqual((await serverStatus(id)).status, "pending_manager");
    ok("1. nhân viên báo hỏng CC0001 → phiếu 'Chờ LĐP phê duyệt' đã lưu trên máy chủ");

    // Nhân viên không tự duyệt được
    await openTicket(id);
    assert.strictEqual(await web.locator('form[data-form="repair_manager_approve"]').count(), 0);
    assert.strictEqual(await web.locator('form[data-form="repair_dispatch"]').count(), 0);
    ok("   nhân viên không thấy nút duyệt / điều phối");

    // 2. Lãnh đạo phòng duyệt
    await login("demo.lanhdao"); await openTicket(id);
    await web.fill('form[data-form="repair_manager_approve"] textarea[name=manager_note]', "Cho xử lý sớm");
    await web.click('form[data-form="repair_manager_approve"] button[type=submit]');
    await synced();
    assert.strictEqual((await serverStatus(id)).status, "pending_tcth");
    ok("2. lãnh đạo phòng duyệt → chuyển TCTH");

    // Phòng khác không duyệt được; IT không duyệt được
    await login("demo.lanhdao.bl");
    await web.evaluate((i) => nav("repair_detail", { id: i }), id);
    assert.strictEqual(await web.locator('form[data-form="repair_dispatch"]').count(), 0);
    assert.strictEqual(await web.locator('form[data-form="repair_manager_approve"]').count(), 0);
    ok("   lãnh đạo phòng khác không có thao tác nào trên phiếu này");

    // 3. TCTH điều phối cho IT 1
    await login("demo.tcth"); await openTicket(id);
    await web.selectOption('form[data-form="repair_dispatch"] select[name=it_id]', "u_it1");
    await web.click('form[data-form="repair_dispatch"] button[type=submit]');
    await synced();
    let r = await serverStatus(id);
    assert.strictEqual(r.status, "pending_it"); assert.strictEqual(r.it_id, "u_it1");
    ok("3. TCTH điều phối cho Điện toán");

    // 4. IT xử lý xong
    await login("demo.it1"); await openTicket(id);
    assert.strictEqual(await web.locator('form[data-form="repair_manager_approve"]').count(), 0);
    await web.fill('form[data-form="repair_complete"] textarea[name=resolution_note]', "Đã thay chân ghế");
    await web.click('form[data-form="repair_complete"] button[type=submit]');
    await synced();
    r = await serverStatus(id);
    assert.strictEqual(r.status, "completed"); assert.ok(!r.user_confirmed_at);
    ok("4. IT hoàn thành: phiếu 'completed' nhưng CHƯA có xác nhận của người báo");

    // 5. Người báo xác nhận (chỉ đúng người báo mới thấy nút)
    await login("demo.lanhdao"); await openTicket(id);
    assert.strictEqual(await web.locator('form[data-form="repair_user_confirm"]').count(), 0);
    await login("demo.nhanvien");
    await openTicket(id);
    await web.click('form[data-form="repair_user_confirm"] button[type=submit]');
    await synced();
    r = await serverStatus(id);
    assert.ok(r.user_confirmed_at);
    assert.ok(await web.evaluate(() => DB.assetHistory.some((h) => h.asset_id === "a_cc0001" && /xác nhận thiết bị đã được sửa chữa xong/.test(h.note))));
    ok("5. đúng người báo xác nhận hoàn tất → lưu thời điểm xác nhận + lịch sử hồ sơ");

    assert.deepStrictEqual(errors, [], "lỗi JS: " + errors.join(" | "));
    console.log("\nTất cả đạt");
  } catch (e) {
    console.error("THẤT BẠI:", e.message); console.error(log.slice(-1200)); process.exitCode = 1;
  } finally { await browser.close(); srv.kill(); }
})();
