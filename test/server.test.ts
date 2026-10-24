// Kiểm thử logic máy chủ trên mã TypeScript thật của dự án, với Firestore và Claude giả.
// Chạy: NODE_PATH=test/fakes/node_modules tsx test/server.test.ts
import assert from "node:assert";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.ADMIN_KEY = "adm";
process.env.ANTHROPIC_API_KEY = "x";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g: any = globalThis;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e: any) { console.log("FAIL  " + name + "\n      " + (e.stack || e)); process.exitCode = 1; }
}

(async () => {
  const { db } = await import("../lib/firebase");
  const auth = await import("../lib/auth");
  const store = await import("../lib/store");
  const sync = await import("../app/api/db/sync/route");
  const dbRoute = await import("../app/api/db/route");
  const login = await import("../app/api/auth/login/route");
  const core = await import("../lib/core");
  const fake = g.__fakeDb;

  const cookieFor = (id: string) => auth.makeSessionCookie(id).split(";")[0];
  const post = (url: string, body: unknown, cookie?: string) =>
    new Request("http://x" + url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const get = (url: string, cookie?: string) => new Request("http://x" + url, { headers: cookie ? { cookie } : {} });
  const put = async (col: string, id: string, data: any) => { await db.collection(col).doc(id).set({ id, ...data, _u: Date.now(), _del: false }); };

  // Dữ liệu nền
  await put("users", "u1", { username: "admin", role: "admin", full_name: "Quản trị", is_active: true, password_hash: await auth.hashPassword("Admin#2026") });
  await put("users", "u3", { username: "it1", role: "it", full_name: "Trần Văn IT", is_active: true, telegram_id: "777", password_hash: await auth.hashPassword("It#2026pw") });
  await put("users", "u5", { username: "user1", role: "user", full_name: "Nhân viên", is_active: true, password_hash: await auth.hashPassword("User#2026") });
  await put("users", "u6", { username: "off", role: "it", full_name: "Đã nghỉ", is_active: false, password_hash: await auth.hashPassword("Off#2026pw") });
  await put("departments", "d1", { code: "D1", name: "Phòng KHDN - chung" });
  await put("categories", "c1", { code: "710102", name: "Máy vi tính để bàn" });
  await put("assets", "a1", { code: "FA0001", name: "Máy tính PC-0042 phòng KHDN", category_id: "c1", department_id: "d1", status: "broken", original_value: 15000000, remaining_value: 5000000, _kw: store.assetKeywords({ code: "FA0001", name: "Máy tính PC-0042 phòng KHDN" }) });
  await put("assets", "a2", { code: "FA0002", name: "Máy in HP phòng KHDN", category_id: "c1", department_id: "d1", status: "in_use", _kw: store.assetKeywords({ code: "FA0002", name: "Máy in HP phòng KHDN" }) });
  await put("repairs", "r1", { ticket_code: "GBH-KHDN-1", asset_id: "a1", description: "Máy không lên nguồn", status: "pending_it", it_id: null, created_at: new Date().toISOString() });
  await put("repairs", "r2", { ticket_code: "GBH-KHDN-2", asset_id: "a2", description: "Kẹt giấy", status: "pending_tcth", created_at: new Date().toISOString() });

  console.log("Kiểm thử máy chủ");

  /* ---------- Đăng nhập ---------- */
  await test("đăng nhập đúng: cấp cookie phiên HttpOnly, không lộ hash", async () => {
    const r = await login.POST(post("/api/auth/login", { username: "admin", password: "Admin#2026" }));
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get("set-cookie")!, /sid=.+HttpOnly/);
    assert.ok(!JSON.stringify(await r.json()).includes("hash"));
  });
  await test("sai mật khẩu / không tồn tại / đã khoá: cùng một thông báo 401", async () => {
    for (const [u, p] of [["admin", "sai"], ["khongco", "x"], ["off", "Off#2026pw"]]) {
      const r = await login.POST(post("/api/auth/login", { username: u, password: p }));
      assert.strictEqual(r.status, 401, u);
      assert.match((await r.json()).error, /Sai tên đăng nhập hoặc mật khẩu/);
    }
  });
  await test("sai 5 lần thì khoá 15 phút (429), kể cả khi nhập đúng", async () => {
    for (let i = 0; i < 5; i++) await login.POST(post("/api/auth/login", { username: "user1", password: "sai" + i }));
    const r = await login.POST(post("/api/auth/login", { username: "user1", password: "User#2026" }));
    assert.strictEqual(r.status, 429);
  });
  await test("cookie giả mạo hoặc hết hạn bị từ chối", async () => {
    assert.strictEqual(await auth.getSessionUser(get("/", "sid=abc.def")), null);
    const good = cookieFor("u1");
    assert.ok(await auth.getSessionUser(get("/", good)));
    const tampered = good.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    assert.strictEqual(await auth.getSessionUser(get("/", tampered)), null);
  });
  await test("tài khoản bị khoá sau khi đã đăng nhập: cookie cũ mất hiệu lực ngay", async () => {
    const c = cookieFor("u6");
    assert.strictEqual(await auth.getSessionUser(get("/", c)), null);
  });

  /* ---------- Đồng bộ ---------- */
  await test("chưa đăng nhập: GET/POST đều 401", async () => {
    assert.strictEqual((await dbRoute.GET(get("/api/db"))).status, 401);
    assert.strictEqual((await sync.POST(post("/api/db/sync", { ops: [] }))).status, 401);
  });
  await test("ghi tài sản: có _kw, _u, _del; sửa là thay toàn bộ; xoá để lại 'mồ'; tăng rev", async () => {
    const c = cookieFor("u1");
    const before = await store.readRev();
    await sleep(3);
    let r = await sync.POST(post("/api/db/sync", { ops: [{ col: "assets", op: "set", id: "a9", data: { id: "a9", code: "FA0009", name: "Máy quét Canon", status: "in_use" } }] }, c));
    assert.strictEqual(r.status, 200);
    const d = fake.data.assets.get("a9");
    assert.deepStrictEqual(d._kw.sort(), ["canon", "fa0009", "máy", "quét"].sort());
    assert.strictEqual(d._del, false);
    assert.ok((await store.readRev()) > before);
    await sync.POST(post("/api/db/sync", { ops: [{ col: "assets", op: "set", id: "a9", data: { id: "a9", code: "FA0009", name: "Máy quét", status: "in_use" } }] }, c));
    assert.ok(!("address" in fake.data.assets.get("a9")));
    await sync.POST(post("/api/db/sync", { ops: [{ col: "assets", op: "delete", id: "a9" }] }, c));
    assert.deepStrictEqual({ del: fake.data.assets.get("a9")._del, hasName: "name" in fake.data.assets.get("a9") }, { del: true, hasName: false });
  });
  await test("client không tự đặt được trường nội bộ (_u, _del, password_hash)", async () => {
    const c = cookieFor("u1");
    await sync.POST(post("/api/db/sync", { ops: [{ col: "assets", op: "set", id: "a8", data: { id: "a8", code: "X", name: "Y", _u: 1, _del: true, password_hash: "evil" } }] }, c));
    const d = fake.data.assets.get("a8");
    assert.strictEqual(d._del, false);
    assert.ok(d._u > 1);
    assert.ok(!("password_hash" in d));
  });
  await test("tài khoản: băm mật khẩu, giữ hash khi sửa không đổi mật khẩu, chặn trùng tên, không tự xoá mình", async () => {
    const c = cookieFor("u1");
    let r = await sync.POST(post("/api/db/sync", { ops: [{ col: "users", op: "set", id: "u9", data: { id: "u9", username: "it9", password: "Moi#Matkhau1", full_name: "IT 9", role: "it", is_active: true } }] }, c));
    assert.strictEqual(r.status, 200);
    const h1 = fake.data.users.get("u9").password_hash;
    assert.ok(h1.startsWith("scrypt$") && !h1.includes("Moi#Matkhau1"));
    assert.ok(!("password" in fake.data.users.get("u9")));
    assert.ok(await auth.verifyPassword("Moi#Matkhau1", h1));
    await sync.POST(post("/api/db/sync", { ops: [{ col: "users", op: "set", id: "u9", data: { id: "u9", username: "it9", full_name: "IT Chín", role: "it", is_active: true, telegram_id: "999" } }] }, c));
    assert.strictEqual(fake.data.users.get("u9").password_hash, h1);
    assert.strictEqual(fake.data.users.get("u9").telegram_id, "999");
    r = await sync.POST(post("/api/db/sync", { ops: [{ col: "users", op: "set", id: "u10", data: { id: "u10", username: "it9", full_name: "Trùng" } }] }, c));
    assert.strictEqual(r.status, 409);
    r = await sync.POST(post("/api/db/sync", { ops: [{ col: "users", op: "delete", id: "u1" }] }, c));
    assert.strictEqual((await r.json()).skipped, 1);
    assert.strictEqual(fake.data.users.get("u1")._del, false);
  });
  await test("phân quyền theo vai trò: IT ghi nhật ký được nhưng bị bỏ qua khi ghi users; lô vẫn chạy", async () => {
    const c = cookieFor("u3");
    const r = await sync.POST(post("/api/db/sync", { ops: [
      { col: "users", op: "set", id: "u3", data: { id: "u3", username: "it1", role: "admin" } },
      { col: "assets", op: "set", id: "a2", data: { id: "a2", code: "FA0002", name: "Máy in HP (IT sửa)", status: "in_use" } },
    ] }, c));
    const body = await r.json();
    assert.deepStrictEqual(body.rejected, [{ col: "users", id: "u3" }]);
    assert.strictEqual(fake.data.users.get("u3").role, "it", "IT không được tự nâng quyền");
    assert.strictEqual(fake.data.assets.get("a2").name, "Máy in HP (IT sửa)");
  });
  await test("dữ liệu sai định dạng bị từ chối cả lô (400)", async () => {
    const c = cookieFor("u1");
    for (const bad of [{ col: "khac", op: "set", id: "x", data: {} }, { col: "assets", op: "set", id: "a/b", data: {} }, { col: "assets", op: "set", id: "", data: {} }, { col: "assets", op: "set", id: "z" }]) {
      const r = await sync.POST(post("/api/db/sync", { ops: [bad] }, c));
      assert.strictEqual(r.status, 400, JSON.stringify(bad));
    }
  });
  await test("GET phân trang theo _u, không lộ hash/_kw, tombstone có cờ deleted", async () => {
    const c = cookieFor("u1");
    let all: any[] = [], after: string | null = null, pages = 0;
    do {
      const r = await dbRoute.GET(get(`/api/db?col=users&since=0&limit=2${after ? "&after=" + after : ""}`, c));
      const b = await r.json();
      all = all.concat(b.items); after = b.next; pages++;
    } while (after);
    assert.ok(pages >= 2);
    assert.ok(!JSON.stringify(all).includes("password_hash") && !JSON.stringify(all).includes("scrypt"));
    const a = await (await dbRoute.GET(get("/api/db?col=assets&since=0", c))).json();
    assert.ok(!JSON.stringify(a).includes("_kw"));
    assert.ok(a.items.some((i: any) => i.id === "a9" && i.deleted === true));
    const rev = await (await dbRoute.GET(get("/api/db", c))).json();
    assert.ok(typeof rev.rev === "number" && rev.rev > 0);
    assert.strictEqual((await dbRoute.GET(get("/api/db?col=bậy", c))).status, 400);
  });

  await test("GET /api/db cắt trang theo dung lượng (<4,5MB của Vercel) nhưng phân trang vẫn lấy đủ", async () => {
    const c = cookieFor("u1");
    const big = "x".repeat(800 * 1024);
    for (let i = 0; i < 6; i++) await put("config", "big" + i, { value: big });
    let items: any[] = [], after: string | null = null, pages = 0, maxBytes = 0;
    do {
      const r = await dbRoute.GET(get(`/api/db?col=config&since=0&limit=800${after ? "&after=" + after : ""}`, c));
      const text = await r.text();
      maxBytes = Math.max(maxBytes, Buffer.byteLength(text));
      const b = JSON.parse(text);
      items = items.concat(b.items); after = b.next; pages++;
    } while (after);
    assert.strictEqual(items.length, 6, "phải lấy đủ 6 bản ghi lớn");
    assert.ok(pages >= 2, "phải bị chia thành nhiều trang");
    assert.ok(maxBytes < 3_400_000, "mỗi trang phải dưới ~3,4MB, thực tế " + maxBytes);
  });
  await test("so sánh khoá bí mật: đúng/sai/thiếu/khác độ dài", async () => {
    assert.strictEqual(auth.safeEqual("abc", "abc"), true);
    assert.strictEqual(auth.safeEqual("abc", "abd"), false);
    assert.strictEqual(auth.safeEqual("abc", "abcd"), false);
    assert.strictEqual(auth.safeEqual(null, "abc"), false);
    assert.strictEqual(auth.safeEqual("abc", undefined), false);
    assert.strictEqual(auth.safeEqual("", ""), false, "chuỗi rỗng không bao giờ coi là khớp");
  });
  /* ---------- Chatbot ---------- */
  const it = { id: "u3", full_name: "Trần Văn IT", role: "it" };
  await test("tra cứu tài sản theo mã và theo từ khoá; kết quả cho Claude không có nguyên giá", async () => {
    assert.strictEqual((await core.findAssets("fa0001")).length, 1);
    assert.strictEqual((await core.findAssets("FA0001"))[0].id, "a1");
    assert.deepStrictEqual((await core.findAssets("máy in")).map((a) => a.code), ["FA0002"]);
    assert.strictEqual((await core.findAssets("khongco")).length, 0);
    const { assetView } = await import("../lib/lookup");
    const v = await assetView((await core.findAssets("FA0001"))[0]);
    assert.deepStrictEqual(Object.keys(v).sort(), ["category", "code", "current_user", "department", "name", "status"]);
    assert.strictEqual(v.department, "Phòng KHDN - chung");
    assert.ok(!JSON.stringify(v).includes("15000000"));
  });

  // Kịch bản Claude: gọi find_asset, get_open_tickets, rồi propose_worklog (đóng phiếu)
  const scripted = (calls: any[]) => {
    let i = 0;
    g.__claude = async () => {
      const c = calls[i++];
      return c.text ? { stop_reason: "end_turn", content: [{ type: "text", text: c.text }] } : { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + i, name: c.name, input: c.input }] };
    };
  };

  let draftId = "";
  await test("IT báo xong phiếu: Claude dùng tool, bot trả bản nháp có nút và ghi rõ sẽ đóng phiếu", async () => {
    scripted([
      { name: "find_asset", input: { query: "FA0001" } },
      { name: "get_open_tickets", input: { asset_code: "FA0001" } },
      { name: "propose_worklog", input: { asset_code: "FA0001", category: "Sửa chữa phần cứng", description: "Thay nguồn", duration_min: 45, status: "done", ticket_code: "GBH-KHDN-1" } },
    ]);
    const reply = await core.handleText(it, "xong máy FA0001 thay nguồn 45 phút");
    assert.match(reply.text, /FA0001/);
    assert.match(reply.text, /sẽ đóng phiếu/);
    assert.strictEqual(reply.buttons!.length, 2);
    draftId = reply.buttons![0].data.split(":")[1];
    assert.ok(fake.data.drafts.get(draftId));
  });
  await test("bấm ✅: ghi nhật ký + đóng phiếu + tài sản về Đang sử dụng + lịch sử hồ sơ + tăng rev", async () => {
    const rev0 = await store.readRev(); await sleep(3);
    const msg = await core.handleCallback(it, "ok:" + draftId);
    assert.match(msg, /WL-0001/);
    assert.match(msg, /đóng phiếu GBH-KHDN-1/);
    const wl = fake.data.worklogs.get("WL-0001");
    assert.deepStrictEqual({ a: wl.asset_id, u: wl.it_user_id, d: wl.duration_min, t: wl.ticket_code, del: wl._del }, { a: "a1", u: "u3", d: 45, t: "GBH-KHDN-1", del: false });
    const rp = fake.data.repairs.get("r1");
    assert.strictEqual(rp.status, "completed");
    assert.strictEqual(rp.it_id, "u3");
    assert.strictEqual(rp.resolution_note, "Thay nguồn");
    assert.ok(rp.it_at && rp._u);
    const as = fake.data.assets.get("a1");
    assert.strictEqual(as.status, "in_use");
    assert.ok(as.status_changed_at);
    const hist = [...fake.data.assetHistory.values()].filter((h: any) => h.asset_id === "a1");
    assert.deepStrictEqual(hist.map((h: any) => h.event_type).sort(), ["it_work", "status_change"]);
    assert.ok(hist.every((h: any) => h._del === false && h._u && h.actor_id === "u3"));
    assert.ok(!fake.data.drafts.get(draftId), "nháp phải bị xoá");
    assert.ok((await store.readRev()) > rev0);
  });
  await test("bấm ✅ lần hai (bấm đúp): không ghi trùng", async () => {
    const before = fake.data.worklogs.size;
    const msg = await core.handleCallback(it, "ok:" + draftId);
    assert.match(msg, /không còn|đã được ghi/);
    assert.strictEqual(fake.data.worklogs.size, before);
  });
  await test("nháp của người khác / hết hạn / huỷ", async () => {
    await db.collection("drafts").doc("dx").set({ asset_id: "a2", asset_code: "FA0002", asset_name: "n", category: "Khác", description: "d", duration_min: 0, status: "done", user_id: "u1", expires_at: Date.now() + 60000 });
    assert.match(await core.handleCallback(it, "ok:dx"), /của người khác/);
    await db.collection("drafts").doc("dy").set({ asset_id: "a2", asset_code: "FA0002", asset_name: "n", category: "Khác", description: "d", duration_min: 0, status: "done", user_id: "u3", expires_at: Date.now() - 1 });
    assert.match(await core.handleCallback(it, "ok:dy"), /hết hạn/);
    await db.collection("drafts").doc("dz").set({ asset_id: "a2", user_id: "u3", expires_at: Date.now() + 60000 });
    assert.strictEqual(await core.handleCallback(it, "no:dz"), "Đã huỷ.");
    assert.ok(!fake.data.drafts.get("dz"));
  });
  await test("phiếu chưa tới bước Điện toán: vẫn ghi nhật ký nhưng KHÔNG đóng phiếu, báo rõ lý do", async () => {
    scripted([
      { name: "propose_worklog", input: { asset_code: "FA0002", category: "Máy in/Photocopy", description: "Gỡ kẹt giấy", duration_min: 5, status: "done", ticket_code: "GBH-KHDN-2" } },
    ]);
    const reply = await core.handleText(it, "gỡ kẹt giấy máy in FA0002");
    const msg = await core.handleCallback(it, reply.buttons![0].data);
    assert.match(msg, /chưa tự đóng/);
    assert.match(msg, /TCTH tiếp nhận/);
    assert.strictEqual(fake.data.repairs.get("r2").status, "pending_tcth");
    assert.ok(fake.data.worklogs.get("WL-0002"));
  });
  await test("mã tài sản/phiếu sai: tool trả lỗi cho Claude, không tạo nháp", async () => {
    const drafts = fake.data.drafts.size;
    let seen = "";
    let n = 0;
    g.__claude = async (req: any) => {
      if (n++ === 0) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "propose_worklog", input: { asset_code: "KHONGCO", category: "Khác", description: "x", duration_min: 1, status: "done" } }] };
      seen = JSON.stringify(req.messages[req.messages.length - 1].content);
      return { stop_reason: "end_turn", content: [{ type: "text", text: "Bạn kiểm tra lại mã giúp." }] };
    };
    const reply = await core.handleText(it, "sửa KHONGCO");
    assert.match(seen, /is_error/);
    assert.match(reply.text, /kiểm tra lại mã/);
    assert.strictEqual(fake.data.drafts.size, drafts);
    scripted([{ name: "propose_worklog", input: { asset_code: "FA0002", category: "Khác", description: "x", duration_min: 1, status: "done", ticket_code: "GBH-KHDN-1" } }, { text: "Phiếu đó không thuộc thiết bị này." }]);
    assert.match((await core.handleText(it, "x")).text, /không thuộc/);
  });
  await test("vai trò không phải IT/Admin không ghi được nhật ký qua bot", async () => {
    g.__claude = async () => { throw new Error("không được gọi Claude"); };
    const r = await core.handleText({ id: "u5", full_name: "NV", role: "user" }, "thay ram FA0001");
    assert.match(r.text, /chỉ dùng được/);
  });
  await test("lệnh /lichsu, /phieu, /homnay", async () => {
    const h = core.formatHistory("FA0001", await core.getHistory("a1"));
    assert.match(h, /Thay nguồn/);
    const t = await core.myTickets(it as any);
    assert.match(t, /Không có phiếu nào đang chờ/, "r1 đã đóng, r2 đang ở TCTH");
    await put("repairs", "r3", { ticket_code: "GBH-KHDN-3", asset_id: "a2", description: "Hỏng mực", status: "pending_it", it_id: null, created_at: new Date().toISOString() });
    assert.match(await core.myTickets(it as any), /GBH-KHDN-3 · FA0002/);
    assert.match(await core.todaySummary(it as any), /đã ghi 2 việc/);
  });

  await test("webhook Telegram: sai secret 403; /id trả ID cho cả người chưa có quyền; người lạ nhắn thường bị từ chối kèm ID", async () => {
    process.env.TG_SECRET = "tgs"; process.env.TELEGRAM_BOT_TOKEN = "tok"; delete process.env.TG_GROUP_ID;
    const sent: any[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).startsWith("https://api.telegram.org/")) { sent.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true })); }
      return realFetch(url, init);
    }) as any;
    try {
      const hook = await import("../app/api/webhook/telegram/route");
      const call = (update: any, secret = "tgs") => hook.POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) }));
      assert.strictEqual((await call({}, "sai")).status, 403);
      assert.strictEqual((await hook.POST(new Request("http://x", { method: "POST", body: "{}" }))).status, 403, "thiếu header secret");
      await call({ message: { text: "/id@MyBot", from: { id: 424242 }, chat: { id: -100999, type: "supergroup" } } });
      assert.match(sent[sent.length - 1].body.text, /424242/);
      assert.match(sent[sent.length - 1].body.text, /-100999/);
      await call({ message: { text: "Thay RAM FA0001", from: { id: 31337 }, chat: { id: 31337, type: "private" } } });
      assert.match(sent[sent.length - 1].body.text, /chưa được cấp quyền/);
      assert.match(sent[sent.length - 1].body.text, /31337/);
      await call({ message: { text: "/help", from: { id: 777 }, chat: { id: 777, type: "private" } } });
      assert.match(sent[sent.length - 1].body.text, /\/lichsu/);
      assert.match(sent[sent.length - 1].body.text, /\/id/);
    } finally { globalThis.fetch = realFetch; }
  });

  /* ---------- API quản trị (chạy cuối vì nạp dữ liệu demo vào cùng cơ sở dữ liệu giả) ---------- */
  await test("API quản trị: sai khoá 403; bootstrap tạo admin đăng nhập được; import-backup nạp và băm mật khẩu", async () => {
    const importRoute = await import("../app/api/admin/import-backup/route");
    const bootRoute = await import("../app/api/admin/bootstrap/route");
    const adm = (body: unknown, key?: string) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-admin-key": key } : {}) }, body: JSON.stringify(body) });
    assert.strictEqual((await bootRoute.POST(adm({ username: "x", password: "12345678" }))).status, 403);
    assert.strictEqual((await bootRoute.POST(adm({ username: "x", password: "12345678" }, "sai"))).status, 403);
    assert.strictEqual((await importRoute.POST(adm({}, "sai"))).status, 403);
    assert.strictEqual((await bootRoute.POST(adm({ username: "boss", password: "ngan" }, "adm"))).status, 400, "mật khẩu < 8 ký tự bị từ chối");
    assert.strictEqual((await bootRoute.POST(adm({ username: "boss", password: "p\"a'ss1234", full_name: "Sếp" }, "adm"))).status, 200);
    let r = await login.POST(post("/api/auth/login", { username: "boss", password: "p\"a'ss1234" }));
    assert.strictEqual(r.status, 200);
    const { buildBackup } = require("../demo/demo-data.js");
    r = await importRoute.POST(adm(buildBackup(Date.now()), "adm"));
    const out = await r.json();
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.imported.assets, 49);
    assert.strictEqual(out.usersWithoutPassword, 0);
    const u = fake.data.users.get("u_it1");
    assert.ok(u.password_hash.startsWith("scrypt$") && !("password" in u));
    assert.strictEqual((await login.POST(post("/api/auth/login", { username: "demo.it1", password: "Demo@2026" }))).status, 200);
    assert.strictEqual((await importRoute.POST(adm({ users: "x", assets: [] }, "adm"))).status, 400, "file sai chuẩn bị từ chối");
  });

  console.log("\n" + passed + " kiểm thử đạt" + (process.exitCode ? ", CÓ KIỂM THỬ LỖI" : ""));
})();
