// Bộ "Claude giả" cho chế độ DEMO cục bộ: hiểu một số mẫu câu tiếng Việt bằng quy tắc đơn giản.
// Nó nói đúng giao thức tool use như Claude thật (find_asset → get_open_tickets → propose_worklog),
// nên toàn bộ mã của bot (kiểm quyền, nháp, nút ✅, ghi Firestore, đóng phiếu) chạy THẬT.
// Bản triển khai thật dùng Claude nên hiểu được câu nói tự do hơn nhiều.

/* eslint-disable @typescript-eslint/no-explicit-any */
const CODE_RE = /\b(FA\d{3,5}|[A-Z]{2,3}-\d{3,5})\b/i;

const CATEGORY_RULES: [RegExp, string][] = [
  [/máy in|kẹt giấy|mực|toner|photocopy|trục cuốn/i, "Máy in/Photocopy"],
  [/switch|wifi|mạng|cáp mạng|router|cổng/i, "Mạng"],
  [/windows|cài lại|phần mềm|virus|office|driver|hệ điều hành/i, "Phần mềm/Hệ điều hành"],
  [/vệ sinh|bảo trì|định kỳ/i, "Bảo trì định kỳ"],
  [/hướng dẫn|hỗ trợ/i, "Hỗ trợ người dùng"],
  [/ram|ổ cứng|nguồn|main|quạt|bàn phím|chuột|màn hình|pin|sạc|thay|sửa/i, "Sửa chữa phần cứng"],
];

function guessCategory(t: string): string {
  return CATEGORY_RULES.find(([re]) => re.test(t))?.[1] ?? "Khác";
}

function guessMinutes(t: string): number {
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*(giờ|gio|h)\b/i);
  const m = t.match(/(\d+)\s*(phút|phut|ph|p)\b/i);
  return Math.round((h ? parseFloat(h[1].replace(",", ".")) * 60 : 0) + (m ? parseInt(m[1], 10) : 0));
}

function cleanDescription(t: string): string {
  let d = t
    .replace(new RegExp(CODE_RE.source, "gi"), " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(phút|phut|ph|p|giờ|gio|h)\b/gi, " ")
    .replace(/^\s*(đã\s+)?(xong|hoàn tất|hoàn thành)\b[\s,:;-]*/i, "")
    .replace(/\s+(đã\s+)?(xong|hoàn tất|hoàn thành)\s*[.,;]?\s*$/i, "")
    .replace(/\bmáy\s*(?=[,.;]|$)/gi, " ")
    .replace(/^\s*máy\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\s,;.:-]+$/, "")
    .replace(/^[\s,;.:-]+/, "")
    .trim();
  if (!d) d = t.trim();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

const isDone = (t: string) => /\b(xong|hoàn tất|hoàn thành|khắc phục)\b/i.test(t);
const isProgress = (t: string) => /chưa xong|đang (xử lý|làm)|làm dở|tiếp tục/i.test(t);

export function installFakeClaude() {
  (globalThis as any).__claude = async (req: any) => {
    const msgs: any[] = req.messages;
    const text = String(msgs[0].content).replace(/^\[IT:[^\]]*\]\s*/, "").trim();
    const last = msgs[msgs.length - 1];
    const call = (name: string, input: unknown) => ({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "fc" + msgs.length, name, input }],
    });
    const say = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

    const propose = (code: string, ticket?: string) =>
      call("propose_worklog", {
        asset_code: code,
        category: guessCategory(text),
        description: cleanDescription(text),
        duration_min: guessMinutes(text),
        status: isProgress(text) ? "in_progress" : "done",
        ...(ticket ? { ticket_code: ticket } : {}),
      });

    // Lượt đầu: có mã thiết bị thì tra cứu
    if (typeof last.content === "string") {
      const m = text.match(CODE_RE);
      if (!m) {
        return say("Mình chưa thấy mã thiết bị trong tin nhắn. Bạn cho mình mã tài sản (ví dụ FA0001 hoặc PC-0042) và việc đã làm nhé.");
      }
      return call("find_asset", { query: m[1] });
    }

    // Lượt sau: xử lý kết quả của tool vừa gọi
    const used = msgs[msgs.length - 2].content.find((b: any) => b.type === "tool_use");
    const res = last.content[0];
    if (res.is_error) return say(String(res.content));
    const payload = JSON.parse(res.content);

    if (used.name === "find_asset") {
      if (!payload.length) return say(`Mình không thấy thiết bị "${used.input.query}" trong sổ tài sản. Bạn kiểm tra lại mã giúp mình nhé.`);
      if (payload.length > 1) {
        return say("Có nhiều thiết bị khớp, bạn chọn giúp mình mã nào:\n" + payload.map((a: any) => `• ${a.code} · ${a.name}`).join("\n"));
      }
      const code = payload[0].code;
      if (isDone(text)) return call("get_open_tickets", { asset_code: code });
      return propose(code);
    }
    if (used.name === "get_open_tickets") {
      const code = used.input.asset_code;
      const atIt = payload.filter((t: any) => t.stage === "Điện toán xử lý");
      if (atIt.length === 1) return propose(code, atIt[0].ticket_code);
      if (atIt.length > 1) return say(`Thiết bị ${code} có ${atIt.length} phiếu đang chờ xử lý, bạn nói rõ phiếu nào nhé:\n` + atIt.map((t: any) => `• ${t.ticket_code} · ${t.issue}`).join("\n"));
      return propose(code);
    }
    return say("Mình chưa hiểu rõ, bạn nói cụ thể hơn giúp nhé.");
  };
}
