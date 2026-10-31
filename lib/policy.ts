import { db } from "./firebase";
import type { SessionUser } from "./auth";
import type { Col } from "./store";

/**
 * Kiểm tra quyền ghi ở máy chủ cho các bảng nghiệp vụ (tài sản, lịch sử, phiếu báo hỏng, điều chuyển).
 * Trả về true nếu thao tác được phép. `prev` là bản ghi hiện có (undefined nếu chưa có / đã xoá).
 */
type Rec = Record<string, unknown> | undefined;
type U = Pick<SessionUser, "id" | "role" | "department_id">;

const PRIV = ["admin", "tcth", "it"];
const sameDept = (u: U, d: unknown) => d != null && String(u.department_id ?? "") !== "" && String(u.department_id) === String(d);
const META = new Set(["id", "_u", "_del", "_kw"]);

function changedKeys(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: string[] = [];
  for (const k of keys) {
    if (META.has(k)) continue;
    if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null)) out.push(k);
  }
  return out;
}

async function getDoc(col: string, id: unknown): Promise<Rec> {
  if (typeof id !== "string" || !id) return undefined;
  const d = (await db.collection(col).doc(id).get()).data();
  return d && !d._del ? d : undefined;
}

export const POLICY_COLS: Col[] = ["assets", "assetHistory", "repairs", "transfers"];

export async function allowWrite(
  u: U,
  col: Col,
  op: "set" | "delete",
  id: string,
  prev: Rec,
  data: Record<string, unknown> | undefined,
): Promise<boolean> {
  const admin = u.role === "admin";
  if (op === "delete") return admin; // xoá tài sản / phiếu / lịch sử: chỉ admin
  if (!data) return false;

  if (col === "assets") {
    if (!prev) return admin; // tạo tài sản: chỉ admin
    if (admin) return true;
    const keys = changedKeys(prev, data);
    if (!keys.length) return true;
    if (["tcth", "it"].includes(u.role)) return true;
    // user / manager: chỉ đổi trạng thái do quy trình báo hỏng (trong phòng mình), không đổi thông tin tài sản
    if (!sameDept(u, prev.department_id)) return false;
    const okKeys = new Set(["status", "status_changed_at", "updated_at"]);
    if (u.role === "manager") okKeys.add("current_user_id");
    if (!keys.every((k) => okKeys.has(k))) return false;
    if (keys.includes("status") && !["broken", "in_use"].includes(String(data.status))) return false;
    return true;
  }

  if (col === "assetHistory") {
    if (prev) return admin; // lịch sử đã ghi không được sửa
    return admin || String(data.actor_id ?? "") === u.id;
  }

  if (col === "repairs") {
    if (!prev) {
      if (data.status !== "pending_manager" || String(data.reported_by) !== u.id) return false;
      if (admin) return true;
      const a = await getDoc("assets", data.asset_id);
      return !!a && sameDept(u, a.department_id);
    }
    if (admin) return true;
    const keys = changedKeys(prev, data);
    if (!keys.length) return true;
    const a = await getDoc("assets", prev.asset_id);
    const inDept = !!a && sameDept(u, a.department_id);
    if (keys.some((k) => ["asset_id", "reported_by", "created_at", "ticket_code"].includes(k))) return false;
    const from = String(prev.status), to = String(data.status);
    if (from === to) {
      // xác nhận của người dùng / phòng ban sau khi sửa xong
      const okKeys = ["user_confirmed_at", "returned_to_user", "returned_at"];
      if (keys.every((k) => okKeys.includes(k))) return prev.reported_by === u.id || inDept || PRIV.includes(u.role);
      return u.role === "it" || u.role === "tcth";
    }
    const T: Record<string, { to: string[]; roles: (r: string) => boolean }> = {
      pending_manager: { to: ["pending_tcth", "rejected"], roles: (r) => (r === "manager" && inDept) || r === "tcth" },
      pending_tcth: { to: ["pending_it", "rejected"], roles: (r) => r === "tcth" },
      pending_it: { to: ["completed", "rejected"], roles: (r) => r === "it" || r === "tcth" },
    };
    const t = T[from];
    return !!t && t.to.includes(to) && t.roles(u.role);
  }

  if (col === "transfers") {
    if (!prev) {
      if (data.status !== "pending_confirm" || String(data.requested_by) !== u.id) return false;
      if (admin) return true;
      const a = await getDoc("assets", data.asset_id);
      return !!a && sameDept(u, a.department_id) && sameDept(u, data.from_department_id);
    }
    if (admin) return true;
    const keys = changedKeys(prev, data);
    if (!keys.length) return true;
    if (keys.some((k) => ["asset_id", "from_department_id", "to_department_id", "requested_by", "created_at", "ticket_code"].includes(k))) return false;
    const from = String(prev.status), to = String(data.status);
    const toMgr = u.role === "manager" && sameDept(u, prev.to_department_id);
    const T: Record<string, { to: string[]; ok: boolean }> = {
      pending_confirm: { to: ["pending_approval", "rejected"], ok: toMgr },
      pending_approval: { to: ["pending_execute", "rejected"], ok: u.role === "tcth" },
      pending_execute: { to: ["completed"], ok: false }, // chỉ admin thực hiện điều chuyển
    };
    const t = T[from];
    return !!t && t.ok && t.to.includes(to);
  }

  return true;
}
