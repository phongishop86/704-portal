import fs from "node:fs";
import { getSessionUser, json } from "@/lib/auth";
import { backupFile, isLocal, listBackups, makeBackup } from "@/lib/backup";

export const maxDuration = 60;

async function adminOnly(req: Request) {
  const u = await getSessionUser(req);
  return u && ["admin", "it"].includes(u.role) ? u : null;
}

/**
 * Sao lưu trên máy chủ (bản nội bộ DB_MODE=local). Chỉ admin/IT.
 *   GET  /api/admin/server-backup            → danh sách các bản sao lưu
 *   GET  /api/admin/server-backup?file=NAME  → tải một bản
 *   POST /api/admin/server-backup            → sao lưu ngay
 */
export async function GET(req: Request) {
  if (!(await adminOnly(req))) return json({ error: "Không có quyền." }, 403);
  if (!isLocal()) return json({ local: false, files: [] });
  const file = new URL(req.url).searchParams.get("file");
  if (file) {
    const p = backupFile(file);
    if (!p) return json({ error: "Không thấy bản sao lưu." }, 404);
    return new Response(fs.readFileSync(p), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${file}"` },
    });
  }
  return json({ local: true, hour: Number(process.env.BACKUP_HOUR ?? 2) || 0, files: listBackups() });
}

export async function POST(req: Request) {
  if (!(await adminOnly(req))) return json({ error: "Không có quyền." }, 403);
  if (!isLocal()) return json({ error: "Chỉ dùng cho bản máy chủ nội bộ." }, 400);
  try {
    const r = makeBackup("tay");
    return json({ ok: true, ...r, files: listBackups() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
