import { Client, InvalidCredentialsError } from "ldapts";
import { readFileSync } from "node:fs";

/**
 * Xác thực mật khẩu bằng Active Directory/LDAP (bind), dùng cho đăng nhập kiểu ICBV\tên.
 * Cấu hình (.env):
 *   LDAP_URL        ldaps://dc01.icbv.local:636   (nên dùng ldaps://; ldap://...:389 chỉ khi mạng nội bộ tin cậy)
 *   LDAP_DOMAIN     ICBV                           (bind bằng "ICBV\tên")
 *   LDAP_UPN_SUFFIX (tùy chọn) icbv.local          (nếu có thì bind bằng "tên@icbv.local" thay cho ICBV\tên)
 *   LDAP_CA_FILE    (tùy chọn) đường dẫn file .pem/.crt CA nội bộ để tin cậy chứng chỉ của DC
 *   LDAP_TLS_INSECURE=1 (không khuyến nghị) bỏ kiểm tra chứng chỉ
 *   LDAP_TIMEOUT_MS (mặc định 8000)
 *   LDAP_LOCAL_USERS  danh sách tên đăng nhập luôn dùng mật khẩu cục bộ, cách nhau dấu phẩy (mặc định "admin")
 *   LDAP_AUTOCREATE=1 tự tạo tài khoản role "user" ở lần đăng nhập AD đầu tiên (mặc định: chỉ người đã được tạo sẵn)
 * Phân quyền theo nhóm AD (tùy chọn):
 *   LDAP_BASE_DN    dc=icbv,dc=com                 (gốc tìm kiếm tài khoản)
 *   LDAP_ROLE_MAP   admin=CN=704-Admin,OU=Groups,DC=icbv,DC=com;tcth=704-TCTH;it=704-IT;manager=704-LDP;user=704-User
 *                   (vế phải: DN đầy đủ hoặc chỉ tên nhóm CN; cách nhau dấu ;). Có nhiều nhóm thì lấy quyền cao nhất.
 *   LDAP_REQUIRE_GROUP=1  người không thuộc nhóm nào trong LDAP_ROLE_MAP thì KHÔNG được đăng nhập
 *   LDAP_NESTED_GROUPS=1  tính cả nhóm lồng nhau (dùng LDAP_MATCHING_RULE_IN_CHAIN)
 *   LDAP_DEPT_ATTR  department                     (thuộc tính AD chứa tên phòng; khớp với danh mục phòng ban, không tự tạo)
 *   LDAP_BIND_DN / LDAP_BIND_PASSWORD (tùy chọn) tài khoản chỉ đọc để tìm kiếm; bỏ trống = tìm bằng chính tài khoản đang đăng nhập
 */
export const ldapEnabled = () => !!process.env.LDAP_URL && !!process.env.LDAP_DOMAIN;

export const isLocalOnly = (username: string) =>
  (process.env.LDAP_LOCAL_USERS ?? "admin").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(username.toLowerCase());

/** "ICBV\\an", "an@icbv.local" -> "an". Chỉ nhận ký tự an toàn (chặn chèn ký tự đặc biệt vào DN). */
export function normalizeLdapUser(input: string): string | null {
  let u = input.trim();
  if (u.includes("\\")) u = u.split("\\").pop()!;
  if (u.includes("@")) u = u.split("@")[0];
  return /^[A-Za-z0-9._-]{1,64}$/.test(u) ? u : null;
}

export interface LdapProfile { dn: string; displayName: string; mail: string; department: string; groups: string[]; searched: boolean }

export const ROLE_ORDER = ["admin", "tcth", "it", "manager", "user"] as const;
const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
export const roleMapEnabled = () => !!(process.env.LDAP_ROLE_MAP ?? "").trim();
const cnOf = (dn: string) => (/^cn=((?:\\.|[^,\\])+)/i.exec(dn.trim())?.[1] ?? dn).replace(/\\(.)/g, "$1");
export const filterEscape = (v: string) => v.replace(/[\\*()\0]/g, (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"));

/** "admin=CN=A,OU=G,DC=x;it=704-IT" -> { admin: ["cn=a,ou=g,dc=x"], it: ["704-it"] } */
export function parseRoleMap(spec: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of spec.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const role = part.slice(0, i).trim().toLowerCase();
    const grp = part.slice(i + 1).trim().toLowerCase();
    if (!(ROLE_ORDER as readonly string[]).includes(role) || !grp) continue;
    (out[role] ??= []).push(grp);
  }
  return out;
}

/** Vai trò cao nhất mà các nhóm AD của người dùng khớp trong LDAP_ROLE_MAP; null nếu không khớp nhóm nào. */
export function roleFromGroups(groups: string[], spec = process.env.LDAP_ROLE_MAP ?? ""): string | null {
  const map = parseRoleMap(spec);
  const have = new Set<string>();
  for (const g of groups) { have.add(g.trim().toLowerCase()); have.add(cnOf(g).toLowerCase()); }
  for (const role of ROLE_ORDER) if ((map[role] ?? []).some((x) => have.has(x) || have.has(cnOf(x).toLowerCase()))) return role;
  return null;
}

/** Tìm phòng ban theo tên (bỏ dấu, bỏ tiền tố "Phòng/Ban"); không thấy trả null (không tự tạo phòng mới). */
export function matchDepartment(name: string, depts: { id: string; name?: string; code?: string }[]): string | null {
  const strip = (x: string) => norm(x).replace(/^(phong|ban|trung tam)\s+/, "");
  const want = strip(name);
  if (!want) return null;
  const hit = depts.find((d) => strip(String(d.name ?? "")) === want) ?? depts.find((d) => d.code && norm(String(d.code)) === norm(name));
  return hit?.id ?? null;
}

type SearchClient = { search: (base: string, o: { scope: "sub"; filter: string; attributes: string[]; sizeLimit?: number }) => Promise<{ searchEntries: Record<string, unknown>[] }> };
const first = (v: unknown) => String(Array.isArray(v) ? v[0] ?? "" : v ?? "");
const all = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String);

