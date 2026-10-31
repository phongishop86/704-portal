/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./firebase";

/**
 * Thống kê truy cập: MỖI NGÀY MỘT tài liệu usage_daily/<yyyymmdd> (giờ Việt Nam) để tiết kiệm lượt ghi/đọc.
 *   { date, logins, fails, pv, hourly:{"0".."23"}, routes:{route:n}, devices:{mobile,desktop},
 *     users:{ uid:{ pv, mins, logins, last, route } }, events:[{t,u,name,ok,ip,ua}] (tối đa 200) }
 * Không lưu mật khẩu. IP/User-Agent chỉ dùng cho nhật ký đăng nhập của quản trị.
 */
const VN = 7 * 3600 * 1000;
export const dayId = (ms = Date.now()) => new Date(ms + VN).toISOString().slice(0, 10).replace(/-/g, "");
export const hourVN = (ms = Date.now()) => new Date(ms + VN).getUTCHours();
const EVENT_MAX = 200;
const safeKey = (s: string) => String(s || "").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40) || "x";

export const deviceOf = (ua: string) => (/mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop");
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim().slice(0, 64);

async function mutate(fn: (d: any) => void, ms = Date.now()) {
  const ref = db.collection("usage_daily").doc(dayId(ms));
  await db.runTransaction(async (tx: any) => {
    const s = await tx.get(ref);
    const d: any = s.exists ? s.data() : { date: dayId(ms), logins: 0, fails: 0, pv: 0, hourly: {}, routes: {}, devices: {}, users: {}, events: [] };
    fn(d);
    tx.set(ref, d);
  });
}

export async function recordLogin(req: Request, opts: { userId?: string; username: string; ok: boolean }): Promise<void> {
  try {
    const ua = req.headers.get("user-agent") || "";
    const ms = Date.now();
    await mutate((d) => {
      if (opts.ok) {
        d.logins = (d.logins || 0) + 1;
        if (opts.userId) {
          const u = (d.users[opts.userId] ??= { pv: 0, mins: 0, logins: 0 });
          u.logins = (u.logins || 0) + 1;
          u.last = ms;
        }
      } else d.fails = (d.fails || 0) + 1;
      d.devices[deviceOf(ua)] = (d.devices[deviceOf(ua)] || 0) + 1;
      d.events = [{ t: ms, u: opts.userId || null, name: String(opts.username).slice(0, 60), ok: opts.ok, ip: clientIp(req), ua: ua.slice(0, 120) }, ...(d.events || [])].slice(0, EVENT_MAX);
    }, ms);
  } catch (e) {
    console.error("Ghi nhật ký đăng nhập lỗi (không ảnh hưởng đăng nhập):", e);
  }
}

/** Client gửi gộp: các màn hình đã xem từ lần gửi trước + nhịp "đang dùng" (mỗi ~3 phút khi tab đang mở). */
export async function recordActivity(userId: string, input: { routes?: Record<string, number>; ping?: boolean; route?: string }): Promise<void> {
  const ms = Date.now();
  const routes = input.routes && typeof input.routes === "object" ? Object.entries(input.routes).slice(0, 30) : [];
  await mutate((d) => {
    const u = (d.users[userId] ??= { pv: 0, mins: 0, logins: 0 });
    let n = 0;
    for (const [r, c] of routes) {
      const k = safeKey(r), add = Math.max(0, Math.min(50, Number(c) || 0));
      if (!add) continue;
      d.routes[k] = (d.routes[k] || 0) + add;
      n += add;
    }
    if (n) {
      d.pv = (d.pv || 0) + n;
      u.pv = (u.pv || 0) + n;
      const h = String(hourVN(ms));
      d.hourly[h] = (d.hourly[h] || 0) + n;
    }
    if (input.ping) u.mins = (u.mins || 0) + 3;
    u.last = ms;
    if (input.route) u.route = safeKey(input.route);
  }, ms);
}

export async function readUsage(days: number): Promise<any[]> {
  const n = Math.max(1, Math.min(90, days));
  const refs = Array.from({ length: n }, (_, i) => db.collection("usage_daily").doc(dayId(Date.now() - i * 86400000)));
  const snaps = await db.getAll(...refs);
  return snaps.filter((s: any) => s.exists).map((s: any) => s.data()).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
}
