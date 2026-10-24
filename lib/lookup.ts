import { db } from "./firebase";
import { STATUS_LABELS } from "./store";
import type { WebAsset } from "./types";

/** Tên phòng ban / nhóm tài sản: bảng nhỏ, đọc một lần và nhớ 5 phút. */
let cache: { at: number; dept: Map<string, string>; cat: Map<string, string> } | null = null;

async function names() {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  const [d, c] = await Promise.all([db.collection("departments").get(), db.collection("categories").get()]);
  const toMap = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
    new Map(docs.filter((x) => !x.data()._del).map((x) => [x.id, String(x.data().name ?? "")]));
  cache = { at: Date.now(), dept: toMap(d.docs), cat: toMap(c.docs) };
  return cache;
}

export async function deptName(id?: string | null): Promise<string> {
  return id ? ((await names()).dept.get(id) ?? "") : "";
}

export async function userName(id?: string | null): Promise<string> {
  if (!id) return "";
  const u = (await db.collection("users").doc(id).get()).data();
  return u && !u._del ? String(u.full_name ?? "") : "";
}

/**
 * Dạng tài sản trả cho Claude và người dùng chatbot.
 * KHÔNG có nguyên giá / giá trị còn lại: bot không bao giờ đọc ra những trường đó.
 */
export async function assetView(a: WebAsset) {
  const n = await names();
  return {
    code: a.code,
    name: a.name,
    category: a.category_id ? (n.cat.get(a.category_id) ?? "") : "",
    department: a.department_id ? (n.dept.get(a.department_id) ?? "") : "",
    current_user: await userName(a.current_user_id),
    status: STATUS_LABELS[a.status ?? ""] ?? a.status ?? "",
  };
}
