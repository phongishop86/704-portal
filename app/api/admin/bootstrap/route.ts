import { db } from "@/lib/firebase";
import { hashPassword, safeEqual } from "@/lib/auth";
import { bumpRev, uid } from "@/lib/store";

/**
 * Tạo tài khoản admin đầu tiên cho một Firestore còn trống (hoặc khi mất quyền truy cập).
 *   POST /api/admin/bootstrap   Header: x-admin-key: <ADMIN_KEY>
 *   Body: { "username": "admin", "password": "...", "full_name": "Quản trị hệ thống" }
 * Nếu tên đăng nhập đã tồn tại: đặt lại mật khẩu và đảm bảo vai trò admin, đang hoạt động.
 */
export async function POST(req: Request) {
  if (!process.env.ADMIN_KEY || !safeEqual(req.headers.get("x-admin-key"), process.env.ADMIN_KEY)) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || password.length < 8) {
    return Response.json({ error: "Cần username và mật khẩu tối thiểu 8 ký tự." }, { status: 400 });
  }

  const existing = await db.collection("users").where("username", "==", username).limit(5).get();
  const found = existing.docs.find((d) => !d.data()._del);
  const id = found?.id ?? uid();
  const prev = found?.data() ?? {};
  await db.collection("users").doc(id).set({
    employee_code: "",
    department_id: null,
    ...prev,
    id,
    username,
    full_name: String(body?.full_name ?? prev.full_name ?? username),
    role: "admin",
    is_active: true,
    password_hash: await hashPassword(password),
    _u: Date.now(),
    _del: false,
  });
  await bumpRev();
  return Response.json({ ok: true, id, created: !found });
}
