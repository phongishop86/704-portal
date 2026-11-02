#!/usr/bin/env node
// Bot Telegram cho máy chủ NỘI BỘ (không có địa chỉ HTTPS công khai):
// hỏi Telegram bằng getUpdates (chỉ cần kết nối RA Internet, không mở cổng vào),
// rồi chuyển từng tin cho webhook cục bộ của ứng dụng (http://localhost:PORT/api/webhook/telegram).
// Biến môi trường: TELEGRAM_BOT_TOKEN, TG_SECRET, PORT (mặc định 3000); TELEGRAM_API_BASE (chỉ để thử nghiệm).
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TG_SECRET || "";
const port = process.env.PORT || "3000";
const base = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org") + "/bot" + token;
const local = `http://127.0.0.1:${port}/api/webhook/telegram`;
if (!token) { console.error("Thiếu TELEGRAM_BOT_TOKEN - không chạy bot."); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function tg(method, body, timeoutMs = 65000) {
  const r = await fetch(`${base}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}

async function main() {
  // getUpdates không dùng được khi còn webhook -> gỡ webhook (Vercel) trước
  try { await tg("deleteWebhook", { drop_pending_updates: false }, 15000); log("Đã gỡ webhook cũ, chuyển sang getUpdates"); }
  catch (e) { log("deleteWebhook:", e.message); }
  let offset = 0, fails = 0;
  for (;;) {
    try {
      const ups = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] });
      fails = 0;
      for (const u of ups) {
        offset = u.update_id + 1;
        try {
          const r = await fetch(local, {
            method: "POST",
            headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
            body: JSON.stringify(u), signal: AbortSignal.timeout(60000),
          });
          if (!r.ok) log("webhook cục bộ trả", r.status, "cho update", u.update_id);
        } catch (e) { log("không gọi được ứng dụng:", e.message); await sleep(3000); }
      }
    } catch (e) {
      fails++;
      log("getUpdates lỗi:", e.message);
      await sleep(Math.min(30000, 2000 * fails));
    }
  }
}
main();
