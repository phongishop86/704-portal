import { db, LOCAL_MODE } from "@/lib/firebase";
import { getSessionUser, json, verifyPassword } from "@/lib/auth";
import { readRev } from "@/lib/store";
import { backupConfigured } from "@/lib/sheetsBackup";

export const maxDuration = 30;

const DEFAULT_ADMIN_PASSWORD = "A@123456";

/** GET /api/admin/monitor — tình trạng hệ thống (admin, IT). Không đọc cả bảng: số liệu tài sản/người dùng lấy từ bản sao ở trình duyệt. */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user || !["admin", "it"].includes(user.role)) return json({ error: "Không có quyền." }, 403);

  const t0 = Date.now();
  const rev = await readRev();
  const dbMs = Date.now() - t0;

  const backup = (await db.collection("counters").doc("backup_sheets").get()).data() ?? null;

  let telegram: Record<string, unknown> | null = null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(5000) });
      const j: any = await r.json();
      telegram = { ok: !!j.ok, url_set: !!j.result?.url, pending: j.result?.pending_update_count ?? 0, last_error: j.result?.last_error_message ?? null, last_error_at: j.result?.last_error_date ? j.result.last_error_date * 1000 : null };
    } catch {
      telegram = { ok: false, error: "Không gọi được Telegram" };
    }
  }

  // Cảnh báo bảo mật: tài khoản admin còn dùng mật khẩu mặc định
  let defaultPassword = false;
  if (user.role === "admin") {
    const snap = await db.collection("users").where("username", "==", "admin").limit(3).get();
    for (const d of snap.docs) if (!d.data()._del && (await verifyPassword(DEFAULT_ADMIN_PASSWORD, d.data().password_hash))) defaultPassword = true;
  }

  return json({
    now: Date.now(),
    mode: LOCAL_MODE ? "local" : "firestore",
    db_ms: dbMs,
    rev,
    uptime_s: Math.round(process.uptime()),
    node: process.version,
    memory_mb: Math.round(process.memoryUsage().rss / 1048576),
    config: {
      telegram: !!token,
      ai: !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY),
      sheets: backupConfigured(),
      cron_secret: !!process.env.CRON_SECRET,
    },
    backup,
    telegram,
    security: { default_admin_password: defaultPassword },
  });
}
