#!/usr/bin/env node
// Chuyển file Excel ngân hàng (FA0203, CC0203, RS-CCDC-TSCD...) thành file backup JSON
// để nạp bằng scripts/import-backup.mjs. Chạy hoàn toàn trên máy bạn, không gửi dữ liệu đi đâu.
//
//   node scripts/excel-to-backup.mjs <ra.json> <file1.xlsx> [file2.xlsx ...]
//
// - Nhận file nhiều sheet (DS_PhongBan, Mã nhóm dùng làm nguồn tên chuẩn).
// - Id bản ghi sinh theo mã nên chạy lại nhiều lần vẫn an toàn (ghi đè, không nhân đôi).
// - Nhiều file: mã trùng thì file đứng sau thắng. Không tạo tài khoản người dùng (giữ nguyên tài khoản đang có).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) {
  console.error("Cách dùng: node scripts/excel-to-backup.mjs <ra.json> <file1.xlsx> [file2.xlsx ...]");
  process.exit(2);
}

// Nạp bộ đọc Excel/ZIP/thuật toán nhập (cùng mã với giao diện) vào một sandbox.
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "lib", "vtb-engine.html"), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Store { constructor() { this.m = {}; } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } removeItem(k) { delete this.m[k]; } }
const sb = {
  console, localStorage: new Store(),
  document: { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, click() {} }), body: { appendChild() {}, removeChild() {} } },
  Blob, Response, DecompressionStream, CompressionStream, TextDecoder, TextEncoder, Uint8Array, DataView, ArrayBuffer,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"), atob: (s) => Buffer.from(s, "base64").toString("binary"),
  URL: { createObjectURL: () => "", revokeObjectURL() {} }, module: { exports: {} }, setTimeout, clearTimeout,
};
sb.window = sb; sb.global = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(code, sb, { filename: "vtb-engine" });
const api = sb.module.exports;

const noDia = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const slug = (s) => noDia(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "x";
const iso = (d) => {
  if (!d) return null;
  if (typeof d === "string") {
    const vn = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
    if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
  }
  if (d instanceof Date && !isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
};

const now = new Date().toISOString();
const depts = new Map(), cats = new Map(), assets = new Map();
let skippedJunk = 0;

for (const f of files) {
  const buf = fs.readFileSync(f);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const res = await api.runBankImport(ab);
  console.log(`${path.basename(f)}: ${res.rows.length} dòng (${res.sheetSummary.join("; ")}), tham chiếu: ${res.deptRefCount} phòng ban, ${res.catRefCount} nhóm`);
  for (const r of res.rows) {
    // Bỏ dòng tổng cộng / dòng không phải mã tài sản (mã thật luôn có chữ số và dấu chấm hoặc gạch)
    if (/tổng|total/i.test(r.code) || !/\d/.test(r.code) || !/^[0-9A-Za-z]+[.\-][0-9A-Za-z.\-]+$/.test(r.code)) { skippedJunk++; continue; }
    const dname = (r.dept && r.dept.name) || "(Không xác định)";
    const did = "dept_" + slug(dname);
    if (!depts.has(did)) depts.set(did, { id: did, code: (r.dept && r.dept.rawKey) || did, name: dname });
    let cid = null;
    if (r.category && r.category.code) {
      cid = "cat_" + slug(r.category.code);
      if (!cats.has(cid)) cats.set(cid, { id: cid, code: String(r.category.code).toUpperCase(), name: r.category.name || r.category.code });
    }
    const id = "a_" + slug(r.code);
    assets.set(id, {
      id, code: r.code, name: r.name || "(Chưa đặt tên)", category_id: cid,
      original_value: r.nguyenGia || 0, remaining_value: r.giaTriConLai || 0,
      recorded_date: iso(r.ngayGhiNhan), status: "in_use", status_changed_at: now,
      department_id: did, address: dname, current_user_id: null,
      kind: r.type === "TSCD" ? "asset" : "ccdc", created_at: now, updated_at: now,
    });
  }
}

const backup = {
  version: 3, exported_at: now, _source: files.map((f) => path.basename(f)),
  departments: [...depts.values()], categories: [...cats.values()], users: [],
  assets: [...assets.values()], assetHistory: [], transfers: [], repairs: [],
  inventoryChecks: [], inventoryLines: [], worklogs: [], templateConfig: {},
};
fs.writeFileSync(out, JSON.stringify(backup));
const kinds = backup.assets.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {});
console.log(`\nBỏ qua ${skippedJunk} dòng tổng cộng/không phải mã tài sản.`);
console.log(`Đã ghi ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB): ${backup.assets.length} tài sản (${JSON.stringify(kinds)}), ${backup.departments.length} phòng ban, ${backup.categories.length} nhóm.`);
console.log("Bước tiếp: node scripts/import-backup.mjs https://<địa-chỉ-vercel> <ADMIN_KEY> " + out);
