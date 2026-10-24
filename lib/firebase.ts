import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Chỉ chạy phía server. Khóa service account lấy từ biến môi trường Vercel.
const existing = getApps().length > 0;
const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
    }),
  });

export const db = getFirestore(app);

// settings() chỉ được gọi một lần trước khi dùng Firestore; bỏ qua nếu đã gọi (hot reload).
if (!existing) {
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* đã cấu hình */
  }
}

/** Mốc 00:00 hôm nay theo giờ Việt Nam (UTC+7), tính bằng mili giây UTC. */
export function startOfTodayVN(): number {
  const DAY = 24 * 3600 * 1000;
  const OFFSET = 7 * 3600 * 1000;
  return Math.floor((Date.now() + OFFSET) / DAY) * DAY - OFFSET;
}
