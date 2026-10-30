import { db } from "@/lib/firebase";
import { safeEqual } from "@/lib/auth";
import {
  findAssets,
  formatHistory,
  getHistory,
  handleCallback,
  handleText,
  myTickets,
  todaySummary,
} from "@/lib/core";
import { tgAnswerCallback, tgEdit, tgSend } from "@/lib/channels/telegram";
import { wizardActive, wizardCallback, wizardCancel, wizardStart, wizardText } from "@/lib/wizard";
import type { User } from "@/lib/types";

export const maxDuration = 60;

/** Nhân viên được nhận diện bằng "Telegram ID" nhập ở Admin → Người dùng của 704-assets. */
async function getUserByTelegramId(tgId: string): Promise<User | null> {
  const snap = await db.collection("users").where("telegram_id", "==", tgId).limit(5).get();
  const d = snap.docs.find((x) => !x.data()._del && x.data().is_active !== false);
  if (!d) return null;
  const u = d.data();
  return { id: d.id, full_name: String(u.full_name ?? ""), role: String(u.role ?? "user"), telegram_id: tgId };
}

const HELP =
  "Cách dùng:\n• /nhatky — khai báo nhật ký từng bước (phòng ban, user báo, sự cố, thiết bị, serial, thời gian, xử lý, kết quả, khuyến nghị)\n• /huy — thoát khi đang khai báo\n• Nhắn tự nhiên, ví dụ: Thay RAM máy FA0001, 30 phút\n• /lichsu FA0001 — lịch sử xử lý thiết bị\n• /phieu — phiếu đang chờ Điện toán xử lý\n• /homnay — việc bạn đã ghi hôm nay\n• /id — xem Telegram ID của bạn và ID nhóm đang chat";

export async function POST(req: Request) {
  // 1. Chặn request giả mạo (secret_token đặt khi setWebhook)
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TG_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json();

  try {
    // Nút bấm ✅/❌
    if (update.callback_query) {
      const cb = update.callback_query;
      await tgAnswerCallback(cb.id);
      const user = await getUserByTelegramId(String(cb.from.id));
      if (!user) return Response.json({ ok: true });
      if (typeof cb.data === "string" && cb.data.startsWith("w:")) {
        const out = await wizardCallback(user, cb.data);
        if (out.ack) await tgEdit(cb.message.chat.id, cb.message.message_id, out.ack);
        if (out.next) await tgSend(cb.message.chat.id, out.next.text, out.next.buttons);
        return Response.json({ ok: true });
      }
      const result = await handleCallback(user, cb.data);
      await tgEdit(cb.message.chat.id, cb.message.message_id, result);
      return Response.json({ ok: true });
    }

    const msg = update.message;
    if (!msg?.text) return Response.json({ ok: true });
    const chatId = msg.chat.id;
    const text: string = msg.text.trim();

    // /id: ai cũng dùng được (kể cả chưa có quyền) để biết Telegram ID của mình và ID của nhóm (điền TG_GROUP_ID)
    if (/^\/id(@\w+)?$/i.test(text)) {
      await tgSend(chatId, `Telegram ID của bạn: ${msg.from.id}\nID cuộc trò chuyện này: ${chatId}`);
      return Response.json({ ok: true });
    }

    // 2. Chỉ tài khoản 704-assets có Telegram ID khớp (và đang hoạt động) mới được dùng
    const user = await getUserByTelegramId(String(msg.from.id));
    if (!user) {
      await tgSend(
        chatId,
        `Bạn chưa được cấp quyền. Gửi số này cho quản trị để nhập vào mục Telegram ID của tài khoản bạn trên 704-assets: ${msg.from.id}`,
      );
      return Response.json({ ok: true });
    }

    // 3. Lệnh nhanh
    if (/^\/(nhatky|moi|ghi)(@\w+)?$/i.test(text)) {
      const r = await wizardStart(user);
      await tgSend(chatId, r.text, r.buttons);
    } else if (/^\/(huy|cancel)(@\w+)?$/i.test(text)) {
      await tgSend(chatId, await wizardCancel(user));
    } else if (text === "/start" || text === "/help") {
      await tgSend(chatId, `Xin chào ${user.full_name}.\n${HELP}`);
    } else if (text.startsWith("/lichsu")) {
      const code = text.replace("/lichsu", "").trim();
      if (!code) {
        await tgSend(chatId, "Cú pháp: /lichsu FA0001");
      } else {
        const found = await findAssets(code);
        if (found.length !== 1) {
          await tgSend(chatId, found.length ? "Có nhiều kết quả, nhập mã chính xác hơn." : `Không thấy tài sản "${code}".`);
        } else {
          await tgSend(chatId, formatHistory(found[0].code, await getHistory(found[0].id)));
        }
      }
    } else if (text === "/phieu") {
      await tgSend(chatId, await myTickets(user));
    } else if (text === "/homnay") {
      await tgSend(chatId, await todaySummary(user));
    } else if (/^\/(boqua|skip)$/i.test(text) && (await wizardActive(user))) {
      const r = await wizardText(user, text);
      await tgSend(chatId, r.text, r.buttons);
    } else if (text.startsWith("/")) {
      // Lệnh không biết (kể cả gõ mỗi dấu "/") không gửi cho AI: nhắc cách dùng
      await tgSend(chatId, HELP);
    } else if (await wizardActive(user)) {
      const r = await wizardText(user, text);
      await tgSend(chatId, r.text, r.buttons);
    } else {
      // 4. Tin nhắn tự nhiên → Claude
      const reply = await handleText(user, text);
      await tgSend(chatId, reply.text, reply.buttons);
    }
  } catch (e) {
    console.error("Webhook lỗi:", e);
    // Báo lỗi ngắn cho người nhắn (không kèm khóa/chi tiết nhạy cảm) để không im lặng.
    try {
      const chat = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
      const why = e instanceof Error ? e.message.slice(0, 160) : "lỗi không rõ";
      if (chat) await tgSend(chat, `Bot gặp lỗi khi xử lý: ${why}`);
    } catch {
      /* bỏ qua */
    }
    // Luôn trả 200 để Telegram không gửi lại liên tục
  }
  return Response.json({ ok: true });
}
