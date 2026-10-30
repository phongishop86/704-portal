import { db } from "./firebase";

/**
 * Mô hình dữ liệu dùng chung giữa giao diện 704-assets và chatbot Telegram.
 *
 * Mỗi bản ghi là một document trong Firestore: collection = tên bảng, doc id = `id` của bản ghi.
 * Trường nội bộ (không gửi cho client):
 *   _u   mili giây cập nhật gần nhất, dùng để thăm dò thay đổi (`where _u > since`)
 *   _del true nếu đã xoá (giữ lại "mồ" để các máy khác biết mà xoá theo)
 *   _kw  (chỉ assets) từ khoá tìm kiếm cho chatbot
 *   password_hash (chỉ users) băm scrypt của mật khẩu
 */
export const COLS = [
  "departments",
  "categories",
  "users",
  "assets",
  "assetHistory",
  "transfers",
  "repairs",
  "inventoryChecks",
  "inventoryLines",
  "worklogs",
  "locations",
  "accessories",
  "software",
  "config",
] as const;
export type Col = (typeof COLS)[number];

export const isCol = (s: unknown): s is Col => typeof s === "string" && (COLS as readonly string[]).includes(s);

/** Ai được ghi vào bảng nào (client gọi qua /api/db/sync). Bảng không liệt kê: mọi tài khoản đang hoạt động. */
export const WRITE_ROLES: Partial<Record<Col, string[]>> = {
  users: ["admin"],
  departments: ["admin", "tcth"],
  categories: ["admin", "tcth"],
  config: ["admin", "tcth"],
  worklogs: ["admin", "it"],
  locations: ["admin", "tcth"],
  accessories: ["admin", "tcth", "it"],
  software: ["admin", "tcth", "it"],
  // Kiểm kê: tạo/chốt phiên chỉ Admin+TCTH; tick từng tài sản thêm lãnh đạo phòng (giới hạn phòng ban do giao diện áp)
  inventoryChecks: ["admin", "tcth"],
  inventoryLines: ["admin", "tcth", "manager"],
};

const RESERVED = ["_u", "_del", "_kw", "password_hash"];

/** Bỏ các trường nội bộ trước khi trả về client. */
export function publicData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (RESERVED.includes(k)) continue;
    if (k === "password") continue;
    out[k] = v;
  }
  return out;
}

/** Bỏ trường nội bộ do client gửi lên (client không được tự đặt). */
export function clientData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (RESERVED.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export const tokenize = (s: string): string[] =>
  Array.from(new Set(s.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((t) => t.length >= 2)));

/** Từ khoá tìm kiếm cho chatbot: mã + tên + serial tài sản. */
export function assetKeywords(a: { code?: unknown; name?: unknown; serial?: unknown }): string[] {
  return tokenize(`${a.code ?? ""} ${a.name ?? ""} ${a.serial ?? ""}`);
}

export const STATUS_LABELS: Record<string, string> = {
  in_use: "Đang sử dụng",
  unused: "Chưa sử dụng",
  broken: "Hỏng - đề nghị sửa chữa",
  liquidation: "Đề nghị thanh lý",
};

export const REPAIR_LABELS: Record<string, string> = {
  pending_manager: "Chờ LĐP phê duyệt",
  pending_tcth: "TCTH tiếp nhận & điều phối",
  pending_it: "Điện toán xử lý",
  completed: "Hoàn thành",
  rejected: "Đã huỷ",
};

export const OPEN_REPAIR_STATUSES = ["pending_manager", "pending_tcth", "pending_it", "in_progress"];

/** Sinh id giống hàm uid() của giao diện (base36). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Mọi bên ghi dữ liệu (giao diện web, chatbot, nhập backup) gọi hàm này SAU KHI ghi xong.
 * Giao diện chỉ cần đọc 1 document `meta/rev` mỗi lần thăm dò; thấy số đổi mới truy vấn các bảng.
 */
export async function bumpRev(): Promise<void> {
  await db.collection("meta").doc("rev").set({ rev: Date.now() });
}

export async function readRev(): Promise<number> {
  const d = (await db.collection("meta").doc("rev").get()).data();
  return typeof d?.rev === "number" ? d.rev : 0;
}
