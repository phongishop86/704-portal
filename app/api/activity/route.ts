import { getSessionUser, json } from "@/lib/auth";
import { recordActivity } from "@/lib/usage";

/** Client gửi gộp lượt xem màn hình + nhịp hoạt động (sendBeacon gửi text/plain nên tự parse JSON). */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  const body = JSON.parse((await req.text().catch(() => "")) || "{}");
  await recordActivity(user.id, { routes: body.routes, ping: !!body.ping, route: typeof body.route === "string" ? body.route : undefined });
  return json({ ok: true });
}
