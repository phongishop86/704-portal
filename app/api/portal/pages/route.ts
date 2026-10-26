import { db } from "@/lib/firebase";
import { getSessionUser, json } from "@/lib/auth";
import { uid } from "@/lib/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
const COL = "portal_pages";

const DEFAULTS = [
  {
    id: "ccdc",
    title: "Quản lý CCDC & Tài sản",
    desc: "Sổ tài sản, điều chuyển, sửa chữa, kiểm kê, nhập Excel ngân hàng",
    icon: "📦",
    url: "/app.html",
    mode: "embed",
    roles: [] as string[],
    enabled: true,
    order: 1,
  },
];

async function load(): Promise<any[]> {
  const snap = await db.collection(COL).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((r: any) => !r._del);
  return rows.length ? rows.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)) : DEFAULTS.map((x) => ({ ...x }));
}

/** Chỉ cho đường dẫn nội bộ ("/xxx") hoặc http(s) — chặn javascript:, data:, //host. */
function safeUrl(u: string): string | null {
  u = u.trim();
  if (/^\/(?!\/)[^\s]*$/.test(u)) return u;
  if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
  return null;
}

/** GET: danh sách trang cho người đã đăng nhập (admin thấy tất cả, người khác chỉ thấy trang bật & đúng vai trò). */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  let pages = await load();
  if (user.role !== "admin") {
    pages = pages.filter((p) => p.enabled !== false && (!p.roles?.length || p.roles.includes(user.role)));
  }
  return json({ ok: true, pages });
}

/**
 * POST (CHỈ ADMIN): { action: "save", page } | { action: "delete", id } | { action: "reorder", ids: [] }
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);
  if (user.role !== "admin") return json({ error: "Chỉ quản trị viên được thay đổi các trang." }, 403);
  const b = await req.json().catch(() => null);
  if (!b) return json({ error: "Dữ liệu không hợp lệ." }, 400);

  // lần ghi đầu tiên: lưu sẵn các trang mặc định để sắp xếp/xóa được
  const existing = await db.collection(COL).get();
  if (existing.empty) {
    for (const d of DEFAULTS) {
      const { id, ...rest } = d;
      await db.collection(COL).doc(id).set({ ...rest, _u: Date.now() });
    }
  }
  const now = Date.now();

  if (b.action === "save") {
    const p = b.page ?? {};
    const title = String(p.title ?? "").trim().slice(0, 80);
    const url = safeUrl(String(p.url ?? ""));
    if (!title) return json({ error: "Thiếu tên trang." }, 400);
    if (!url) return json({ error: "Địa chỉ phải bắt đầu bằng / (trang nội bộ) hoặc http(s)://." }, 400);
    const id = p.id ? String(p.id) : uid();
    const ref = db.collection(COL).doc(id);
    const cur = (await ref.get()).data() as any;
    let order = cur?.order;
    if (order === undefined) {
      const all = await load();
      order = all.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
    }
    await ref.set({
      title,
      desc: String(p.desc ?? "").trim().slice(0, 200),
      icon: String(p.icon ?? "").trim().slice(0, 8) || "📄",
      url,
      mode: p.mode === "newtab" ? "newtab" : "embed",
      roles: Array.isArray(p.roles) ? p.roles.map(String).filter(Boolean).slice(0, 10) : [],
      enabled: p.enabled !== false,
      order,
      _u: now,
    });
    return json({ ok: true, id });
  }

  if (b.action === "delete") {
    const id = String(b.id ?? "");
    if (!id) return json({ error: "Thiếu id." }, 400);
    await db.collection(COL).doc(id).delete();
    return json({ ok: true });
  }

  if (b.action === "reorder") {
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
    for (let i = 0; i < ids.length; i++) await db.collection(COL).doc(ids[i]).update({ order: i + 1, _u: now });
    return json({ ok: true });
  }
  return json({ error: "Hành động không hợp lệ." }, 400);
}
