import { db } from "@/lib/firebase";
import { getSessionUser, hashPassword, json } from "@/lib/auth";
import { assetKeywords, bumpRev, clientData, isCol, WRITE_ROLES, type Col } from "@/lib/store";

export const maxDuration = 60;

interface Op {
  col: Col;
  op: "set" | "delete";
  id: string;
  data?: Record<string, unknown>;
}

const MAX_OPS = 500;
const MAX_DOC_BYTES = 900 * 1024;

/**
 * Ghi các thay đổi từ giao diện lên Firestore.
 *   POST /api/db/sync  { ops: [{ col, op: "set"|"delete", id, data? }] }
 * - "set" thay toàn bộ bản ghi (không merge); "delete" để lại "mồ" _del=true.
 * - Phân quyền theo vai trò ở WRITE_ROLES; bảng khác cho mọi tài khoản đang hoạt động.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);

  const body = await req.json().catch(() => null);
  const ops: Op[] = Array.isArray(body?.ops) ? body.ops : [];
  if (!ops.length) return json({ ok: true, now: Date.now(), applied: 0 });
  if (ops.length > MAX_OPS) return json({ error: `Tối đa ${MAX_OPS} thao tác mỗi lần.` }, 413);

  // 1. Kiểm tra trước khi ghi. Thao tác sai định dạng: từ chối cả lô. Thao tác không đủ quyền: bỏ qua
  //    và báo lại trong `rejected` (giao diện của vai trò thấp hơn có thể tự chuẩn hoá dữ liệu cục bộ,
  //    không được để việc đó làm kẹt cả hàng đợi đồng bộ).
  const rejected: { col: string; id: string }[] = [];
  const permitted: Op[] = [];
  for (const o of ops) {
    if (!isCol(o?.col) || (o.op !== "set" && o.op !== "delete")) {
      return json({ error: "Thao tác không hợp lệ." }, 400);
    }
    if (typeof o.id !== "string" || !o.id || o.id.length > 200 || o.id.includes("/")) {
      return json({ error: "Mã bản ghi không hợp lệ." }, 400);
    }
    const allowed = WRITE_ROLES[o.col];
    if (allowed && !allowed.includes(user.role)) {
      rejected.push({ col: o.col, id: o.id });
      continue;
    }
    if (o.op === "set") {
      if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) {
        return json({ error: "Thiếu dữ liệu bản ghi." }, 400);
      }
      if (Buffer.byteLength(JSON.stringify(o.data)) > MAX_DOC_BYTES) {
        return json({ error: `Bản ghi ${o.col}/${o.id} quá lớn (giới hạn ~900KB).` }, 413);
      }
    }
    permitted.push(o);
  }

  const now = Date.now();
  const batchable: Op[] = [];
  const userOps: Op[] = [];
  let skipped = 0;
  for (const o of permitted) {
    // Không cho tự xoá chính tài khoản đang đăng nhập (tránh khoá cả hệ thống).
    if (o.col === "users" && o.op === "delete" && o.id === user.id) {
      skipped++;
      continue;
    }
    (o.col === "users" && o.op === "set" ? userOps : batchable).push(o);
  }

  // 2. Bảng thường: ghi theo lô 400.
  for (let i = 0; i < batchable.length; i += 400) {
    const batch = db.batch();
    for (const o of batchable.slice(i, i + 400)) {
      const ref = db.collection(o.col).doc(o.id);
      if (o.op === "delete") {
        batch.set(ref, { id: o.id, _del: true, _u: now });
      } else {
        const data = clientData(o.data!);
        data.id = o.id;
        const extra = o.col === "assets" ? { _kw: assetKeywords(data) } : {};
        batch.set(ref, { ...data, ...extra, _u: now, _del: false });
      }
    }
    await batch.commit();
  }

  // 3. Tài khoản: băm mật khẩu mới, giữ nguyên hash cũ nếu client không gửi mật khẩu, chặn trùng tên đăng nhập.
  for (const o of userOps) {
    const data = clientData(o.data!);
    data.id = o.id;
    const username = String(data.username ?? "").trim();
    if (!username) return json({ error: "Thiếu tên đăng nhập." }, 400);
    data.username = username;

    const dup = await db.collection("users").where("username", "==", username).limit(5).get();
    if (dup.docs.some((d) => d.id !== o.id && !d.data()._del)) {
      return json({ error: `Tên đăng nhập '${username}' đã tồn tại.` }, 409);
    }

    const prev = (await db.collection("users").doc(o.id).get()).data();
    let password_hash: string | undefined = prev?.password_hash;
    const pw = (o.data as Record<string, unknown>).password;
    if (typeof pw === "string" && pw) password_hash = await hashPassword(pw);
    delete data.password;

    await db.collection("users").doc(o.id).set({ ...data, password_hash, _u: now, _del: false });
  }

  if (permitted.length - skipped > 0) await bumpRev();
  return json({ ok: true, now, applied: permitted.length - skipped, skipped, rejected });
}
