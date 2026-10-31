import { db, LOCAL_MODE } from "@/lib/firebase";
import { getSessionUser, json, safeEqual } from "@/lib/auth";
import { backupConfigured, backupToSheets } from "@/lib/sheetsBackup";

export const maxDuration = 300;

const ROLES = ["admin", "it"];

/**
 * GET  /api/admin/backup-sheets            (admin/it đăng nhập)  → trạng thái lần sao lưu gần nhất
 * GET  /api/admin/backup-sheets  + Authorization: Bearer CRON_SECRET → chạy sao lưu định kỳ (Vercel Cron)
 * POST /api/admin/backup-sheets            (admin/it đăng nhập)  → sao lưu ngay
 */
async function status() {
  const s = await db.collection("counters").doc("backup_sheets").get();
  const sheetId = process.env.BACKUP_SHEET_ID || process.env.SHEET_ID || "";
  const missing = [!process.env.GOOGLE_CLIENT_EMAIL && "GOOGLE_CLIENT_EMAIL", !process.env.GOOGLE_PRIVATE_KEY && "GOOGLE_PRIVATE_KEY", !sheetId && "BACKUP_SHEET_ID"].filter(Boolean);
  return {
    configured: backupConfigured() && !LOCAL_MODE,
    local: LOCAL_MODE,
    missing,
    email: process.env.GOOGLE_CLIENT_EMAIL || "",
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : "",
    last: s.exists ? s.data() : null,
  };
}

export async function GET(req: Request) {
  const bearer = req.headers.get("authorization");
  if (process.env.CRON_SECRET && bearer && safeEqual(bearer, `Bearer ${process.env.CRON_SECRET}`)) {
    if (LOCAL_MODE || !backupConfigured()) return json({ ok: true, skipped: "chưa cấu hình" });
    try {
      return json({ ok: true, ...(await backupToSheets("lịch định kỳ")) });
    } catch (e) {
      await db.collection("counters").doc("backup_sheets").set({ at: new Date().toISOString(), by: "lịch định kỳ", ok: false, error: String((e as Error).message).slice(0, 300) });
      return json({ ok: false, error: "Sao lưu lỗi." }, 500);
    }
  }
  const user = await getSessionUser(req);
  if (!user || !ROLES.includes(user.role)) return json({ error: "Không có quyền." }, 403);
  return json(await status());
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user || !ROLES.includes(user.role)) return json({ error: "Không có quyền." }, 403);
  if (LOCAL_MODE) return json({ error: "Bản chạy nội bộ không dùng Google Sheet. Dùng Sao lưu (.json) hoặc thư mục data." }, 400);
  if (!backupConfigured()) return json({ error: "Chưa cấu hình Google Sheet (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BACKUP_SHEET_ID)." }, 400);
  try {
    return json({ ok: true, ...(await backupToSheets(user.full_name || user.username)) });
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 300);
    await db.collection("counters").doc("backup_sheets").set({ at: new Date().toISOString(), by: user.username, ok: false, error: msg });
    return json({ error: "Sao lưu lỗi: " + msg }, 500);
  }
}
