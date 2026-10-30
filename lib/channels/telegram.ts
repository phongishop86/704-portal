import type { Button } from "../types";

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function call(method: string, body: unknown) {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} lỗi`, res.status, await res.text());
}

export function tgSend(chatId: number | string, text: string, buttons?: Button[] | Button[][]) {
  const rows: Button[][] | undefined = !buttons || !buttons.length ? undefined : Array.isArray(buttons[0]) ? (buttons as Button[][]) : [buttons as Button[]];
  return call("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: rows ? { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) } : undefined,
  });
}

export function tgEdit(chatId: number | string, messageId: number, text: string) {
  return call("editMessageText", { chat_id: chatId, message_id: messageId, text });
}

export function tgAnswerCallback(callbackId: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackId });
}
