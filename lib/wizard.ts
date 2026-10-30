/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./firebase";
import { findAssets, getOpenTickets } from "./core";
import { deptName, listDepartments } from "./lookup";
import type { Button, Reply, User } from "./types";

/**
 * Khai báo nhật ký IT từng bước trên Telegram (không dùng AI, không cần mở web).
 * Cùng bộ trường với form "Nhật ký IT" trên web. Trạng thái từng người lưu ở drafts/wiz_<userId> (hết hạn 30 phút).
 * Bước cuối tạo bản nháp thường và dùng lại nút ✅ Ghi / ❌ Huỷ sẵn có (handleCallback) để ghi vào cơ sở dữ liệu.
 */
const IT_ROLES = ["admin", "it"];
const TTL = 30 * 60 * 1000;

export const CATS = ["Sự cố phần cứng", "Phần mềm / Hệ điều hành", "Mạng / Internet", "Máy in / Thiết bị ngoại vi", "Cài đặt / Cấu hình", "Bảo trì định kỳ", "Tài khoản / Phân quyền", "Hỗ trợ người dùng", "Khác"];
export const RESULTS: Record<string, string> = { done: "Hoàn thành", doing: "Đang xử lý", waiting: "Chờ linh kiện / phản hồi", escalated: "Chuyển tuyến / đơn vị ngoài", failed: "Chưa khắc phục được" };

type Step = "title" | "category" | "asset" | "ticket" | "dept" | "requester" | "start" | "end" | "cause" | "solution" | "result" | "note";
const ORDER: Step[] = ["title", "category", "asset", "ticket", "dept", "requester", "start", "end", "cause", "solution", "result", "note"];
const OPTIONAL: Step[] = ["asset", "dept", "requester", "end", "cause", "solution", "note"];

interface State {
  kind: "wizard";
  user_id: string;
  step: Step;
  data: Record<string, any>;
  cands?: { id: string; name: string }[];
  expires_at: number;
}
export interface WizardOut { ack?: string; next?: Reply }

const ref = (u: User) => db.collection("drafts").doc("wiz_" + u.id);
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const btn = (text: string, data: string): Button => ({ text, data });
const rowsOf = (bs: Button[], n: number): Button[][] => { const out: Button[][] = []; for (let i = 0; i < bs.length; i += n) out.push(bs.slice(i, i + n)); return out; };
const SKIP = [btn("⏭ Bỏ qua", "w:skip")];

/* ---------- thời gian theo giờ Việt Nam ---------- */
const VN = 7 * 3600 * 1000;
const fmtVN = (ms: number) => { const d = new Date(ms + VN), p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
export function parseWhen(t: string, now = Date.now()): number | null {
  const s = t.trim().toLowerCase();
  if (/^(bây giờ|bay gio|now|vừa xong|vua xong)$/.test(s)) return now;
  const vn = new Date(now + VN);
  let m = /^(\d{1,2})[:h](\d{2})$/.exec(s);
  if (m) { const H = +m[1], M = +m[2]; if (H > 23 || M > 59) return null; return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), H, M) - VN; }
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2})[:h](\d{2})$/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2], y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : vn.getUTCFullYear(), H = +m[4], M = +m[5];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || H > 23 || M > 59) return null;
    return Date.UTC(y, mo - 1, d, H, M) - VN;
  }
  return null;
}
export function parseDur(t: string): number | null {
  const s = t.trim().toLowerCase().replace(/^\+/, "");
  let m = /^(\d+)\s*(?:p|ph|phut|phút|m|min)?$/.exec(s);
  if (m) return +m[1];
  m = /^(\d+)\s*(?:h|giờ|gio)\s*(?:(\d+)\s*(?:p|ph|phút|phut)?)?$/.exec(s);
  if (m && (m[2] === undefined || /(p|ph|phút|phut)$/.test(s) || false)) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  return null;
}

