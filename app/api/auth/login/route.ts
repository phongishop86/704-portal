import { db } from "@/lib/firebase";
import { recordLogin } from "@/lib/usage";
import {
  clearFailures,
  isLockedOut,
  json,
  makeSessionCookie,
  recordFailure,
  verifyPassword,
} from "@/lib/auth";
import { isLocalOnly, ldapAuth, ldapEnabled, matchDepartment, normalizeLdapUser, roleFromGroups, roleMapEnabled, type LdapProfile } from "@/lib/ldap";
import { bumpRev, uid } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  let username = String(body?.username ?? "").trim();
  // Có cấu hình AD: cho phép gõ ICBV\tên hoặc tên@miền, quy về "tên"
  if (ldapEnabled()) username = normalizeLdapUser(username) ?? username;
  const password = String(body?.password ?? "");
  if (!username || !password) return json({ error: "Thiếu tên đăng nhập hoặc mật khẩu." }, 400);

  if (await isLockedOut(username)) {
    return json({ error: "Đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút." }, 429);
  }

  const snap = await db.collection("users").where("username", "==", username).limit(5).get();
  const found = snap.docs.find((d) => !d.data()._del);
  let docId: string | undefined = found?.id;
  let u: Record<string, any> | undefined = found?.data();

  // Đăng nhập AD (ICBV\tên): áp dụng cho mọi tài khoản trừ tài khoản cục bộ (mặc định "admin") hoặc auth_source="local"
  const viaLdap = ldapEnabled() && !isLocalOnly(username) && (u ? u.auth_source !== "local" : true);
  let ok: boolean;
  if (viaLdap) {
    let prof: LdapProfile | null;
    try {
      prof = await ldapAuth(username, password);
    } catch (e) {
      console.error("LDAP lỗi:", (e as Error).message);
      return json({ error: "Không liên lạc được máy chủ Active Directory. Thử lại sau hoặc báo quản trị." }, 503);
    }
    ok = prof !== null;
    if (ok && prof) {
      // Phân quyền theo nhóm AD: nhóm khớp -> vai trò cao nhất; không khớp -> giữ vai trò đang có (hoặc chặn nếu LDAP_REQUIRE_GROUP=1)
      const mapped = roleMapEnabled() && prof.searched ? roleFromGroups(prof.groups) : null;
      if (roleMapEnabled() && process.env.LDAP_REQUIRE_GROUP === "1" && (!prof.searched || !mapped)) {
        await recordLogin(req, { username, ok: false });
        return json({ error: prof.searched ? "Tài khoản của bạn chưa được cấp quyền sử dụng hệ thống (không thuộc nhóm AD được phép). Liên hệ quản trị." : "Không đọc được nhóm Active Directory để phân quyền. Báo quản trị." }, 403);
      }
      const patch: Record<string, unknown> = {};
      if (mapped && (!u || u.role !== mapped)) patch.role = mapped;
      if (prof.displayName && (!u || u.full_name !== prof.displayName)) patch.full_name = prof.displayName;
      if (prof.mail && (!u || u.email !== prof.mail)) patch.email = prof.mail;
      if (prof.department) {
        const ds = await db.collection("departments").limit(500).get();
        const did = matchDepartment(prof.department, ds.docs.filter((d) => !d.data()._del).map((d) => ({ id: d.id, ...(d.data() as { name?: string; code?: string }) })));
        if (did && (!u || u.department_id !== did)) patch.department_id = did;
      }
      if (!docId && (process.env.LDAP_AUTOCREATE === "1" || mapped)) {
        const id = uid();
        const nu = { id, username, full_name: prof.displayName || username, role: mapped ?? "user", department_id: (patch.department_id as string) ?? null, email: prof.mail, employee_code: "", is_active: true, auth_source: "ldap", password_hash: "", _u: Date.now(), _del: false };
        await db.collection("users").doc(id).set(nu);
        await bumpRev();
        docId = id;
        u = nu;
      } else if (docId && u && Object.keys(patch).length) {
        await db.collection("users").doc(docId).set({ ...patch, _u: Date.now() }, { merge: true });
        await bumpRev();
        u = { ...u, ...patch };
      }
    }
  } else {
    ok = await verifyPassword(password, u?.password_hash);
  }
  if (!docId || !u || !ok || u.is_active === false) {
    await recordFailure(username);
    await recordLogin(req, { username, ok: false });
    return json({ error: "Sai tên đăng nhập hoặc mật khẩu." }, 401);
  }

  await clearFailures(username);
  await recordLogin(req, { userId: docId, username, ok: true });
  return json(
    { ok: true, user: { id: docId, username: u.username, full_name: u.full_name, role: u.role } },
    200,
    { "Set-Cookie": makeSessionCookie(docId) },
  );
}
