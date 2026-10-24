// Chạy DEMO cục bộ: toàn bộ 704-assets (giao diện web + API + bot) trên máy bạn, không cần Firebase/Vercel/Telegram/Claude.
//   npm run demo      → http://localhost:3000        (web 704-assets)
//                       http://localhost:3000/demo/chat (giả lập Telegram)
// Mã API và bot là mã THẬT của dự án; chỉ Firestore (trong bộ nhớ), Telegram (giả lập) và Claude (bộ quy tắc) là giả.
// Dữ liệu nằm trong bộ nhớ: tắt server là mất, mở lại là dữ liệu mẫu mới tinh.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();

Object.assign(process.env, {
  SESSION_SECRET: "demo-session-secret-demo-session-secret",
  ADMIN_KEY: "demo-admin-key",
  CRON_SECRET: "demo-cron-secret",
  TG_SECRET: "demo-tg-secret",
  TELEGRAM_BOT_TOKEN: "demo-token",
  TG_GROUP_ID: "-1001",
  ANTHROPIC_API_KEY: "demo",
});
delete process.env.GOOGLE_CLIENT_EMAIL;
delete process.env.SHEET_ID;

/* ---------- Telegram giả: chặn lời gọi api.telegram.org, đẩy tin vào hộp thư của từng cuộc chat ---------- */
type Out = { id: number; kind: "msg" | "edit"; text: string; buttons?: { text: string; data: string }[] };
const outbox = new Map<string, Out[]>();
let msgSeq = 1000;
const box = (chat: string) => outbox.get(chat) ?? (outbox.set(chat, []), outbox.get(chat)!);

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (!u.startsWith("https://api.telegram.org/")) return realFetch(url, init);
  const method = u.split("/").pop()!;
  const body = JSON.parse(String(init?.body ?? "{}"));
  let id = 0;
  if (method === "sendMessage") {
    id = ++msgSeq;
    const buttons = body.reply_markup?.inline_keyboard?.flat().map((b: any) => ({ text: b.text, data: b.callback_data }));
    box(String(body.chat_id)).push({ id, kind: "msg", text: body.text, buttons });
  } else if (method === "editMessageText") {
    id = body.message_id;
    box(String(body.chat_id)).push({ id, kind: "edit", text: body.text });
  }
  return new Response(JSON.stringify({ ok: true, result: { message_id: id } }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

/* ---------- Danh tính chat trong demo (Telegram ID giả gắn với tài khoản demo) ---------- */
const CHATS = [
  { tg: "900001", userId: "u_it1", label: "Trần Văn Điện Toán", role: "IT" },
  { tg: "900002", userId: "u_it2", label: "Lê Thị Mạng", role: "IT" },
  { tg: "900000", userId: "u_admin", label: "Quản trị (demo)", role: "Admin" },
  { tg: "900004", userId: "u_nv", label: "Võ Minh Nhân Viên", role: "Nhân viên (không có quyền ghi)" },
];
const GROUP = "-1001";

async function main() {
  const indexPath = path.join(ROOT, "public", "app.html");
  if (!fs.existsSync(indexPath)) throw new Error("Không thấy public/app.html. Chạy demo từ thư mục gốc của dự án.");
  const chatPage = fs.readFileSync(path.join(ROOT, "demo", "chat.html"), "utf8");

  const { installFakeClaude } = await import("./fake-claude");
  installFakeClaude();
  const { buildBackup } = require("./demo-data.js");
  const importRoute = await import("../app/api/admin/import-backup/route");

  const routes: Record<string, () => Promise<any>> = {
    "/api/auth/login": () => import("../app/api/auth/login/route"),
    "/api/auth/logout": () => import("../app/api/auth/logout/route"),
    "/api/auth/me": () => import("../app/api/auth/me/route"),
    "/api/db": () => import("../app/api/db/route"),
    "/api/db/sync": () => import("../app/api/db/sync/route"),
    "/api/webhook/telegram": () => import("../app/api/webhook/telegram/route"),
    "/api/cron/remind": () => import("../app/api/cron/remind/route"),
    "/api/admin/import-backup": () => import("../app/api/admin/import-backup/route"),
    "/api/admin/bootstrap": () => import("../app/api/admin/bootstrap/route"),
  };

  const fakeDb = (globalThis as any).__fakeDb;
  async function seed() {
    fakeDb.data = {};
    outbox.clear();
    const telegramIds = Object.fromEntries(CHATS.map((c) => [c.userId, c.tg]));
    const res = await importRoute.POST(
      new Request("http://demo/api/admin/import-backup", {
        method: "POST",
        headers: { "x-admin-key": process.env.ADMIN_KEY!, "content-type": "application/json" },
        body: JSON.stringify(buildBackup(Date.now(), { telegramIds })),
      }),
    );
    const out = await res.json();
    if (!out.ok) throw new Error("Nạp dữ liệu demo lỗi: " + JSON.stringify(out));
    return out;
  }
  const seeded = await seed();

  const toRequest = async (req: http.IncomingMessage, url: URL) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
    return new Request(url, {
      method: req.method,
      headers: req.headers as any,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
  };
  const send = (res: http.ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
    res.end(body);
  };
  const sendJson = (res: http.ServerResponse, body: unknown, status = 200) => send(res, status, JSON.stringify(body), "application/json");
  const readJson = async (req: http.IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
  };

  // Gửi một "update Telegram" tới webhook THẬT, rồi trả các tin mới của cuộc chat
  async function webhook(update: unknown) {
    const mod = await routes["/api/webhook/telegram"]();
    await mod.POST(
      new Request("http://demo/api/webhook/telegram", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": process.env.TG_SECRET!, "content-type": "application/json" },
        body: JSON.stringify(update),
      }),
    );
  }
  let updateSeq = 1;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://localhost:${PORT}`);
      const p = url.pathname;

      if (p === "/" || p === "/app.html") return send(res, 200, fs.readFileSync(indexPath), "text/html; charset=utf-8");
      if (p === "/demo/chat") return send(res, 200, chatPage, "text/html; charset=utf-8");

      if (p === "/demo/api/chats") return sendJson(res, { chats: CHATS, group: GROUP });
      if (p === "/demo/api/outbox") {
        const items = box(String(url.searchParams.get("chat")));
        const since = Number(url.searchParams.get("since")) || 0;
        return sendJson(res, { items: items.slice(since), next: items.length });
      }
      if (p === "/demo/api/send" && req.method === "POST") {
        const b = await readJson(req);
        const from = { id: Number(b.chat), first_name: "demo" };
        await webhook({ update_id: updateSeq++, message: { message_id: updateSeq, from, chat: { id: from.id, type: "private" }, text: String(b.text ?? "") } });
        return sendJson(res, { ok: true });
      }
      if (p === "/demo/api/press" && req.method === "POST") {
        const b = await readJson(req);
        const from = { id: Number(b.chat), first_name: "demo" };
        await webhook({ update_id: updateSeq++, callback_query: { id: "cb" + updateSeq, from, data: String(b.data), message: { message_id: Number(b.message_id), chat: { id: from.id } } } });
        return sendJson(res, { ok: true });
      }
      if (p === "/demo/api/cron" && req.method === "POST") {
        const mod = await routes["/api/cron/remind"]();
        const r = await mod.GET(new Request("http://demo/api/cron/remind", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
        return sendJson(res, await r.json());
      }
      if (p === "/demo/api/reset" && req.method === "POST") {
        await seed();
        return sendJson(res, { ok: true });
      }

      if (routes[p]) {
        const mod = await routes[p]();
        const handler = mod[req.method || "GET"];
        if (!handler) return send(res, 405, "method not allowed", "text/plain");
        const r: Response = await handler(await toRequest(req, url));
        const headers: Record<string, string> = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        res.writeHead(r.status, headers);
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      send(res, 404, "not found", "text/plain");
    } catch (e: any) {
      console.error(e);
      sendJson(res, { error: String(e?.message || e) }, 500);
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log("\n  704-assets · CHẾ ĐỘ DEMO (dữ liệu trong bộ nhớ, tắt là mất)\n");
    console.log(`  Web 704-assets : http://localhost:${PORT}`);
    console.log(`  Giả lập Telegram: http://localhost:${PORT}/demo/chat`);
    console.log("  Tài khoản (mật khẩu Demo@2026): demo.admin · demo.tcth · demo.it1 · demo.it2 · demo.lanhdao · demo.lanhdao.bl · demo.nhanvien");
    console.log(`  Đã nạp: ${Object.entries(seeded.imported).map(([k, v]) => `${v} ${k}`).join(", ")}\n`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
