import { db, LOCAL_MODE } from "@/lib/firebase";

/** Kiểm tra sống cho công cụ giám sát (Uptime Kuma, Zabbix…). Không lộ dữ liệu; kết quả nhớ 30 giây để không tốn lượt đọc. */
let cache: { at: number; body: object; status: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < 30_000) return new Response(JSON.stringify(cache.body), { status: cache.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  let body: object, status = 200;
  try {
    const t0 = Date.now();
    await db.collection("counters").doc("health").get();
    body = { ok: true, db: LOCAL_MODE ? "local" : "firestore", db_ms: Date.now() - t0, ts: new Date(now).toISOString() };
  } catch {
    body = { ok: false, error: "db", ts: new Date(now).toISOString() };
    status = 503;
  }
  cache = { at: now, body, status };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
