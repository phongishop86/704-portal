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

/** true = AD xác nhận đúng mật khẩu; false = sai/khóa/hết hạn; ném lỗi nếu không liên lạc được máy chủ AD. */
export async function ldapCheck(username: string, password: string): Promise<boolean> {
  if (!password) return false; // bind mật khẩu rỗng = bind ẩn danh (luôn thành công) -> tuyệt đối không cho qua
  const u = normalizeLdapUser(username);
  if (!u) return false;
  const url = process.env.LDAP_URL!;
  const tlsOptions: Record<string, unknown> = {};
  if (process.env.LDAP_CA_FILE) tlsOptions.ca = [readFileSync(process.env.LDAP_CA_FILE)];
  if (process.env.LDAP_TLS_INSECURE === "1") tlsOptions.rejectUnauthorized = false;
  const ms = Number(process.env.LDAP_TIMEOUT_MS) || 8000;
  // Chỉ truyền tlsOptions khi dùng ldaps:// (truyền cho ldap:// khiến thư viện cố bắt tay TLS trên cổng thường)
  const client = new Client({ url, timeout: ms, connectTimeout: ms, ...(url.toLowerCase().startsWith("ldaps:") ? { tlsOptions } : {}) });
  const dn = process.env.LDAP_UPN_SUFFIX ? `${u}@${process.env.LDAP_UPN_SUFFIX}` : `${process.env.LDAP_DOMAIN}\\${u}`;
  try {
    await client.bind(dn, password);
    return true;
  } catch (e) {
    if (e instanceof InvalidCredentialsError) return false;
    throw e;
  } finally {
    try { await client.unbind(); } catch { /* bỏ qua */ }
  }
}
