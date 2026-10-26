import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db } from "./firebase";

const SESSION_TTL_MS = 12 * 3600 * 1000;
const COOKIE = "sid";

/* ---------- Băm mật khẩu (scrypt) ---------- */

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  // Luôn tốn thời gian băm như nhau kể cả khi không có hash, tránh lộ tài khoản có tồn tại hay không.
  const parts = (stored ?? "").split("$");
  const valid = parts.length === 3 && parts[0] === "scrypt";
  const salt = Buffer.from(valid ? parts[1] : "AAAAAAAAAAAAAAAAAAAAAA==", "base64");
  const expected = Buffer.from(valid ? parts[2] : "", "base64");
  const key = await scryptAsync(password, salt);
  return valid && expected.length === key.length && timingSafeEqual(key, expected);
}

/* ---------- Phiên đăng nhập (cookie ký HMAC) ---------- */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Thiếu SESSION_SECRET (tối thiểu 16 ký tự)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeSessionCookie(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + SESSION_TTL_MS })).toString("base64url");
  const secure = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export interface SessionUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  department_id: string | null;
}

/** Trả về tài khoản đang đăng nhập (đọc lại từ Firestore để thu hồi quyền có hiệu lực ngay), hoặc null. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!m) return null;
  const token = m.slice(COOKIE.length + 1);
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data: { u?: string; e?: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data.u || !data.e || data.e < Date.now()) return null;

  const snap = await db.collection("users").doc(data.u).get();
  const u = snap.data();
  if (!snap.exists || !u || u._del || u.is_active === false) return null;
  return {
    id: snap.id,
    username: String(u.username ?? ""),
    full_name: String(u.full_name ?? ""),
    role: String(u.role ?? "user"),
    department_id: (u.department_id as string | null) ?? null,
  };
}

/* ---------- Chống dò mật khẩu ---------- */

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attemptRef = (username: string) =>
  db.collection("loginAttempts").doc(encodeURIComponent(username.toLowerCase()).slice(0, 200));

export async function isLockedOut(username: string): Promise<boolean> {
  const d = (await attemptRef(username).get()).data();
  return !!d && d.n >= MAX_FAILS && Date.now() - d.first < WINDOW_MS;
}

export async function recordFailure(username: string): Promise<void> {
  const ref = attemptRef(username);
  const d = (await ref.get()).data();
  const now = Date.now();
  if (!d || now - d.first >= WINDOW_MS) await ref.set({ n: 1, first: now });
  else await ref.set({ n: d.n + 1, first: d.first });
}

export async function clearFailures(username: string): Promise<void> {
  await attemptRef(username).delete().catch(() => undefined);
}

/* ---------- So sánh khoá bí mật (không lộ độ dài / vị trí khác biệt qua thời gian phản hồi) ---------- */

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/* ---------- Tiện ích route ---------- */

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
