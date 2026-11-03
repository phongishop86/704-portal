import fs from "node:fs";
import path from "node:path";
import { __localDbFlush } from "@/lib/localdb";

/** Sao lưu cho bản máy chủ nội bộ (DB_MODE=local): chép data.json vào DATA_DIR/backups, giữ KEEP bản. */
const KEEP = 30;
const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
const backupDir = () => path.join(dataDir(), "backups");
const NAME = /^data-\d{8}-\d{4,6}(-[a-z]+)?\.json$/;

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

export const isLocal = () => process.env.DB_MODE === "local";

export function makeBackup(kind: "auto" | "tay" = "tay"): { name: string; size: number } {
  __localDbFlush();
  const src = path.join(dataDir(), "data.json");
  if (!fs.existsSync(src)) throw new Error("Chưa có dữ liệu để sao lưu.");
  fs.mkdirSync(backupDir(), { recursive: true });
  // tên có hậu tố -auto / -tay để phân biệt; hai lần trong cùng một phút sẽ ghi đè nhau
  const name = `data-${stamp()}${kind === "auto" ? "-auto" : "-tay"}.json`;
  fs.copyFileSync(src, path.join(backupDir(), name));
  // dọn bớt: giữ KEEP bản mới nhất
  // (không bao giờ xóa bản vừa tạo, và không đụng tới các bản "truoc-khi-xoa-...")
  const all = listBackups().filter((f) => f.name.startsWith("data-"));
  for (const f of all.slice(KEEP)) if (f.name !== name) fs.rmSync(path.join(backupDir(), f.name), { force: true });
  return { name, size: fs.statSync(path.join(backupDir(), name)).size };
}

export function listBackups(): { name: string; size: number; time: number }[] {
  if (!fs.existsSync(backupDir())) return [];
  return fs.readdirSync(backupDir())
    .filter((f) => NAME.test(f) || /^data-\d{8}-\d{4}\.json$/.test(f) || /^truoc-khi-xoa-.*\.json$/.test(f))
    .map((f) => { const s = fs.statSync(path.join(backupDir(), f)); return { name: f, size: s.size, time: s.mtimeMs }; })
    .sort((a, b) => b.time - a.time);
}

/** Đường dẫn an toàn tới một file sao lưu (chặn ../). */
export function backupFile(name: string): string | null {
  if (!listBackups().some((f) => f.name === name)) return null;
  return path.join(backupDir(), name);
}

/** Hẹn giờ sao lưu hằng ngày trong chính ứng dụng (mặc định 02:00, đổi bằng BACKUP_HOUR). */
let started = false;
export function startDailyBackup() {
  if (started || !isLocal()) return;
  started = true;
  const hour = Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR ?? 2) || 0));
  const schedule = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const t = setTimeout(() => {
      try { const r = makeBackup("auto"); console.log("Đã sao lưu tự động:", r.name); } catch (e) { console.error("Sao lưu tự động lỗi:", (e as Error).message); }
      schedule();
    }, next.getTime() - now.getTime());
    t.unref?.();
  };
  schedule();
}
