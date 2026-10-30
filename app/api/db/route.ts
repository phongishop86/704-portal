import { db } from "@/lib/firebase";
import { getSessionUser, json } from "@/lib/auth";
import { isCol, publicData, readRev } from "@/lib/store";

/** Khóa bản quyền phần mềm chỉ gửi cho nhóm được phép xem. */
const LICENSE_ROLES = ["admin", "tcth", "it"];

export const maxDuration = 60;

const MAX_PAGE_BYTES = 3_000_000;

/**
 * GET /api/db  → { now, rev }  (kiểm tra có thay đổi mới không)
 * Lấy thay đổi theo từng bảng, có phân trang (Vercel giới hạn ~4.5MB mỗi phản hồi).
 *   GET /api/db?col=assets&since=0&after=<docId>&limit=800
 * since=0 là tải đầy đủ. Phản hồi: { now, items: [{id, deleted?, data?}], next }
 * `now` lấy TRƯỚC khi đọc dữ liệu: client dùng nó làm mốc `since` cho lần thăm dò sau.
 */
export async function GET(req: Request) {
  const now = Date.now();
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);

  const url = new URL(req.url);
  const col = url.searchParams.get("col");
  // Không có `col`: chỉ trả số rev hiện tại (thăm dò rẻ, 1 lượt đọc).
  if (col === null) return json({ now, rev: await readRev() });
  if (!isCol(col)) return json({ error: "Bảng không hợp lệ." }, 400);
  const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
  const limit = Math.min(1500, Math.max(1, Number(url.searchParams.get("limit")) || 800));
  const after = url.searchParams.get("after");

  let q = db.collection(col).where("_u", ">", since).orderBy("_u").limit(limit);
  if (after) {
    const cursor = await db.collection(col).doc(after).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const snap = await q.get();

  // Vercel giới hạn phản hồi ~4,5MB: dừng khi trang đạt ~3MB (luôn trả ít nhất 1 bản ghi để chắc chắn có tiến triển).
  const items: { id: string; deleted?: boolean; data?: Record<string, unknown> }[] = [];
  let bytes = 0;
  let truncated = false;
  for (const d of snap.docs) {
    const data = d.data();
    const pub = data._del ? null : publicData(data);
    if (pub && col === "software" && !LICENSE_ROLES.includes(user.role)) delete pub.license_key;
    const item = data._del ? { id: d.id, deleted: true } : { id: d.id, data: pub as Record<string, unknown> };
    const n = Buffer.byteLength(JSON.stringify(item));
    if (items.length > 0 && bytes + n > MAX_PAGE_BYTES) {
      truncated = true;
      break;
    }
    items.push(item);
    bytes += n;
  }
  const next = truncated || snap.size === limit ? items[items.length - 1].id : null;
  return json({ now, items, next });
}
