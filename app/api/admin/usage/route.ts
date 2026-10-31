import { getSessionUser, json } from "@/lib/auth";
import { readUsage } from "@/lib/usage";

/** GET /api/admin/usage?days=30 — thống kê truy cập theo ngày (chỉ admin). */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "admin") return json({ error: "Không có quyền." }, 403);
  const days = Number(new URL(req.url).searchParams.get("days")) || 30;
  return json({ days: await readUsage(days) });
}
