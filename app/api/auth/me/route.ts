import { getSessionUser, json } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  return json({ ok: true, user });
}
