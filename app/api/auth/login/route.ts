import { db } from "@/lib/firebase";
import {
  clearFailures,
  isLockedOut,
  json,
  makeSessionCookie,
  recordFailure,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || !password) return json({ error: "Thiếu tên đăng nhập hoặc mật khẩu." }, 400);

  if (await isLockedOut(username)) {
    return json({ error: "Đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút." }, 429);
  }

  const snap = await db.collection("users").where("username", "==", username).limit(5).get();
  const doc = snap.docs.find((d) => !d.data()._del);
  const u = doc?.data();

  const ok = await verifyPassword(password, u?.password_hash);
  if (!doc || !u || !ok || u.is_active === false) {
    await recordFailure(username);
    return json({ error: "Sai tên đăng nhập hoặc mật khẩu." }, 401);
  }

  await clearFailures(username);
  return json(
    { ok: true, user: { id: doc.id, username: u.username, full_name: u.full_name, role: u.role } },
    200,
    { "Set-Cookie": makeSessionCookie(doc.id) },
  );
}