/* ---------- câu hỏi từng bước ---------- */
function prompt(st: State): Reply {
  const h = (q: string) => q;
  const opt = OPTIONAL.includes(st.step) ? "\n(Không bắt buộc: bấm Bỏ qua hoặc gõ /boqua)" : "";
  switch (st.step) {
    case "title": return { text: `📝 Nhật ký công việc IT mới. Gõ /huy để thoát bất cứ lúc nào.\n\n${h("Công việc / sự cố là gì?")}\nVí dụ: Máy tính không lên nguồn` };
    case "category": return { text: h("Loại công việc?"), buttons: rowsOf(CATS.map((c, i) => btn(c, `w:cat:${i}`)), 2) };
    case "asset": return { text: h("Mã tài sản / thiết bị liên quan? Gõ mã (VD: FA0001) hoặc tên.") + opt, buttons: [SKIP] };
    case "ticket": return { text: `Thiết bị này đang có phiếu ${st.data.ticket_offer.code}: “${st.data.ticket_offer.desc}”. Liên kết nhật ký với phiếu (xong việc sẽ đóng phiếu)?`, buttons: [[btn("✅ Có, liên kết", "w:tk:1"), btn("Không", "w:tk:0")]] };
    case "dept": return { text: h("Phòng ban được hỗ trợ? Gõ tên hoặc mã phòng ban.") + opt, buttons: [SKIP] };
    case "requester": return { text: h("Người yêu cầu / user được hỗ trợ? Gõ họ tên.") + opt, buttons: [SKIP] };
    case "start": return { text: h("Bắt đầu lúc nào?\nBấm nút hoặc gõ giờ dạng 14:30 (hoặc 28/10 14:30).") , buttons: [[btn("Bây giờ", "w:st:0"), btn("30 phút trước", "w:st:30"), btn("1 giờ trước", "w:st:60")]] };
    case "end": return { text: h("Kết thúc lúc nào / mất bao lâu?\nGõ giờ (15:15) hoặc thời lượng (45 phút, 1h30p).") + opt, buttons: [[btn("Vừa xong", "w:en:now"), btn("Chưa xong", "w:skip")]] };
    case "cause": return { text: h("Nguyên nhân?") + opt, buttons: [SKIP] };
    case "solution": return { text: h("Hướng xử lý / các bước đã làm?") + opt, buttons: [SKIP] };
    case "result": return { text: h("Kết quả?"), buttons: Object.entries(RESULTS).map(([k, v]) => [btn(v, `w:res:${k}`)]) };
    case "note": return { text: h("Ghi chú thêm (vật tư, đề xuất…)?") + opt, buttons: [SKIP] };
  }
}

async function advance(st: State, from: Step): Promise<Reply> {
  let i = ORDER.indexOf(from) + 1;
  while (i < ORDER.length) {
    const s = ORDER[i];
    if (s === "ticket" && !st.data.ticket_offer) { i++; continue; }
    if (s === "dept" && st.data.department_id) { i++; continue; }
    break;
  }
  if (i >= ORDER.length) return finish(st);
  st.step = ORDER[i];
  st.expires_at = Date.now() + TTL;
  await db.collection("drafts").doc("wiz_" + st.user_id).set(st);
  return prompt(st);
}

async function finish(st: State): Promise<Reply> {
  const d = st.data;
  const result = d.result || "done";
  const started = d.started_ms ?? Date.now();
  let dur = d.duration_min as number | undefined;
  if (dur === undefined && d.ended_ms) dur = Math.max(0, Math.round((d.ended_ms - started) / 60000));
  const draft = {
    kind: "worklog",
    asset_id: d.asset_id ?? null,
    asset_code: d.asset_code ?? "",
    asset_name: d.asset_name ?? "",
    department_id: d.department_id ?? null,
    category: d.category ?? "Khác",
    description: d.title,
    title: d.title,
    requester_name: d.requester_name ?? "",
    started_ms: started,
    started_at: new Date(started).toISOString(),
    ended_at: d.ended_ms ? new Date(d.ended_ms).toISOString() : null,
    duration_min: dur ?? 0,
    cause: d.cause ?? "",
    solution: d.solution ?? "",
    note: d.note ?? "",
    result,
    status: result === "done" ? "done" : "in_progress",
    repair_id: d.link_ticket ? d.ticket_offer?.id ?? null : null,
    ticket_code: d.link_ticket ? d.ticket_offer?.code ?? null : null,
    user_id: st.user_id,
    expires_at: Date.now() + TTL,
  };
  const dref = db.collection("drafts").doc();
  await dref.set(draft);
  await db.collection("drafts").doc("wiz_" + st.user_id).delete();
  const dept = await deptName(draft.department_id);
  const line = (k: string, v: string) => (v ? `\n• ${k}: ${v}` : "");
  return {
    text:
      "Kiểm tra lại nhật ký:" +
      line("Công việc", draft.title) + line("Loại", draft.category) +
      line("Thiết bị", draft.asset_code ? `${draft.asset_code} · ${draft.asset_name}` : "") +
      line("Phòng ban", dept) + line("Người yêu cầu", draft.requester_name) +
      line("Bắt đầu", fmtVN(started)) + line("Kết thúc", d.ended_ms ? fmtVN(d.ended_ms) : "") +
      line("Thời lượng", draft.duration_min ? `${draft.duration_min} phút` : "") +
      line("Nguyên nhân", draft.cause) + line("Hướng xử lý", draft.solution) +
      line("Kết quả", RESULTS[result]) + line("Ghi chú", draft.note) +
      line("Phiếu", draft.ticket_code ? `${draft.ticket_code}${result === "done" ? " (sẽ đóng phiếu)" : ""}` : "") +
      "\n\nGhi vào hệ thống?",
    buttons: [[btn("✅ Ghi", `ok:${dref.id}`), btn("❌ Huỷ", `no:${dref.id}`)]],
  };
}

