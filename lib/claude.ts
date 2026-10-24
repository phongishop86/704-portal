import Anthropic from "@anthropic-ai/sdk";

export const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

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
