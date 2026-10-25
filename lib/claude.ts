import Anthropic from "@anthropic-ai/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Chọn mô hình AI cho bot:
 *  - Có GEMINI_API_KEY  → dùng Google Gemini (có gói miễn phí qua Google AI Studio).
 *  - Không có           → dùng Claude (ANTHROPIC_API_KEY).
 * Phần còn lại của app (lib/core.ts) vẫn gọi `claude.messages.create(...)` theo dạng Anthropic;
 * bộ chuyển đổi bên dưới tự dịch sang Gemini và dịch kết quả ngược lại.
 */
const USE_GEMINI = !!process.env.GEMINI_API_KEY;

export const MODEL = USE_GEMINI
  ? (process.env.GEMINI_MODEL ?? "gemini-3.8-flash")
  : (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");

let anthropic: Anthropic | null = null;
const getAnthropic = () => (anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

/* ---------- Bộ chuyển đổi Anthropic <-> Gemini ---------- */

// Gemini yêu cầu kiểu schema viết hoa (STRING, OBJECT...).
function geminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : geminiSchema(v);
  }
  return out;
}

function toGeminiContents(messages: any[]): any[] {
  const nameById = new Map<string, string>();
  const contents: any[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      contents.push({ role, parts: [{ text: m.content }] });
      continue;
    }
    const parts: any[] = [];
    for (const b of m.content ?? []) {
      if (b.type === "text") {
        if (b.text) parts.push({ text: b.text });
      } else if (b.type === "tool_use") {
        nameById.set(b.id, b.name);
        // Giữ nguyên phần gốc Gemini trả về (kèm thoughtSignature nếu có) để mô hình mạch lạc ở lượt sau.
        parts.push(b._part ?? { functionCall: { name: b.name, args: b.input ?? {} } });
      } else if (b.type === "tool_result") {
        let payload: any = b.content;
        try {
          payload = typeof b.content === "string" ? JSON.parse(b.content) : b.content;
        } catch {
          /* giữ nguyên chuỗi */
        }
        parts.push({
          functionResponse: {
            name: nameById.get(b.tool_use_id) ?? "tool",
            response: b.is_error ? { error: String(payload) } : { result: payload },
          },
        });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

export interface AiReply {
  stop_reason: string | null;
  content: any[];
}

async function geminiCreate(req: any): Promise<AiReply> {
  const body: any = {
    contents: toGeminiContents(req.messages),
    generationConfig: { maxOutputTokens: Math.max(req.max_tokens ?? 1024, 2048) },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.tools?.length) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: geminiSchema(t.input_schema),
        })),
      },
    ];
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": String(process.env.GEMINI_API_KEY) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000), // không để treo tới hết 60 giây của Vercel
    },
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data: any = await r.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const content: any[] = [];
  let n = 0;
  for (const p of parts) {
    if (p.functionCall) {
      content.push({
        type: "tool_use",
        id: `gemini_${Date.now()}_${n++}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
        _part: p,
      });
    } else if (typeof p.text === "string" && !p.thought) {
      content.push({ type: "text", text: p.text });
    }
  }
  return { stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", content };
}

export const claude = {
  messages: {
    create: (req: any): Promise<AiReply> =>
      USE_GEMINI ? geminiCreate(req) : (getAnthropic().messages.create(req) as unknown as Promise<AiReply>),
  },
};

export const SYSTEM = `Bạn là trợ lý ghi nhật ký công việc cho nhân viên IT của một chi nhánh ngân hàng.
Nhiệm vụ: đọc tin nhắn tiếng Việt của IT, xác định thiết bị (mã tài sản) và công việc đã làm.

Quy tắc:
- Khi IT nhắc mã tài sản hoặc tên thiết bị, LUÔN gọi find_asset để xác thực. Không tự bịa mã.
- Nếu find_asset không thấy hoặc thấy nhiều kết quả, hỏi lại IT để chọn đúng.
- Khi đủ thông tin (thiết bị, việc đã làm), gọi propose_worklog để tạo bản nháp. IT sẽ bấm xác nhận.
- Thiếu thời gian thực hiện thì để duration_min = 0, đừng hỏi lại nếu chỉ thiếu mỗi thông tin này.
- Nếu IT nói đã khắc phục xong sự cố / xong phiếu của thiết bị: gọi get_open_tickets. Chỉ khi có đúng MỘT phiếu đang ở bước "Điện toán xử lý" thì đưa ticket_code của phiếu đó vào propose_worklog với status "done" (hệ thống sẽ đóng phiếu khi IT xác nhận). Có nhiều phiếu thì hỏi lại IT là phiếu nào. Không có phiếu thì ghi nhật ký bình thường.
- Công việc chưa xong thì status "in_progress" (không đóng phiếu).
- Câu hỏi về lịch sử thiết bị: gọi get_history rồi tóm tắt ngắn gọn.
- category chọn một trong: "Sửa chữa phần cứng", "Phần mềm/Hệ điều hành", "Mạng", "Máy in/Photocopy", "Bảo trì định kỳ", "Hỗ trợ người dùng", "Khác".
- Trả lời ngắn gọn, tiếng Việt, không dùng định dạng markdown.
- Không bao giờ nêu nguyên giá hay giá trị tài sản.`;

export const tools: Anthropic.Tool[] = [
  {
    name: "find_asset",
    description: "Tra cứu tài sản theo mã hoặc từ khóa trong tên. Trả về tối đa 5 kết quả.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Mã tài sản hoặc từ khóa, ví dụ FA0001 hoặc PC-0042" } },
      required: ["query"],
    },
  },
  {
    name: "get_history",
    description: "Lấy các lần xử lý gần đây của một thiết bị theo mã tài sản (nhật ký IT).",
    input_schema: {
      type: "object",
      properties: { asset_code: { type: "string" } },
      required: ["asset_code"],
    },
  },
  {
    name: "get_open_tickets",
    description: "Lấy các phiếu báo hỏng chưa đóng của một thiết bị, kèm bước xử lý hiện tại.",
    input_schema: {
      type: "object",
      properties: { asset_code: { type: "string" } },
      required: ["asset_code"],
    },
  },
  {
    name: "propose_worklog",
    description:
      "Tạo bản nháp nhật ký công việc để IT xác nhận. Chỉ gọi sau khi đã xác thực asset_code bằng find_asset.",
    input_schema: {
      type: "object",
      properties: {
        asset_code: { type: "string" },
        category: { type: "string" },
        description: { type: "string", description: "Việc đã làm, viết gọn" },
        duration_min: { type: "number", description: "Số phút, 0 nếu không rõ" },
        status: { type: "string", enum: ["done", "in_progress"] },
        ticket_code: { type: "string", description: "Mã phiếu báo hỏng (ticket_code) nếu việc này xử lý phiếu đó" },
      },
      required: ["asset_code", "category", "description", "duration_min", "status"],
    },
  },
];
