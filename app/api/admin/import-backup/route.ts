import { db } from "@/lib/firebase";
import { hashPassword, safeEqual } from "@/lib/auth";
import { assetKeywords, bumpRev, clientData, uid } from "@/lib/store";

export const maxDuration = 60;

const SIMPLE = ["departments", "categories", "assets", "assetHistory", "transfers", "repairs", "inventoryChecks", "inventoryLines", "worklogs", "locations", "accessories", "software"] as const;

type Rec = Record<string, unknown> & { id?: string };

/**
 * Nạp MỘT LẦN dữ liệu từ file Backup của 704-assets bản offline
 * (Admin → Sao lưu → "Tải file Backup (.json)").
 *   POST /api/admin/import-backup        Header: x-admin-key: <ADMIN_KEY>
 *   Body: nội dung file backup (hoặc { "backup": {...} })
 * - Ghi đè theo id; không xoá bản ghi có sẵn trên máy chủ.
 * - Mật khẩu dạng chữ trong backup cũ được băm trước khi lưu. Tài khoản không có mật khẩu thì
 *   giữ hash cũ (nếu đã có) hoặc chưa đăng nhập được cho tới khi admin đặt lại mật khẩu.
 */
export async function POST(req: Request) {
  if (!process.env.ADMIN_KEY || !safeEqual(req.headers.get("x-admin-key"), process.env.ADMIN_KEY)) {
    return new Response("forbidden", { status: 403 });
  }
  const raw = await req.json().catch(() => null);
  const backup = (raw?.backup ?? raw) as Record<string, unknown> | null;
  if (!backup || !Array.isArray(backup.users) || !Array.isArray(backup.assets)) {
    return Response.json({ error: "File không đúng chuẩn backup của 704-assets (thiếu users/assets)." }, { status: 400 });
  }

  const now = Date.now();
  const counts: Record<string, number> = {};
  const writes: { col: string; id: string; data: Record<string, unknown> }[] = [];

  for (const col of SIMPLE) {
    const rows = Array.isArray(backup[col]) ? (backup[col] as Rec[]) : [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const id = String(r.id ?? "").trim() || uid();
      const data = clientData(r);
      data.id = id;
      const extra = col === "assets" ? { _kw: assetKeywords(data) } : {};
      writes.push({ col, id, data: { ...data, ...extra, _u: now, _del: false } });
    }
    counts[col] = rows.length;
  }

  // templateConfig: mỗi khoá một document (mẫu biểu là chuỗi base64 có thể lớn)
  const tpl = (backup.templateConfig ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(tpl)) {
    if (!k || k.includes("/")) continue;
    writes.push({ col: "config", id: k, data: { id: k, value: v, _u: now, _del: false } });
  }
  counts.config = Object.keys(tpl).length;

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) batch.set(db.collection(w.col).doc(w.id), w.data);
    await batch.commit();
  }

  // Tài khoản: băm mật khẩu, giữ hash cũ nếu backup không có mật khẩu.
  let usersWithoutPassword = 0;
  for (const r of backup.users as Rec[]) {
    const id = String(r?.id ?? "").trim();
    if (!id) continue;
    const data = clientData(r);
    data.id = id;
    const prev = (await db.collection("users").doc(id).get()).data();
    let password_hash: string | undefined = prev?.password_hash;
    const pw = (r as Record<string, unknown>).password;
    if (typeof pw === "string" && pw) password_hash = await hashPassword(pw);
    delete data.password;
    if (!password_hash) usersWithoutPassword++;
    await db.collection("users").doc(id).set({ ...data, password_hash, _u: now, _del: false });
  }
  counts.users = (backup.users as Rec[]).length;
  await bumpRev();

  return Response.json({ ok: true, imported: counts, usersWithoutPassword });
}