/** Đọc hồ sơ + nhóm của tài khoản từ AD (client đã bind). Lỗi/không đủ quyền: trả searched=false, KHÔNG thay đổi quyền. */
export async function searchProfile(client: SearchClient, username: string): Promise<LdapProfile> {
  const base = process.env.LDAP_BASE_DN ?? "";
  const bad: LdapProfile = { dn: "", displayName: "", mail: "", department: "", groups: [], searched: false };
  if (!base) return bad;
  const deptAttr = process.env.LDAP_DEPT_ATTR || "department";
  try {
    const r = await client.search(base, { scope: "sub", filter: `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${filterEscape(username)}))`, attributes: ["dn", "displayName", "mail", deptAttr, "memberOf"], sizeLimit: 2 });
    const e = r.searchEntries[0];
    if (!e) return bad;
    let groups = all(e.memberOf);
    const dn = first(e.dn);
    if (process.env.LDAP_NESTED_GROUPS === "1" && dn) {
      const g = await client.search(base, { scope: "sub", filter: `(&(objectClass=group)(member:1.2.840.113556.1.4.1941:=${filterEscape(dn)}))`, attributes: ["dn"], sizeLimit: 500 });
      groups = [...new Set([...groups, ...g.searchEntries.map((x) => first(x.dn))])];
    }
    return { dn, displayName: first(e.displayName), mail: first(e.mail), department: first(e[deptAttr]), groups, searched: true };
  } catch (err) {
    console.error("LDAP tìm kiếm hồ sơ lỗi:", (err as Error).message);
    return bad;
  }
}

/** null = sai mật khẩu; ngược lại trả hồ sơ AD (searched=false nếu không đọc được); ném lỗi nếu không liên lạc được máy chủ AD. */
export async function ldapAuth(username: string, password: string): Promise<LdapProfile | null> {
  if (!password) return null; // bind mật khẩu rỗng = bind ẩn danh (luôn thành công) -> tuyệt đối không cho qua
  const u = normalizeLdapUser(username);
  if (!u) return null;
  const url = process.env.LDAP_URL!;
  const tlsOptions: Record<string, unknown> = {};
  if (process.env.LDAP_CA_FILE) tlsOptions.ca = [readFileSync(process.env.LDAP_CA_FILE)];
  if (process.env.LDAP_TLS_INSECURE === "1") tlsOptions.rejectUnauthorized = false;
  const ms = Number(process.env.LDAP_TIMEOUT_MS) || 8000;
  const opts = { url, timeout: ms, connectTimeout: ms, ...(url.toLowerCase().startsWith("ldaps:") ? { tlsOptions } : {}) };
  const client = new Client(opts);
  const dn = process.env.LDAP_UPN_SUFFIX ? `${u}@${process.env.LDAP_UPN_SUFFIX}` : `${process.env.LDAP_DOMAIN}\\${u}`;
  try {
    await client.bind(dn, password);
  } catch (e) {
    try { await client.unbind(); } catch { /* bỏ qua */ }
    if (e instanceof InvalidCredentialsError) return null;
    throw e;
  }
  let prof: LdapProfile;
  try {
    if (process.env.LDAP_BIND_DN && process.env.LDAP_BIND_PASSWORD) {
      // tài khoản chỉ đọc để tìm kiếm (nhiều AD không cho người dùng thường đọc thuộc tính)
      const svc = new Client(opts);
      try { await svc.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD); prof = await searchProfile(svc, u); }
      catch (e) { console.error("LDAP bind tài khoản tìm kiếm lỗi:", (e as Error).message); prof = await searchProfile(client, u); }
      finally { try { await svc.unbind(); } catch { /* bỏ qua */ } }
    } else prof = await searchProfile(client, u);
  } finally {
    try { await client.unbind(); } catch { /* bỏ qua */ }
  }
  return prof;
}

/** Giữ tương thích: true = AD xác nhận đúng mật khẩu. */
export async function ldapCheck(username: string, password: string): Promise<boolean> {
  return (await ldapAuth(username, password)) !== null;
}
