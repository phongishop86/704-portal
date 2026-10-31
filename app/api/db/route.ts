import { db } from "@/lib/firebase";
import { getSessionUser, json } from "@/lib/auth";
import { isCol, publicData, readRev } from "@/lib/store";

/** Khóa bản quyền phần mềm chỉ gửi cho nhóm được phép xem. */
const LICENSE_ROLES = ["admin", "tcth", "it"];

/** Vai trò thấp chỉ thấy các trường danh bạ cần thiết của tài khoản khác (không lộ Telegram ID, v.v.). */
const USER_PUBLIC = ["id", "username", "full_name", "role", "department_id", "position", "active", "locked"];

/** Nhân viên (role user) chỉ nhận tài sản/phiếu của phòng mình hoặc do mình lập/được giao. */
function visibleToUser(col: string, d: Record<string, unknown>, u: { id: string; department_id: string | null }): boolean {
  const dep = String(u.department_id ?? "");
  if (col === "assets") return (dep !== "" && String(d.department_id) === dep) || d.current_user_id === u.id;
  if (col === "repairs") return d.reported_by === u.id;
  if (col === "transfers") return d.requested_by === u.id;
  return true;
}

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
  let lastDoc: string | null = null;
  for (const d of snap.docs) {
    const data = d.data();
    let pub = data._del ? null : publicData(data);
    if (pub && col === "users" && !["admin", "tcth"].includes(user.role) && d.id !== user.id) {
      pub = Object.fromEntries(Object.entries(pub).filter(([k]) => USER_PUBLIC.includes(k)));
    }
    if (pub && user.role === "user" && !visibleToUser(col, pub, user)) {
      lastDoc = d.id;
      continue;
    }
    if (pub && col === "software" && !LICENSE_ROLES.includes(user.role)) delete pub.license_key;
    const item = data._del ? { id: d.id, deleted: true } : { id: d.id, data: pub as Record<string, unknown> };
    const n = Buffer.byteLength(JSON.stringify(item));
    if (items.length > 0 && bytes + n > MAX_PAGE_BYTES) {
      truncated = true;
      break;
    }
    items.push(item);
    lastDoc = d.id;
    bytes += n;
  }
  const next = truncated || snap.size === limit ? lastDoc : null;
  return json({ now, items, next });
}
