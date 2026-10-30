import type Anthropic from "@anthropic-ai/sdk";
import { db, startOfTodayVN } from "./firebase";
import { claude, MODEL, SYSTEM, tools } from "./claude";
import { assetView, deptName } from "./lookup";
import { mirrorWorkLog } from "./sheets";
import { bumpRev, OPEN_REPAIR_STATUSES, REPAIR_LABELS, tokenize, uid } from "./store";
import type { Reply, Repair, User, WebAsset } from "./types";

const IT_ROLES = ["admin", "it"];
const nowIso = () => new Date().toISOString();

/* ---------- Tra cứu tài sản / phiếu (dữ liệu dùng chung với giao diện 704-assets) ---------- */

const asAsset = (d: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) =>
  ({ ...(d.data() as object), id: d.id }) as WebAsset;

export async function findAssets(query: string): Promise<WebAsset[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. Khớp đúng mã tài sản
  const found = new Map<string, WebAsset>();
  for (const code of new Set([q, q.toUpperCase()])) {
    const snap = await db.collection("assets").where("code", "==", code).limit(5).get();
    snap.docs.filter((d) => !d.data()._del).forEach((d) => found.set(d.id, asAsset(d)));
  }
  if (found.size) return [...found.values()].slice(0, 5);

  // 2. Từ khoá trong tên (mảng _kw do máy chủ tạo khi ghi tài sản)
  const tokens = tokenize(q).sort((a, b) => b.length - a.length);
  if (!tokens.length) return [];
  const snap = await db.collection("assets").where("_kw", "array-contains", tokens[0]).limit(30).get();
  let list = snap.docs.filter((d) => !d.data()._del).map(asAsset);
  for (const t of tokens.slice(1)) {
    const narrowed = list.filter((a) => a._kw?.includes(t));
    if (narrowed.length) list = narrowed;
  }
  return list.slice(0, 5);
}

async function getAssetByCode(code: string): Promise<WebAsset | null> {
  const c = code.trim();
  for (const x of new Set([c, c.toUpperCase()])) {
    const snap = await db.collection("assets").where("code", "==", x).limit(3).get();
    const d = snap.docs.find((s) => !s.data()._del);
    if (d) return asAsset(d);
  }
  return null;
}

export async function getHistory(assetId: string, limit = 10) {
  const snap = await db.collection("worklogs").where("asset_id", "==", assetId).get();
  return snap.docs
    .map((d) => d.data())
    .filter((l) => !l._del)
    .sort((a, b) => (b.ts_ms ?? 0) - (a.ts_ms ?? 0))
    .slice(0, limit)
    .map((l) => ({
      id: l.id as string,
      date: new Date((l.ts_ms ?? 0) + 7 * 3600 * 1000).toISOString().slice(0, 10),
      it_user: l.it_user as string,
      category: l.category as string,
      description: l.description as string,
      duration_min: (l.duration_min as number) ?? 0,
    }));
}

export function formatHistory(code: string, rows: Awaited<ReturnType<typeof getHistory>>): string {
  if (!rows.length) return `Chưa có lịch sử xử lý cho ${code}.`;
  const lines = rows.map((r) => `• ${r.date} · ${r.description} (${r.it_user}, ${r.duration_min}ph)`);
  const warn =
    rows.length >= 3 ? "\n⚠️ Thiết bị đã xử lý từ 3 lần trở lên, cân nhắc đề xuất thay thế/thanh lý." : "";
  return `Lịch sử ${code}:\n${lines.join("\n")}${warn}`;
}

export async function getOpenTickets(assetId: string): Promise<Repair[]> {
  const snap = await db.collection("repairs").where("asset_id", "==", assetId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as object), id: d.id }) as Repair)
    .filter((r) => !r._del && OPEN_REPAIR_STATUSES.includes(r.status));
}

/** Phiếu đang chờ Điện toán xử lý: của mình hoặc chưa phân công. */
export async function myTickets(user: User): Promise<string> {
  const snap = await db.collection("repairs").where("status", "==", "pending_it").get();
  const mine = snap.docs
    .map((d) => ({ ...(d.data() as object), id: d.id }) as Repair)
    .filter((r) => !r._del && (!r.it_id || r.it_id === user.id))
    .slice(0, 10);
  if (!mine.length) return "Không có phiếu nào đang chờ Điện toán xử lý.";
  const refs = mine.map((r) => db.collection("assets").doc(r.asset_id));
  const assets = await db.getAll(...refs);
  const lines = mine.map((r, i) => {
    const a = assets[i].data();
    return `• ${r.ticket_code ?? r.id} · ${a?.code ?? "?"} ${a?.name ?? ""} · ${r.description ?? ""}`;
  });
  return `Phiếu chờ Điện toán xử lý (${mine.length}):\n${lines.join("\n")}`;
}

