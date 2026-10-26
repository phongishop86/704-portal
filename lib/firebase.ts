import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { localDb } from "@/lib/localdb";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Chế độ dữ liệu:
//   DB_MODE=local (hoặc không có FIREBASE_PROJECT_ID) → file JSON trong DATA_DIR (bản nội bộ Windows Server)
//   còn lại → Firestore qua service account (bản Vercel/Firebase)
export const LOCAL_MODE = process.env.DB_MODE === "local" || !process.env.FIREBASE_PROJECT_ID;

function makeFirestore(): any {
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
  const d = getFirestore(app);
  // settings() chỉ được gọi một lần trước khi dùng Firestore; bỏ qua nếu đã gọi (hot reload).
  if (!existing) {
    try {
      d.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* đã cấu hình */
    }
  }
  return d;
}

export const db: ReturnType<typeof getFirestore> = (LOCAL_MODE ? (localDb as any) : makeFirestore()) as any;

/** Mốc 00:00 hôm nay theo giờ Việt Nam (UTC+7), tính bằng mili giây UTC. */
export function startOfTodayVN(): number {
  const DAY = 24 * 3600 * 1000;
  const OFFSET = 7 * 3600 * 1000;
  return Math.floor((Date.now() + OFFSET) / DAY) * DAY - OFFSET;
}