/* ---------- vào / ra ---------- */
async function load(user: User): Promise<State | null> {
  const s = await ref(user).get();
  if (!s.exists) return null;
  const st = s.data() as State;
  if (Date.now() > st.expires_at) { await ref(user).delete(); return null; }
  return st;
}
export const wizardActive = async (user: User) => !!(await load(user));

export async function wizardStart(user: User): Promise<Reply> {
  if (!IT_ROLES.includes(user.role)) return { text: "Ghi nhật ký dành cho vai trò IT/Admin." };
  const st: State = { kind: "wizard", user_id: user.id, step: "title", data: {}, expires_at: Date.now() + TTL };
  await ref(user).set(st);
  return prompt(st);
}
export async function wizardCancel(user: User): Promise<string> {
  const had = await load(user);
  await ref(user).delete();
  return had ? "Đã huỷ nhật ký đang nhập." : "Bạn không có nhật ký nào đang nhập.";
}

async function accept(st: State, step: Step, value: Record<string, any>, ack: string): Promise<WizardOut> {
  Object.assign(st.data, value);
  return { ack, next: await advance(st, step) };
}

/** Bấm nút (callback_data bắt đầu bằng "w:"). */
export async function wizardCallback(user: User, data: string): Promise<WizardOut> {
  const st = await load(user);
  if (!st) return { ack: "Phiên nhập nhật ký đã hết hạn. Gõ /nhatky để bắt đầu lại." };
  const [, kind, arg] = data.split(":");
  const s = st.step;
  if (kind === "skip") {
    if (!OPTIONAL.includes(s)) return { next: prompt(st) };
    return { ack: "⏭ Bỏ qua", next: await advance(st, s) };
  }
  if (kind === "cat" && s === "category") { const c = CATS[+arg]; if (!c) return {}; return accept(st, s, { category: c }, `✓ Loại: ${c}`); }
  if (kind === "res" && s === "result") { if (!RESULTS[arg]) return {}; return accept(st, s, { result: arg }, `✓ Kết quả: ${RESULTS[arg]}`); }
  if (kind === "st" && s === "start") { const ms = Date.now() - (+arg || 0) * 60000; return accept(st, s, { started_ms: ms }, `✓ Bắt đầu: ${fmtVN(ms)}`); }
  if (kind === "en" && s === "end" && arg === "now") { const ms = Date.now(); if (ms < (st.data.started_ms ?? 0)) return { next: { text: "Giờ kết thúc phải sau giờ bắt đầu." } }; return accept(st, s, { ended_ms: ms }, `✓ Kết thúc: ${fmtVN(ms)}`); }
  if (kind === "tk" && s === "ticket") { return accept(st, s, { link_ticket: arg === "1" }, arg === "1" ? `✓ Liên kết phiếu ${st.data.ticket_offer.code}` : "✓ Không liên kết phiếu"); }
  if (kind === "ast" && s === "asset") {
    const a = (await db.collection("assets").doc(arg).get()).data();
    if (!a || a._del) return { ack: "Không thấy tài sản." };
    return pickAsset(st, { ...a, id: arg });
  }
  if (kind === "dep" && s === "dept") { const c = st.cands?.[+arg]; if (!c) return {}; return accept(st, s, { department_id: c.id }, `✓ Phòng ban: ${c.name}`); }
  return { next: prompt(st) };
}