export async function todaySummary(user: User): Promise<string> {
  const snap = await db.collection("worklogs").where("ts_ms", ">=", startOfTodayVN()).get();
  const mine = snap.docs.map((d) => d.data()).filter((l) => !l._del && l.it_user_id === user.id);
  if (!mine.length) return "Hôm nay bạn chưa ghi nhật ký nào.";
  const total = mine.reduce((s, l) => s + (l.duration_min || 0), 0);
  const lines = mine.map((l) => `• ${l.asset_code} · ${l.description} (${l.duration_min}ph)`);
  return `Hôm nay bạn đã ghi ${mine.length} việc, tổng ${total} phút:\n${lines.join("\n")}`;
}

/* ---------- Xử lý tin nhắn tự nhiên (kênh chat nào cũng gọi được) ---------- */

export async function handleText(user: User, text: string): Promise<Reply> {
  if (!IT_ROLES.includes(user.role)) {
    return { text: "Tài khoản của bạn chỉ dùng được các lệnh /lichsu, /phieu và /homnay. Ghi nhật ký dành cho vai trò IT/Admin." };
  }
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `[IT: ${user.full_name}] ${text}` }];

  for (let i = 0; i < 6; i++) {
    const res = await claude.messages.create({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools, messages });

    if (res.stop_reason !== "tool_use") {
      const out = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return { text: out || "Mình chưa hiểu rõ, bạn nói cụ thể hơn giúp nhé." };
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      const ok = (content: unknown) =>
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(content) });
      const fail = (msg: string) =>
        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: msg });

      if (block.name === "find_asset") {
        const list = await findAssets(String(input.query ?? ""));
        ok(await Promise.all(list.map(assetView)));
      } else if (block.name === "get_history") {
        const a = await getAssetByCode(String(input.asset_code ?? ""));
        a ? ok(await getHistory(a.id)) : fail("Không thấy tài sản này.");
      } else if (block.name === "get_open_tickets") {
        const a = await getAssetByCode(String(input.asset_code ?? ""));
        if (!a) fail("Không thấy tài sản này.");
        else {
          const open = await getOpenTickets(a.id);
          ok(
            open.map((r) => ({
              ticket_code: r.ticket_code ?? r.id,
              issue: r.description,
              stage: REPAIR_LABELS[r.status] ?? r.status,
            })),
          );
        }
      } else if (block.name === "propose_worklog") {
        const a = await getAssetByCode(String(input.asset_code ?? ""));
        if (!a) {
          fail(`Không có tài sản ${String(input.asset_code)}. Hãy hỏi IT mã đúng.`);
          continue;
        }
        let repair: Repair | null = null;
        const tc = input.ticket_code ? String(input.ticket_code).trim() : "";
        if (tc) {
          const snap = await db.collection("repairs").where("ticket_code", "==", tc).limit(3).get();
          const d = snap.docs.find((x) => !x.data()._del);
          repair = d ? ({ ...(d.data() as object), id: d.id } as Repair) : null;
          if (!repair || repair.asset_id !== a.id) {
            fail(`Phiếu ${tc} không tồn tại hoặc không thuộc thiết bị ${a.code}.`);
            continue;
          }
        }
        const draft = {
          asset_id: a.id,
          asset_code: a.code,
          asset_name: a.name,
          department_id: a.department_id ?? null,
          category: String(input.category ?? "Khác"),
          description: String(input.description ?? ""),
          duration_min: Number(input.duration_min) || 0,
          status: input.status === "in_progress" ? "in_progress" : "done",
          repair_id: repair?.id ?? null,
          ticket_code: repair ? (repair.ticket_code ?? repair.id) : null,
        };
        const ref = db.collection("drafts").doc();
        await ref.set({ ...draft, user_id: user.id, expires_at: Date.now() + 30 * 60 * 1000 });
        const dept = await deptName(a.department_id);
        return {
          text:
            `Ghi nhận:\n• Thiết bị: ${a.code} · ${a.name}${dept ? ` (${dept})` : ""}` +
            `\n• Loại: ${draft.category}\n• Việc: ${draft.description}` +
            `\n• Thời gian: ${draft.duration_min} phút\n• Trạng thái: ${draft.status === "done" ? "Hoàn thành" : "Đang xử lý"}` +
            (draft.ticket_code ? `\n• Phiếu: ${draft.ticket_code}${draft.status === "done" ? " (sẽ đóng phiếu)" : ""}` : "") +
            `\nĐúng không?`,
          buttons: [
            { text: "✅ Ghi", data: `ok:${ref.id}` },
            { text: "❌ Huỷ", data: `no:${ref.id}` },
          ],
        };
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Mình xử lý chưa xong, bạn thử nhắn lại ngắn gọn hơn nhé." };
}

/* ---------- Bấm nút ✅/❌ trên bản nháp ---------- */

