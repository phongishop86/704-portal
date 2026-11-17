import { db } from "@/lib/firebase";
import { matchDepartment, roleFromGroups, roleMapEnabled } from "@/lib/ldap";
import { bumpRev, uid } from "@/lib/store";

export interface DirProfile { displayName: string; mail: string; department: string; groups: string[]; searched: boolean }
export type Provision =
  | { ok: true; id: string; user: Record<string, any> }
  | { ok: false; status: number; error: string };

/**
 * Từ hồ sơ thư mục (AD) -> tài khoản trong hệ thống: phân quyền theo nhóm (LDAP_ROLE_MAP), khớp phòng ban, tự tạo tài khoản.
 * Dùng chung cho đăng nhập bằng mật khẩu AD và đăng nhập một lần (SSO) từ Portal.
 */
export async function provisionDirectoryUser(username: string, prof: DirProfile): Promise<Provision> {
  const snap = await db.collection("users").where("username", "==", username).limit(5).get();
  const found = snap.docs.find((d) => !d.data()._del);
  let docId: string | undefined = found?.id;
  let u: Record<string, any> | undefined = found?.data();
  if (u && u.auth_source === "local") return { ok: false, status: 403, error: "Tài khoản này dùng mật khẩu riêng trong ứng dụng." };

  const mapped = roleMapEnabled() && prof.searched ? roleFromGroups(prof.groups) : null;
  if (roleMapEnabled() && process.env.LDAP_REQUIRE_GROUP === "1" && (!prof.searched || !mapped)) {
    return { ok: false, status: 403, error: prof.searched ? "Tài khoản của bạn chưa được cấp quyền sử dụng hệ thống (không thuộc nhóm AD được phép). Liên hệ quản trị." : "Không đọc được nhóm Active Directory để phân quyền. Báo quản trị." };
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
  if (!docId || !u || u.is_active === false) return { ok: false, status: 401, error: "Tài khoản chưa được tạo hoặc đã bị khoá trong hệ thống. Liên hệ quản trị." };
  return { ok: true, id: docId, user: u };
}
