#!/usr/bin/env node
// Nạp file Backup của 704-assets bản offline lên máy chủ, TỰ CHIA NHỎ thành nhiều lô.
// Lý do: Vercel giới hạn thân yêu cầu ~4,5 MB; file backup thật (kèm lịch sử, mẫu biểu) có thể lớn hơn.
// Nạp lại nhiều lần vẫn an toàn: máy chủ ghi đè theo id, không xoá bản ghi nào.
//
//   node scripts/import-backup.mjs <URL> <ADMIN_KEY> <file-backup.json> [--chunk-kb 2500]
import fs from "node:fs";

const [url, key, file, ...rest] = process.argv.slice(2);
if (!url || !key || !file) {
  console.error("Cách dùng: node scripts/import-backup.mjs <URL> <ADMIN_KEY> <file-backup.json> [--chunk-kb 2500]");
  process.exit(2);
}
const ci = rest.indexOf("--chunk-kb");
const LIMIT = (ci >= 0 ? Number(rest[ci + 1]) || 2500 : 2500) * 1024;
const endpoint = url.replace(/\/+$/, "") + "/api/admin/import-backup";

let raw = fs.readFileSync(file, "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const b = JSON.parse(raw);
if (!Array.isArray(b.users) || !Array.isArray(b.assets)) {
  console.error("File không đúng chuẩn backup của 704-assets (thiếu users/assets).");
  process.exit(2);
}

const ARRAYS = ["departments", "categories", "users", "assets", "assetHistory", "transfers", "repairs", "inventoryChecks", "inventoryLines", "worklogs", "locations", "accessories", "software"];
const size = (x) => Buffer.byteLength(JSON.stringify(x));

// Gom thành các lô; lô nào cũng có users/assets (có thể rỗng) để qua kiểm tra của máy chủ
const chunks = [];
let cur = null;
const fresh = () => ({ users: [], assets: [], templateConfig: {}, _size: 0 });
const flush = () => { if (cur && cur._size > 0) chunks.push(cur); cur = fresh(); };
cur = fresh();
for (const k of ARRAYS) {
  for (const item of b[k] || []) {
    const n = size(item) + 2;
    if (cur._size + n > LIMIT) flush();
    (cur[k] = cur[k] || []).push(item);
    cur._size += n;
  }
}
for (const [k, v] of Object.entries(b.templateConfig || {})) {
  const n = size(v) + k.length + 8;
  if (cur._size + n > LIMIT) flush();
  cur.templateConfig[k] = v;
  cur._size += n;
}
flush();

console.log(`Đọc ${file}: ${(Buffer.byteLength(raw) / 1024).toFixed(0)} KB → ${chunks.length} lô (≤ ${Math.round(LIMIT / 1024)} KB/lô)`);
let usersWithoutPassword = 0;
const total = {};
for (let i = 0; i < chunks.length; i++) {
  const { _size, ...body } = chunks[i];
  const res = await fetch(endpoint, { method: "POST", headers: { "x-admin-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  let out = {};
  try { out = JSON.parse(text); } catch { /* không phải JSON */ }
  if (!res.ok || !out.ok) {
    console.error(`Lô ${i + 1}/${chunks.length} LỖI (HTTP ${res.status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(out.imported || {})) total[k] = (total[k] || 0) + v;
  usersWithoutPassword += out.usersWithoutPassword || 0;
  console.log(`  lô ${i + 1}/${chunks.length} ✓ (${(_size / 1024).toFixed(0)} KB)`);
}
console.log("Đã nạp:", Object.entries(total).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", "));
if (usersWithoutPassword) console.log(`⚠️  ${usersWithoutPassword} tài khoản chưa có mật khẩu: admin cần đặt lại thì họ mới đăng nhập được.`);
console.log("Xong. Nhớ đổi mật khẩu mẫu (123456) của các tài khoản cũ.");