export async function handleCallback(user: User, data: string): Promise<string> {
  const [action, draftId] = data.split(":");
  if (!draftId) return "Nút không hợp lệ.";
  const ref = db.collection("drafts").doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) return "Bản nháp không còn (đã ghi hoặc hết hạn).";
  const d0 = snap.data()!;
  if (d0.user_id !== user.id) return "Bản nháp này của người khác.";

  if (action === "no") {
    await ref.delete();
    return "Đã huỷ.";
  }
  if (Date.now() > d0.expires_at) {
    await ref.delete();
    return "Bản nháp đã hết hạn, bạn nhắn lại giúp mình nhé.";
  }

  const counterRef = db.collection("counters").doc("worklog");

  // Một giao dịch: sinh mã, ghi nhật ký, (nếu có) đóng phiếu + trả tài sản về "Đang sử dụng" + ghi lịch sử hồ sơ 360°.
  // Làm giống hệt thao tác "IT khắc phục xong" trên giao diện 704-assets.
  const result = await db.runTransaction(async (tx) => {
    const [c, dSnap] = await Promise.all([tx.get(counterRef), tx.get(ref)]);
    if (!dSnap.exists) return null; // đã ghi (bấm đúp)
    const d = dSnap.data()!;
    const repairRef = d.repair_id ? db.collection("repairs").doc(d.repair_id as string) : null;
    const repairSnap = repairRef ? await tx.get(repairRef) : null;

    const canClose =
      d.status === "done" &&
      !!repairSnap?.exists &&
      repairSnap.data()!.status === "pending_it" &&
      IT_ROLES.includes(user.role);

    const ms = Date.now();
    const iso = nowIso();
    const n = ((c.data()?.n as number) ?? 0) + 1;
    const logId = `WL-${String(n).padStart(4, "0")}`;
    const meta = { _u: ms, _del: false };

    tx.set(counterRef, { n });
    tx.set(db.collection("worklogs").doc(logId), {
      id: logId,
      ts_ms: typeof d.started_ms === "number" ? d.started_ms : ms,
      created_at: iso,
      source: "telegram",
      it_user_id: user.id,
      it_user: user.full_name,
      asset_id: d.asset_id,
      asset_code: d.asset_code,
      asset_name: d.asset_name,
      department_id: d.department_id ?? null,
      category: d.category,
      description: d.description,
      duration_min: d.duration_min,
      status: d.status,
      repair_id: d.repair_id ?? null,
      ticket_code: d.ticket_code ?? null,
      // Các trường khai báo theo biểu mẫu (cùng bộ trường với form Nhật ký IT trên web)
      title: d.title ?? d.description,
      requester_name: d.requester_name ?? "",
      requester_id: d.requester_id ?? null,
      reported_at: d.reported_at ?? null,
      serial: d.serial ?? "",
      started_at: d.started_at ?? null,
      ended_at: d.ended_at ?? null,
      cause: d.cause ?? "",
      solution: d.solution ?? "",
      result: d.result ?? (d.status === "done" ? "done" : "doing"),
      note: d.note ?? "",
      ...meta,
    });
    if (d.asset_id) {
      const hid = uid();
      tx.set(db.collection("assetHistory").doc(hid), {
        id: hid,
        asset_id: d.asset_id,
        event_type: "it_work",
        note: `IT ghi nhật ký (${d.category}): ${d.description}${d.duration_min ? ` — ${d.duration_min} phút` : ""}`,
        actor_id: user.id,
        created_at: iso,
        ...meta,
      });
    }

    if (canClose && repairRef && repairSnap) {
      const rp = repairSnap.data()!;
      tx.update(repairRef, {
        status: "completed",
        it_id: rp.it_id || user.id,
        it_at: iso,
        resolution_note: d.description,
        _u: ms,
      });
      tx.update(db.collection("assets").doc(d.asset_id as string), {
        status: "in_use",
        status_changed_at: iso,
        updated_at: iso,
        _u: ms,
      });
      const hid2 = uid();
      tx.set(db.collection("assetHistory").doc(hid2), {
        id: hid2,
        asset_id: d.asset_id,
        event_type: "status_change",
        note: `IT khắc phục xong phiếu ${d.ticket_code}: ${d.description} (qua chatbot Telegram). Tài sản quay về 'Đang sử dụng'.`,
        actor_id: user.id,
        created_at: iso,
        ...meta,
      });
    }
    tx.delete(ref);
    return {
      logId,
      closed: canClose,
      linkedStage: repairSnap?.exists ? (repairSnap.data()!.status as string) : null,
      d,
      iso,
    };
  });

  if (!result) return "Bản nháp này đã được ghi rồi.";
  await bumpRev();

  try {
    await mirrorWorkLog([
      result.logId,
      result.iso,
      user.full_name,
      result.d.asset_code,
      result.d.asset_name,
      await deptName(result.d.department_id as string | null),
      result.d.category,
      result.d.description,
      result.d.duration_min,
      result.d.status,
      result.d.ticket_code ?? "",
    ]);
  } catch (e) {
    console.error("Đồng bộ Google Sheet lỗi (không ảnh hưởng dữ liệu chính):", e);
  }

  if (result.closed) return `Đã ghi ${result.logId} và đóng phiếu ${result.d.ticket_code}. Tài sản đã về "Đang sử dụng".`;
  if (result.d.ticket_code && result.d.status === "done") {
    return `Đã ghi ${result.logId}. Phiếu ${result.d.ticket_code} đang ở bước "${REPAIR_LABELS[result.linkedStage ?? ""] ?? result.linkedStage}" nên chưa tự đóng; xử lý tiếp trên 704-assets.`;
  }
  return `Đã ghi ${result.logId}.`;
}
