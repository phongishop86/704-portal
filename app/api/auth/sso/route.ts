import { json, makeSessionCookie } from "@/lib/auth";
import { isLocalOnly, ldapLookup } from "@/lib/ldap";
import { provisionDirectoryUser } from "@/lib/ldap-user";
import { claimsFromHeaders, ssoHeaderEnabled, ssoTokenEnabled, verifySsoToken, type SsoClaims } from "@/lib/sso";
import { recordLogin } from "@/lib/usage";

/**
 * Đăng nhập một lần từ Portal (Portal đã xác thực AD):
 *  GET  /api/auth/sso?token=<JWT HS256>&next=/duong-dan   -> đặt phiên, chuyển hướng 302 vào ứng dụng (dùng cho liên kết/iframe từ Portal)
 *  POST /api/auth/sso  {token}  hoặc (chế độ header) không body  -> đặt phiên, trả JSON (ứng dụng tự gọi khi chưa có phiên)
 */
function resolve(req: Request, token: string | null): { claims?: SsoClaims; error?: string; status?: number } {
  if (token) {
    if (!ssoTokenEnabled()) return { error: "SSO chưa được bật trên máy chủ.", status: 404 };
    try { return { claims: verifySsoToken(token) }; } catch (e) { console.error("SSO từ chối:", (e as Error).message); return { error: "Phiên từ Portal không hợp lệ hoặc đã hết hạn. Hãy mở lại từ Portal.", status: 401 }; }
  }
  if (ssoHeaderEnabled()) { const c = claimsFromHeaders(req); if (c) return { claims: c }; }
  return { error: "Chưa có thông tin đăng nhập từ Portal.", status: 401 };
}

async function establish(req: Request, token: string | null) {
  const r = resolve(req, token);
  if (!r.claims) return { err: json({ error: r.error }, r.status) };
  const { username } = r.claims;
  let prof = r.claims.prof;
  if (r.claims.lookup) {
    const found = await ldapLookup(username);
    if (found) prof = { displayName: prof.displayName || found.displayName, mail: prof.mail || found.mail, department: prof.department || found.department, groups: found.groups, searched: found.searched };
  }
  if (isLocalOnly(username)) { await recordLogin(req, { username, ok: false }); return { err: json({ error: "Tài khoản quản trị nội bộ phải đăng nhập bằng mật khẩu, không dùng SSO." }, 403) }; }
  const p = await provisionDirectoryUser(username, prof);
  if (!p.ok) { await recordLogin(req, { username, ok: false }); return { err: json({ error: p.error }, p.status) }; }
  await recordLogin(req, { userId: p.id, username, ok: true });
  return { id: p.id, user: p.user };
}

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const e = await establish(req, url.searchParams.get("token"));
  if (e.err) {
    // Liên kết từ Portal hỏng/hết hạn: về trang đăng nhập thường (người dùng vẫn có thể gõ mật khẩu AD)
    return new Response(null, { status: 302, headers: { Location: "/?sso=fail" } });
  }
  return new Response(null, { status: 302, headers: { Location: safeNext(url.searchParams.get("next")), "Set-Cookie": makeSessionCookie(e.id!), "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const e = await establish(req, typeof body?.token === "string" ? body.token : null);
  if (e.err) return e.err;
  const u = e.user!;
  return json({ ok: true, user: { id: e.id, username: u.username, full_name: u.full_name, role: u.role } }, 200, { "Set-Cookie": makeSessionCookie(e.id!) });
}
