import { createHmac, timingSafeEqual } from "node:crypto";
import type { DirProfile } from "@/lib/ldap-user";

/**
 * Đăng nhập một lần (SSO) từ Portal — Portal đã xác thực AD, trang con không hỏi lại.
 * Cấu hình (.env):
 *   SSO_SECRET        khóa dùng chung với Portal (>= 32 ký tự ngẫu nhiên) — Portal ký JWT HS256 bằng khóa này
 *   SSO_ISSUER        (tùy chọn) giá trị claim "iss" bắt buộc, ví dụ "icbv-portal"
 *   SSO_MAX_AGE_S     tuổi tối đa của token tính từ lúc phát hành (mặc định 120 giây)
 *   SSO_PROXY_SECRET  (tùy chọn) bật chế độ header: proxy/IIS đã xác thực rồi gắn header; khóa này chứng minh header đến từ proxy tin cậy
 *   SSO_HDR_USER / SSO_HDR_GROUPS / SSO_HDR_NAME / SSO_HDR_MAIL / SSO_HDR_DEPT   tên header (mặc định X-Remote-User, X-Remote-Groups, X-Remote-Name, X-Remote-Mail, X-Remote-Dept)
 * Token JWT (HS256) của Portal: sub=tên đăng nhập AD, name, email, department, groups=[tên/DN nhóm], iat, exp, (jti).
 */
export const ssoTokenEnabled = () => (process.env.SSO_SECRET ?? "").length >= 32;
export const ssoHeaderEnabled = () => (process.env.SSO_PROXY_SECRET ?? "").length >= 16;

const b64 = (s: string) => Buffer.from(s, "base64url");
const seen = new Map<string, number>(); // jti -> hạn (chống dùng lại token)

export interface SsoClaims { username: string; prof: DirProfile }

/** Trả claims nếu token hợp lệ; ném Error với lý do (không lộ cho người dùng cuối) nếu không. */
export function verifySsoToken(token: string, now = Date.now()): SsoClaims {
  const secret = process.env.SSO_SECRET ?? "";
  if (secret.length < 32) throw new Error("SSO chưa cấu hình");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("định dạng token");
  let header: any, p: any;
  try { header = JSON.parse(b64(parts[0]).toString("utf8")); p = JSON.parse(b64(parts[1]).toString("utf8")); } catch { throw new Error("token hỏng"); }
  if (header?.alg !== "HS256") throw new Error("thuật toán không được phép"); // chặn alg=none / RS256 đánh lừa
  const expect = createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest();
  const got = b64(parts[2]);
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) throw new Error("sai chữ ký");
  const nowS = Math.floor(now / 1000), maxAge = Number(process.env.SSO_MAX_AGE_S) || 120;
  if (typeof p.exp !== "number" || p.exp + 5 < nowS) throw new Error("token hết hạn");
  if (typeof p.iat !== "number" || p.iat - 30 > nowS) throw new Error("token từ tương lai");
  if (nowS - p.iat > maxAge) throw new Error("token quá cũ");
  if (process.env.SSO_ISSUER && p.iss !== process.env.SSO_ISSUER) throw new Error("sai iss");
  if (p.jti) {
    for (const [k, v] of seen) if (v < now) seen.delete(k);
    if (seen.has(String(p.jti))) throw new Error("token đã dùng");
    seen.set(String(p.jti), now + (maxAge + 60) * 1000);
  }
  const username = normalizeSso(String(p.sub ?? p.preferred_username ?? ""));
  if (!username) throw new Error("thiếu sub");
  return { username, prof: toProfile(p.name, p.email ?? p.mail, p.department, p.groups) };
}

/** "ICBV\\an", "an@icbv.com" -> "an"; chỉ ký tự an toàn. */
export function normalizeSso(input: string): string | null {
  let u = input.trim();
  if (u.includes("\\")) u = u.split("\\").pop()!;
  if (u.includes("@")) u = u.split("@")[0];
  return /^[A-Za-z0-9._-]{1,64}$/.test(u) ? u : null;
}

function toProfile(name: unknown, mail: unknown, dept: unknown, groups: unknown): DirProfile {
  const g = Array.isArray(groups) ? groups.map(String) : typeof groups === "string" ? groups.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [];
  return { displayName: String(name ?? ""), mail: String(mail ?? ""), department: String(dept ?? ""), groups: g, searched: true };
}

/** Chế độ header: proxy gắn X-Remote-* sau khi tự xác thực (Windows/Kerberos/LDAP). Bắt buộc kèm x-sso-secret đúng. */
export function claimsFromHeaders(req: Request): SsoClaims | null {
  const want = process.env.SSO_PROXY_SECRET ?? "";
  const got = req.headers.get("x-sso-secret") ?? "";
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  const h = (k: string, d: string) => req.headers.get(process.env[k] || d) ?? "";
  const username = normalizeSso(h("SSO_HDR_USER", "x-remote-user"));
  if (!username) return null;
  return { username, prof: toProfile(h("SSO_HDR_NAME", "x-remote-name"), h("SSO_HDR_MAIL", "x-remote-mail"), h("SSO_HDR_DEPT", "x-remote-dept"), h("SSO_HDR_GROUPS", "x-remote-groups")) };
}
