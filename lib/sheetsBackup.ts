/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import { db } from "@/lib/firebase";
import { COLS, publicData } from "@/lib/store";

/**
 * Sao lưu một chiều: mỗi bảng dữ liệu ra một tab "BK_<tên bảng>" trong Google Sheet.
 * Firestore vẫn là nguồn sự thật; Sheet là bản lưu để xem/đối chiếu/khôi phục thủ công.
 * - Ghi dạng văn bản thuần (RAW) nên không chèn được công thức.
 * - Không xuất mật khẩu (password_hash), khóa bản quyền phần mềm (license_key).
 */
const SKIP_COLS = new Set(["config"]);
const SENSITIVE = new Set(["password", "password_hash", "license_key"]);
const CELL_MAX = 45000;
const CHUNK = 1500;

export const backupConfigured = () => {
  const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  return !!(GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && (process.env.BACKUP_SHEET_ID || process.env.SHEET_ID));
};

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > CELL_MAX ? s.slice(0, CELL_MAX) : s;
};

export async function backupToSheets(by: string): Promise<{ counts: Record<string, number>; at: string }> {
  const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  const spreadsheetId = process.env.BACKUP_SHEET_ID || process.env.SHEET_ID;
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !spreadsheetId) throw new Error("Chưa cấu hình GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY / BACKUP_SHEET_ID.");
  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const cols = COLS.filter((c) => !SKIP_COLS.has(c));
  const tabs = [...cols.map((c) => "BK_" + c), "BK_info"];
  const add = tabs.filter((t) => !have.has(t));
  if (add.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: add.map((title) => ({ addSheet: { properties: { title } } })) } });
  }

  const counts: Record<string, number> = {};
  for (const c of cols) {
    const snap = await db.collection(c).get();
    const rows = snap.docs
      .map((d: any) => ({ id: d.id, ...publicData(d.data()) }) as Record<string, unknown> & { _del?: boolean })
      .filter((r) => !r._del)
      .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SENSITIVE.has(k))));
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort((a, b) => (a === "id" ? -1 : b === "id" ? 1 : a.localeCompare(b)));
    counts[c] = rows.length;
    const tab = "BK_" + c;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:ZZ` });
    const values = [keys, ...rows.map((r) => keys.map((k) => cell((r as any)[k])))];
    for (let i = 0; i < values.length; i += CHUNK) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: keys.length ? values.slice(i, i + CHUNK) : [["(trống)"]] },
      });
    }
  }
  const at = new Date().toISOString();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "BK_info!A:C" });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "BK_info!A1",
    valueInputOption: "RAW",
    requestBody: { values: [["Thời điểm sao lưu (UTC)", "Người thực hiện", "Ghi chú"], [at, by, "Bản sao một chiều từ hệ thống; sửa trong Sheet không ảnh hưởng dữ liệu."], [], ["Bảng", "Số bản ghi"], ...Object.entries(counts)] },
  });
  await db.collection("counters").doc("backup_sheets").set({ at, by, counts, ok: true });
  return { counts, at };
}
