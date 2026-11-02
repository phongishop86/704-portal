import { db } from "./firebase";
import { tgSend } from "./channels/telegram";

/**
 * Thông báo Telegram khi phiếu báo hỏng đổi trạng thái (gọi từ /api/db/sync sau khi ghi thành công).
 * Gửi tới: nhân viên có Telegram ID theo vai trò, và nhóm TG_GROUP_ID (nếu có). Lỗi gửi không làm hỏng việc lưu.
 */
type Rec = Record<string, unknown>;
export interface RepairEvent { prev: Rec | undefined; next: Rec }

async function usersByRole(roles: string[]): Promise<{ id: string; tg: string }[]> {
  const out: { id: string; tg: string }[] = [];
  for (const r of roles) {
    const snap = await db.collection("users").where("role", "==", r).limit(60).get();
    for (const d of snap.docs) {
      const u = d.data();
      if (!u._del && u.is_active !== false && u.telegram_id) out.push({ id: d.id, tg: String(u.telegram_id) });
    }
  }
  return out;
}
const one = async (col: string, id: unknown): Promise<Rec | undefined> => {
  if (typeof id !== "string" || !id) return undefined;
  const d = (await db.collection(col).doc(id).get()).data();
  return d && !d._del ? d : undefined;
};

export async function notifyRepairs(events: RepairEvent[]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !events.length) return;
  const group = process.env.TG_GROUP_ID;
  for (const ev of events) {
    const to = String(ev.next.status ?? ""), from = ev.prev ? String(ev.prev.status ?? "") : "";
    if (ev.prev && to === from) continue;
    const a = await one("assets", ev.next.asset_id);
    const dep = a ? await one("departments", a.department_id) : undefined;
    const who = await one("users", ev.next.reported_by);
    const code = String(ev.next.ticket_code ?? ev.next.id);
    const head = `${code} · ${a ? `${a.code} ${a.name}` : "tài sản"}`;
    const info = `\nPhòng: ${dep?.name ?? "-"}\nNgười báo: ${who?.full_name ?? "-"}\nMô tả: ${String(ev.next.description ?? "").slice(0, 300)}`;
    let text = "";
    let targets: string[] = [];
    let toGroup = false;
    if (!ev.prev && to === "pending_manager") {
      text = `🆕 Phiếu báo hỏng mới\n${head}${info}\nĐang chờ lãnh đạo phòng duyệt.`;
      targets = (await usersByRole(["it", "admin"])).map((u) => u.tg);
      toGroup = true;
    } else if (to === "pending_tcth") {
      text = `📨 Phiếu đã được LĐP duyệt, chờ TCTH điều phối\n${head}${info}`;
      targets = (await usersByRole(["tcth"])).map((u) => u.tg);
    } else if (to === "pending_it") {
      text = `🛠 Phiếu chuyển Điện toán xử lý\n${head}${info}`;
      const assigned = ev.next.it_id ? await one("users", ev.next.it_id) : undefined;
      targets = assigned?.telegram_id ? [String(assigned.telegram_id)] : (await usersByRole(["it", "admin"])).map((u) => u.tg);
      toGroup = true;
    } else if (to === "completed" || to === "rejected") {
      text = `${to === "completed" ? "✅ Phiếu đã xử lý xong" : "❌ Phiếu đã bị huỷ"}\n${head}${to === "rejected" && ev.next.reject_reason ? `\nLý do: ${String(ev.next.reject_reason).slice(0, 200)}` : ""}`;
      const rep = who?.telegram_id ? [String(who.telegram_id)] : [];
      targets = rep;
    }
    if (!text) continue;
    const ids = new Set(targets);
    if (toGroup && group) ids.add(group);
    await Promise.allSettled([...ids].map((id) => tgSend(id, text)));
  }
}
