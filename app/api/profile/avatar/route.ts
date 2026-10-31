import { db } from "@/lib/firebase";
import { getSessionUser, json } from "@/lib/auth";

/**
 * Ảnh đại diện của chính người dùng. Lưu riêng ở collection "avatars" (không nằm trong dữ liệu đồng bộ
 * chung) nên không làm nặng mỗi lần tải dữ liệu và không cần quyền ghi bảng users.
 * GET  → { data: "data:image/jpeg;base64,..." | null }
 * POST { data } → lưu (JPEG/PNG/WebP, tối đa ~60 KB); POST { data: null } → xóa
 */
const MAX = 60_000;
const OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  const s = await db.collection("avatars").doc(user.id).get();
  return json({ data: s.exists ? (s.data()?.data ?? null) : null });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  const body = (await req.json().catch(() => ({}))) as { data?: unknown };
  if (body.data === null) {
    await db.collection("avatars").doc(user.id).delete();
    return json({ ok: true });
  }
  if (typeof body.data !== "string" || body.data.length > MAX || !OK.test(body.data)) return json({ error: "Ảnh không hợp lệ hoặc quá lớn." }, 400);
  await db.collection("avatars").doc(user.id).set({ data: body.data, at: Date.now() });
  return json({ ok: true });
}
