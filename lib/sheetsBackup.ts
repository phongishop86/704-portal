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

  const getMeta = () => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,gridProperties)" });
  let meta = await getMeta();
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const cols = COLS.filter((c) => !SKIP_COLS.has(c));
  const tabs = [...cols.map((c) => "BK_" + c), "BK_info"];
  const add = tabs.filter((t) => !have.has(t));
  if (add.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: add.map((title) => ({ addSheet: { properties: { title } } })) } });
    meta = await getMeta();
  }
  const props = new Map((meta.data.sheets ?? []).map((s) => [s.properties?.title as string, s.properties]));
  /** Mở rộng lưới của tab nếu thiếu dòng/cột (tab mới chỉ có 1000 dòng × 26 cột). */
  const ensureGrid = async (tab: string, rows: number, colsN: number) => {
    const p = props.get(tab), gp = p?.gridProperties;
    const needR = Math.max(rows + 1, 2), needC = Math.max(colsN, 1);
    if (!p || (gp?.rowCount ?? 0) >= needR && (gp?.columnCount ?? 0) >= needC) return;
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: {
      properties: { sheetId: p.sheetId, gridProperties: { rowCount: Math.max(gp?.rowCount ?? 0, needR), columnCount: Math.max(gp?.columnCount ?? 0, needC) } },
      fields: "gridProperties.rowCount,gridProperties.columnCount" } }] } });
  };

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
    const values = [keys, ...rows.map((r) => keys.map((k) => cell((r as any)[k])))];
    await ensureGrid(tab, values.length, keys.length);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: tab });
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
  await ensureGrid("BK_info", counts ? Object.keys(counts).length + 6 : 8, 3);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "BK_info" });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "BK_info!A1",
    valueInputOption: "RAW",
    requestBody: { values: [["Thời điểm sao lưu (UTC)", "Người thực hiện", "Ghi chú"], [at, by, "Bản sao một chiều từ hệ thống; sửa trong Sheet không ảnh hưởng dữ liệu."], [], ["Bảng", "Số bản ghi"], ...Object.entries(counts)] },
  });
  await db.collection("counters").doc("backup_sheets").set({ at, by, counts, ok: true });
  return { counts, at };
}
