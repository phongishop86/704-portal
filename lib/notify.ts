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

async function usersOfDept(role: string, dept: unknown): Promise<string[]> {
  if (!dept) return [];
  const snap = await db.collection("users").where("role", "==", role).limit(100).get();
  return snap.docs.map((d) => d.data()).filter((u) => !u._del && u.is_active !== false && u.telegram_id && String(u.department_id) === String(dept)).map((u) => String(u.telegram_id));
}

export async function notifyRepairs(events: RepairEvent[]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !events.length) return;
  const group = process.env.TG_GROUP_ID;
  for (const ev of events) {
    const to = String(ev.next.status ?? ""), from = ev.prev ? String(ev.prev.status ?? "") : "";
    // Người báo xác nhận / góp ý sau khi hoàn thành (trạng thái giữ nguyên, chỉ thêm user_confirmed_at)
    const confirmedNow = !!ev.prev && to === from && !ev.prev.user_confirmed_at && !!ev.next.user_confirmed_at;
    if (ev.prev && to === from && !confirmedNow) continue;
    const a = await one("assets", ev.next.asset_id);
    const dep = a ? await one("departments", a.department_id) : undefined;
    const who = await one("users", ev.next.reported_by);
    const code = String(ev.next.ticket_code ?? ev.next.id);
    const head = `${code} · ${a ? `${a.code} ${a.name}` : "tài sản"}`;
    const info = `\nPhòng: ${dep?.name ?? "-"}\nNgười báo: ${who?.full_name ?? "-"}\nMô tả: ${String(ev.next.description ?? "").slice(0, 300)}`;
    const fb = String(ev.next.user_feedback ?? "").slice(0, 300);
    const itUser = ev.next.it_id ? await one("users", ev.next.it_id) : undefined;
    const itTargets = async () => (itUser?.telegram_id ? [String(itUser.telegram_id)] : (await usersByRole(["it", "admin"])).map((u) => u.tg));
    let text = "";
    let targets: string[] = [];
    let toGroup = false;
    if (confirmedNow) {
      text = `👍 Người báo đã xác nhận hoàn tất\n${head}\nNgười xác nhận: ${who?.full_name ?? "-"}${fb ? `\nÝ kiến: ${fb}` : ""}`;
      targets = await itTargets();
      toGroup = true;
    } else if (!ev.prev && to === "pending_manager") {
      text = `🆕 Phiếu báo hỏng mới\n${head}${info}\nĐang chờ lãnh đạo phòng duyệt.`;
      targets = (await usersByRole(["it", "admin"])).map((u) => u.tg);
      toGroup = true;
    } else if (to === "pending_tcth") {
      text = `📨 Phiếu đã được LĐP duyệt, chờ TCTH điều phối\n${head}${info}`;
      targets = (await usersByRole(["tcth"])).map((u) => u.tg);
    } else if (to === "pending_it" && from === "completed") {
      text = `↩️ Người báo chưa đồng ý kết quả, yêu cầu xử lý lại (lần ${String(ev.next.user_reopen_count ?? 1)})\n${head}${info}\nGóp ý: ${fb || "-"}`;
      targets = await itTargets();
      toGroup = true;
    } else if (to === "pending_it") {
      text = `🛠 Phiếu chuyển Điện toán xử lý\n${head}${info}`;
      targets = await itTargets();
      toGroup = true;
    } else if (to === "completed") {
      text = `✅ Phiếu đã xử lý xong, chờ người báo xác nhận\n${head}\nNgười xử lý: ${itUser?.full_name ?? "-"}${ev.next.resolution_note ? `\nKết quả: ${String(ev.next.resolution_note).slice(0, 300)}` : ""}`;
      targets = who?.telegram_id ? [String(who.telegram_id)] : [];
      toGroup = true;
    } else if (to === "rejected") {
      text = `❌ Phiếu đã bị huỷ\n${head}${ev.next.reject_reason ? `\nLý do: ${String(ev.next.reject_reason).slice(0, 200)}` : ""}`;
      targets = who?.telegram_id ? [String(who.telegram_id)] : [];
      toGroup = true;
    }
    if (!text) continue;
    const ids = new Set(targets);
    if (toGroup && group) ids.add(group);
    await Promise.allSettled([...ids].map((id) => tgSend(id, text)));
  }
}

const TR_LABEL: Record<string, string> = { pending_confirm: "chờ LĐP phòng đích xác nhận", pending_approval: "chờ TCTH/Admin phê duyệt", pending_execute: "chờ thực hiện điều chuyển", completed: "đã hoàn thành", rejected: "đã bị từ chối" };

/** Thông báo Telegram khi lệnh điều chuyển được lập / đổi trạng thái. */
export async function notifyTransfers(events: RepairEvent[]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !events.length) return;
  const group = process.env.TG_GROUP_ID;
  for (const ev of events) {
    const to = String(ev.next.status ?? ""), from = ev.prev ? String(ev.prev.status ?? "") : "";
    if (ev.prev && to === from) continue;
    if (!TR_LABEL[to]) continue;
    const a = await one("assets", ev.next.asset_id);
    const d1 = await one("departments", ev.next.from_department_id), d2 = await one("departments", ev.next.to_department_id);
    const req = await one("users", ev.next.requested_by);
    const code = String(ev.next.ticket_code ?? ev.next.id);
    const text = `🔁 Lệnh điều chuyển ${TR_LABEL[to]}\n${code} · ${a ? `${a.code} ${a.name}` : "tài sản"}\nTừ: ${d1?.name ?? "-"} → Đến: ${d2?.name ?? "-"}\nNgười lập: ${req?.full_name ?? "-"}${ev.next.reason ? `\nLý do: ${String(ev.next.reason).slice(0, 200)}` : ""}${to === "rejected" && ev.next.reject_reason ? `\nLý do từ chối: ${String(ev.next.reject_reason).slice(0, 200)}` : ""}`;
    let targets: string[] = [];
    if (to === "pending_confirm") targets = await usersOfDept("manager", ev.next.to_department_id);
    else if (to === "pending_approval") targets = (await usersByRole(["tcth"])).map((u) => u.tg);
    else if (to === "pending_execute") targets = (await usersByRole(["admin"])).map((u) => u.tg);
    else if (req?.telegram_id) targets = [String(req.telegram_id)];
    const ids = new Set(targets);
    if (group) ids.add(group);
    await Promise.allSettled([...ids].map((id) => tgSend(id, text)));
  }
}
