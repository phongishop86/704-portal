import { google } from "googleapis";

/**
 * Bản chiếu báo cáo: mỗi nhật ký được append 1 dòng vào tab WorkLog.
 * Firestore là nguồn sự thật; Sheet chỉ để xem/lọc. Thiếu cấu hình thì bỏ qua.
 */
export async function mirrorWorkLog(row: (string | number)[]): Promise<void> {
  const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID } = process.env;
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !SHEET_ID) return;

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "WorkLog!A:K",
    // RAW = văn bản thuần: chống chèn công thức (=HYPERLINK(...)) từ nội dung IT gõ
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}