async function pickAsset(st: State, a: any): Promise<WizardOut> {
  st.data.asset_id = a.id; st.data.asset_code = a.code; st.data.asset_name = a.name;
  if (a.department_id) st.data.department_id = a.department_id;
  const open = (await getOpenTickets(a.id)).filter((r) => r.status === "pending_it");
  if (open.length === 1) st.data.ticket_offer = { id: open[0].id, code: open[0].ticket_code ?? open[0].id, desc: String(open[0].description ?? "").slice(0, 80) };
  const dept = await deptName(a.department_id);
  return { ack: `✓ Thiết bị: ${a.code} · ${a.name}${dept ? ` (${dept})` : ""}`, next: await advance(st, "asset") };
}

/** Tin nhắn chữ trong lúc đang nhập. */
export async function wizardText(user: User, text: string): Promise<Reply> {
  const st = await load(user);
  if (!st) return { text: "Phiên nhập nhật ký đã hết hạn. Gõ /nhatky để bắt đầu lại." };
  const s = st.step, t = text.trim();
  const skip = /^(\/boqua|\/skip|-)$/i.test(t);
  if (skip) {
    if (!OPTIONAL.includes(s)) return { text: "Câu này bắt buộc.", buttons: undefined };
    return advance(st, s);
  }
  const done = async (value: Record<string, any>) => (await accept(st, s, value, "")).next!;
  switch (s) {
    case "title": return done({ title: t.slice(0, 200) });
    case "category": {
      const i = CATS.findIndex((c) => norm(c).includes(norm(t)) || norm(t).includes(norm(c)));
      return i >= 0 ? done({ category: CATS[i] }) : { text: "Hãy bấm một nút loại công việc ở trên.", buttons: rowsOf(CATS.map((c, k) => btn(c, `w:cat:${k}`)), 2) };
    }
    case "asset": {
      const found = await findAssets(t);
      if (!found.length) return { text: `Không thấy thiết bị “${t}”. Nhập lại mã/tên hoặc bấm Bỏ qua.`, buttons: [SKIP] };
      if (found.length === 1) return (await pickAsset(st, found[0])).next!;
      return { text: "Có nhiều kết quả, chọn thiết bị:", buttons: found.slice(0, 5).map((a) => [btn(`${a.code} · ${String(a.name).slice(0, 30)}`, `w:ast:${a.id}`)]) };
    }
    case "ticket": return { text: "Hãy bấm Có hoặc Không.", buttons: prompt(st).buttons };
    case "dept": {
      const q = norm(t), all = await listDepartments();
      const hit = all.filter((d) => norm(d.name).includes(q));
      if (!hit.length) return { text: `Không thấy phòng ban “${t}”. Gõ lại một phần tên hoặc bấm Bỏ qua.`, buttons: [SKIP] };
      if (hit.length === 1) return done({ department_id: hit[0].id });
      st.cands = hit.slice(0, 8);
      st.expires_at = Date.now() + TTL;
      await db.collection("drafts").doc("wiz_" + st.user_id).set(st);
      return { text: "Chọn phòng ban:", buttons: st.cands.map((d, i) => [btn(d.name.slice(0, 40), `w:dep:${i}`)]) };
    }
    case "requester": return done({ requester_name: t.slice(0, 100) });
    case "start": {
      const ms = parseWhen(t);
      if (ms === null) return { text: "Chưa hiểu giờ. Gõ dạng 14:30 hoặc 28/10 14:30, hoặc bấm nút.", buttons: prompt(st).buttons };
      return done({ started_ms: ms });
    }
    case "end": {
      const start = st.data.started_ms as number;
      const dur = /[:/]/.test(t) ? null : parseDur(t);
      if (dur !== null) return done({ duration_min: dur, ended_ms: start + dur * 60000 });
      let ms = parseWhen(t);
      if (ms !== null && ms < start && ms + 86400000 > start && !/\//.test(t)) ms += 86400000; // qua nửa đêm
      if (ms === null) return { text: "Chưa hiểu. Gõ giờ kết thúc (15:15) hoặc thời lượng (45 phút, 1h30p).", buttons: prompt(st).buttons };
      if (ms < start) return { text: "Giờ kết thúc phải sau giờ bắt đầu. Gõ lại.", buttons: prompt(st).buttons };
      return done({ ended_ms: ms });
    }
    case "cause": return done({ cause: t.slice(0, 1000) });
    case "solution": return done({ solution: t.slice(0, 1000) });
    case "result": return { text: "Hãy bấm một nút kết quả.", buttons: prompt(st).buttons };
    case "note": return done({ note: t.slice(0, 1000) });
  }
}
