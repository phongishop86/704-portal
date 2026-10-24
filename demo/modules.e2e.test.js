// Kiểm thử module CCDC + kiểm kê đối chiếu trong Chromium thật, trên máy chủ demo (Firestore giả).
// Chạy: node demo/modules.e2e.test.js
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/home/claude/.npm-global/lib/node_modules/playwright"); }
const { chromium } = pw;

const ROOT = path.join(__dirname, "..");
const PORT = 3700 + Math.floor(Math.random() * 400);
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
    const web = await (await browser.newContext({ acceptDownloads: true })).newPage();
    web.on("pageerror", (e) => errors.push(e.message));
    let promptText = "Không thấy ở kho, đã hỏi người giữ lần cuối";
    web.on("dialog", (d) => d.accept(d.type() === "prompt" ? promptText : undefined));

    const login = async (user) => {
      await web.goto(BASE + "/");
      await web.waitForSelector("#loginForm, .sidebar");
      if (await web.locator(".sidebar").count()) { await web.click('[data-action="logout"]'); await web.waitForSelector("#loginForm"); }
      await web.fill("input[name=username]", user);
      await web.fill("input[name=password]", "Demo@2026");
      await web.click("#loginForm button[type=submit]");
      await web.waitForSelector(".sidebar");
    };
    const synced = () => web.waitForFunction(() => flushTimer === null && !syncBusy && computeOps().length === 0, null, { timeout: 15000 });
    const go = async (label) => { await web.locator(`.sidebar-link`, { hasText: label }).first().click(); await sleep(150); };
    const rowOf = (code) => web.locator("tbody tr", { has: web.locator(`a:text-is("${code}")`) });
    const bodyText = () => web.locator(".container").innerText();

    /* ===== 1. Admin: danh sách CCDC ===== */
    await login("demo.admin");
    await go("Công cụ dụng cụ");
    let t = await bodyText();
    assert.match(t, /Tổng CCDC\s*\n?/); assert.strictEqual(await web.locator("tbody tr").count(), 13);
    assert.ok(await rowOf("DC0001").count() === 1, "mục kind=ccdc phải có trong danh sách");
    assert.ok(await rowOf("FA0001").count() === 0, "tài sản cố định không lẫn vào danh sách CCDC");
    ok("Admin thấy 13 CCDC (12 mã CC + 1 mục được phân loại tay), không lẫn tài sản cố định");

    /* ===== 2. Cấp phát + thu hồi ===== */
    await rowOf("CC0003").locator('[data-action^="ccdcAssignOpen"]').click();
    await web.waitForSelector("#cc_assign_sel");
    await web.selectOption("#cc_assign_sel", "u_nv");
    await web.click('[data-action^="ccdcAssignApply"]');
    await synced();
    assert.strictEqual(await web.evaluate(() => byId(DB.assets, "a_cc0003").current_user_id), "u_nv");
    assert.ok(await web.evaluate(() => DB.assetHistory.some(h => h.asset_id === "a_cc0003" && /Cấp phát CCDC/.test(h.note))));
    ok("cấp phát CC0003 cho nhân viên: lưu lên máy chủ và ghi lịch sử hồ sơ");

    await rowOf("CC0003").locator('[data-action^="ccdcAssignOpen"]').click();
    await web.waitForSelector("#cc_assign_sel");
    await web.click('[data-action^="ccdcRecall"]');
    await synced();
    assert.strictEqual(await web.evaluate(() => byId(DB.assets, "a_cc0003").current_user_id), null);
    ok("thu hồi CC0003: về trạng thái chưa giao người");

    /* ===== 3. Phân loại lại ===== */
    await rowOf("DC0001").locator('a[data-nav="asset_detail"]').click();
    await web.waitForSelector('[data-action^="setAssetKind"]');
    await web.locator('[data-action$=":asset"]').click();
    await synced();
    await go("Công cụ dụng cụ");
    assert.strictEqual(await web.locator("tbody tr").count(), 12);
    ok("đặt DC0001 là TSCĐ: biến khỏi danh sách CCDC");

    /* ===== 4. Phân quyền xem ===== */
    await login("demo.nhanvien");
    await go("Công cụ dụng cụ");
    t = await bodyText();
    const nvRows = await web.locator("tbody tr").count();
    assert.strictEqual(nvRows, 2, "nhân viên chỉ thấy CCDC được giao (CC0001, CC0007)");
    assert.ok(!/Nguyên giá/.test(t)); assert.strictEqual(await web.locator('[data-action^="ccdcAssignOpen"]').count(), 0);
    assert.strictEqual(await web.locator(".sidebar-link", { hasText: "Kiểm kê" }).count(), 0);
    ok("nhân viên: chỉ thấy CCDC được giao, không có cột nguyên giá, không có nút cấp phát, không có menu kiểm kê");

    await login("demo.it1");
    await go("Công cụ dụng cụ");
    assert.strictEqual(await web.locator("tbody tr").count(), 12);
    assert.ok(!/Nguyên giá/.test(await bodyText())); assert.strictEqual(await web.locator('[data-action^="ccdcAssignOpen"]').count(), 0);
    ok("IT: xem toàn bộ 12 CCDC nhưng không cấp phát, không thấy nguyên giá");

    await login("demo.lanhdao");
    await go("Công cụ dụng cụ");
    const mgr = await web.locator("tbody tr td:nth-child(4)").allInnerTexts();
    assert.ok(mgr.length >= 1 && mgr.every((x) => /KHDN/.test(x) || /Khách hàng doanh nghiệp/i.test(x) || x.length > 0));
    const depts = new Set(mgr); assert.strictEqual(depts.size, 1, "lãnh đạo phòng chỉ thấy một phòng");
    assert.strictEqual(await web.locator('[data-action^="ccdcAssignOpen"]').count(), 0);
    ok("lãnh đạo phòng: chỉ thấy CCDC của phòng mình, không cấp phát trực tiếp");

    /* ===== 5. Quyền ghi phía máy chủ ===== */
    const resp = await web.evaluate(async () => {
      const r = await fetch("/api/db/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops: [
        { col: "inventoryChecks", op: "set", id: "hack1", data: { department_id: "ALL" } },
      ] }) });
      return r.json();
    });
    assert.strictEqual(resp.rejected.length, 1); assert.strictEqual(resp.applied, 0);
    ok("máy chủ chặn lãnh đạo phòng tự tạo phiên kiểm kê (chỉ Admin/TCTH)");

    /* ===== 6. Kiểm kê: Admin tạo phiên ===== */
    await login("demo.tcth");
    await go("Kiểm kê");
    await web.selectOption('form[data-form="new_inventory"] select[name=department_id]', "ALL");
    await web.selectOption('form[data-form="new_inventory"] select[name=kind_scope]', "ccdc");
    await web.click('form[data-form="new_inventory"] button[type=submit]');
    await synced();
    await web.locator('[data-action^="invOpenRun"]').first().click();
    await web.waitForSelector(".progress-bar-outer");
    t = await bodyText();
    assert.match(t, /Đã kiểm 0\/12/);
    ok("TCTH tạo phiên kiểm kê toàn chi nhánh cho CCDC: 12 mục chưa kiểm");

    await rowOf("CC0001").locator('[data-action$=":ok"]').click();
    promptText = "Không thấy ở kho, đã hỏi người giữ lần cuối";
    await rowOf("CC0002").locator('[data-action$=":missing"]').click();
    promptText = "Nhãn bị mờ, người giữ đã đổi";
    await rowOf("CC0004").locator('[data-action$=":mismatch"]').click();
    t = await bodyText();
    assert.match(t, /Đã kiểm 3\/12/); assert.match(t, /Không thấy ở kho/); assert.match(t, /Nhãn bị mờ/);
    ok("tích ✅ / ❌ / ⚠️ có ghi chú; tiến độ 3/12");

    await web.locator('form[data-form="inv_extra"] input[name=name]').fill("Ghế xoay chưa dán nhãn");
    await web.locator('form[data-form="inv_extra"] input[name=code]').fill("KHONGNHAN");
    await web.click('form[data-form="inv_extra"] button[type=submit]');
    assert.match(await bodyText(), /Ghế xoay chưa dán nhãn/);
    await synced();
    ok("ghi nhận tài sản thừa (không có trong sổ)");

    // Dữ liệu đã lên máy chủ
    const server = await web.evaluate(async () => (await (await fetch("/api/db?col=inventoryLines&since=0&limit=100")).json()).items);
    assert.strictEqual(server.length, 4);
    assert.ok(server.some((x) => x.data.result === "missing" && x.data.asset_code === "CC0002"));
    ok("kết quả kiểm kê đã lưu trên máy chủ (4 dòng, gồm 1 dòng thừa)");

    /* ===== 7. Lãnh đạo phòng cùng kiểm kê phần phòng mình ===== */
    await login("demo.lanhdao");
    await go("Kiểm kê");
    await web.locator('[data-action^="invOpenRun"]').first().click();
    await web.waitForSelector(".progress-bar-outer");
    const mgrRows = await web.locator("tbody tr").count();
    assert.ok(mgrRows >= 1 && mgrRows <= 4, "chỉ thấy CCDC phòng mình, nhận " + mgrRows);
    assert.strictEqual(await web.locator('[data-action^="invClose"]').count(), 0);
    assert.ok(await rowOf("CC0001").count() === 1 && await rowOf("CC0001").innerText().then((x) => /Có, đúng/.test(x)), "thấy kết quả TCTH đã tích cho phòng mình");
    await rowOf("CC0005").locator('[data-action$=":ok"]').click();
    await synced();
    assert.ok(await web.evaluate(() => DB.inventoryLines.some((l) => l.asset_code === "CC0005" && l.result === "ok")));
    ok("lãnh đạo phòng: chỉ thấy phần của phòng, tích được, không có nút chốt phiên");

    /* ===== 8. TCTH chốt phiên, đối chiếu ===== */
    await login("demo.tcth");
    await go("Kiểm kê");
    await web.locator('[data-action^="invOpenRun"]').first().click();
    await web.waitForSelector(".progress-bar-outer");
    await web.click('[data-action^="invClose"]');
    await synced();
    t = await bodyText();
    assert.match(t, /Đã chốt/);
    assert.strictEqual(await web.locator('[data-action^="invMark:"]').count(), 0, "đã chốt thì không còn nút tích");
    const closed = await web.evaluate(() => DB.inventoryChecks[DB.inventoryChecks.length - 1]);
    assert.strictEqual(closed.status, "closed"); assert.strictEqual(closed.summary.missing, 1); assert.strictEqual(closed.summary.mismatch, 1);
    assert.strictEqual(closed.summary.ok, 2); assert.strictEqual(closed.summary.unchecked, 8); assert.strictEqual(closed.summary.extra, 1);
    ok("chốt phiên: ẩn nút tích, lưu tóm tắt (2 đúng, 1 thiếu, 1 sai, 8 chưa kiểm, 1 thừa)");

    const [dl] = await Promise.all([web.waitForEvent("download"), web.click('[data-action^="invExportCSV"]')]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    assert.match(csv, /Không thấy/); assert.match(csv, /Sai thông tin/); assert.match(csv, /Thừa/); assert.match(csv, /CC0002/); assert.match(csv, /Nguyên giá/);
    ok("xuất CSV đối chiếu có đủ các trạng thái và cột nguyên giá (TCTH)");

    // Biên bản in: mở cửa sổ mới
    const [pop] = await Promise.all([web.context().waitForEvent("page"), web.click('[data-action^="invPrint"]')]);
    await pop.waitForLoadState();
    const ptxt = await pop.innerText("body");
    assert.match(ptxt, /BIÊN BẢN ĐỐI CHIẾU KIỂM KÊ/); assert.match(ptxt, /Chênh lệch cần xử lý \(2\)/); assert.match(ptxt, /Ghế xoay chưa dán nhãn/);
    await pop.close();
    ok("biên bản đối chiếu in được: 2 chênh lệch + 1 tài sản thừa");

    assert.deepStrictEqual(errors, [], "lỗi JS trong trang: " + errors.join(" | "));
    console.log("\nTất cả đạt");
  } catch (e) {
    console.error("THẤT BẠI:", e.message);
    console.error("--- log máy chủ ---\n" + log.slice(-1500));
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.kill();
  }
})();
