import { db } from "@/lib/firebase";
import { safeEqual } from "@/lib/auth";
import { tgSend } from "@/lib/channels/telegram";

export const maxDuration = 60;

/**
 * Vercel Cron gọi mỗi sáng (01:00 UTC = 08:00 giờ VN). Vercel tự gửi Authorization: Bearer CRON_SECRET.
 * Nhắc các phiếu báo hỏng đang ở bước "Điện toán xử lý"; quá SLA_HOURS (mặc định 24 giờ, tính từ lúc
 * TCTH điều phối) thì đánh dấu quá hạn.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("authorization"), `Bearer ${process.env.CRON_SECRET}`)) {
    return new Response("forbidden", { status: 403 });
  }
  const groupId = process.env.TG_GROUP_ID;
  if (!groupId) return Response.json({ ok: true, skipped: "no TG_GROUP_ID" });

  const slaMs = (Number(process.env.SLA_HOURS) || 24) * 3600 * 1000;
  const snap = await db.collection("repairs").where("status", "==", "pending_it").get();
  const open: Record<string, any>[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>)).filter((r) => !r._del);
  if (!open.length) return Response.json({ ok: true, open: 0 });

  const now = Date.now();
  const since = (r: Record<string, any>) => Date.parse(r.tcth_at || r.created_at || "") || now;
  const overdue = open.filter((r) => now - since(r) > slaMs);

  const assets = await db.getAll(...open.slice(0, 15).map((r) => db.collection("assets").doc(r.asset_id)));
  const lines = open.slice(0, 15).map((r, i) => {
    const late = now - since(r) > slaMs ? " ⏰ quá hạn" : "";
    return `• ${r.ticket_code ?? r.id} · ${assets[i].data()?.code ?? "?"} · ${r.description ?? ""}${late}`;
  });
  await tgSend(
    groupId,
    `Nhắc việc sáng nay: ${open.length} phiếu chờ Điện toán xử lý${overdue.length ? `, ${overdue.length} quá hạn` : ""}.\n${lines.join("\n")}`,
  );
  return Response.json({ ok: true, open: open.length, overdue: overdue.length });
}
