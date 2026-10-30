/* =========================================================
   QR CODE (offline) — bộ mã hoá QR byte-mode, mức sửa lỗi M, phiên bản 1–9 (tối đa ~179 byte).
   Dựa theo thuật toán chuẩn ISO/IEC 18004; không phụ thuộc thư viện ngoài.
   qrMatrix(text) -> mảng 2 chiều boolean (true = ô đen); qrSvg(text, px) -> chuỗi SVG.
   ========================================================= */
const QR_ECC_PER_BLOCK_M = [0,10,16,26,18,24,16,18,22,22,26];
const QR_BLOCKS_M        = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function qrAlignPos(ver){
  if(ver === 1) return [];
  const n = Math.floor(ver/7) + 2, size = ver*4 + 17;
  const step = Math.ceil((ver*4 + 4) / (n*2 - 2)) * 2;
  const res = [6];
  for(let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}
function qrRawModules(ver){
  let r = (16*ver + 128)*ver + 64;
  if(ver >= 2){
    const n = Math.floor(ver/7) + 2;
    r -= (25*n - 10)*n - 55;
    if(ver >= 7) r -= 36;
  }
  return r;
}
function qrDataCodewords(ver){ return Math.floor(qrRawModules(ver)/8) - QR_ECC_PER_BLOCK_M[ver]*QR_BLOCKS_M[ver]; }

/* Reed–Solomon trên GF(256), đa thức 0x11D */
function qrGfMul(x, y){ let z = 0; for(let i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function qrRsDivisor(deg){
  const r = new Array(deg).fill(0); r[deg-1] = 1; let root = 1;
  for(let i = 0; i < deg; i++){
    for(let j = 0; j < r.length; j++){ r[j] = qrGfMul(r[j], root); if(j+1 < r.length) r[j] ^= r[j+1]; }
    root = qrGfMul(root, 0x02);
  }
  return r;
}
function qrRsRemainder(data, div){
  const r = new Array(div.length).fill(0);
  data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= qrGfMul(c, f); }); });
  return r;
}

function qrUtf8(text){ return Array.from(new TextEncoder().encode(String(text))); }

function qrMatrix(text){
  const bytes = qrUtf8(text);
  let ver = 1;
  while(ver <= 9 && 4 + 8 + bytes.length*8 > qrDataCodewords(ver)*8) ver++;   // 4 bit chế độ + 8 bit độ dài (ver<10)
  if(ver > 9) throw new Error("Nội dung QR quá dài");
  const cap = qrDataCodewords(ver);
  // 1. Bit dữ liệu
  const bits = [];
  const put = (v, n) => { for(let i = n-1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap*8 - bits.length));
  while(bits.length % 8) bits.push(0);
  for(let pad = 0xEC; bits.length < cap*8; pad ^= 0xEC ^ 0x11) put(pad, 8);
  const data = [];
  for(let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i+8).join(""), 2));
  // 2. Chia khối + mã sửa lỗi, xen kẽ
  const nb = QR_BLOCKS_M[ver], eccLen = QR_ECC_PER_BLOCK_M[ver];
  const rawCw = Math.floor(qrRawModules(ver)/8);
  const shortBlocks = nb - rawCw % nb, shortLen = Math.floor(rawCw/nb);
  const div = qrRsDivisor(eccLen);
  const blocks = [];
  for(let i = 0, k = 0; i < nb; i++){
    const dl = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const d = data.slice(k, k + dl); k += dl;
    const e = qrRsRemainder(d, div);
    if(i < shortBlocks) d.push(0);          // chỗ trống để các khối thẳng hàng
    blocks.push(d.concat(e));
  }
  const all = [];
  for(let i = 0; i < blocks[0].length; i++){
    blocks.forEach((b, j) => { if(i !== shortLen - eccLen || j >= shortBlocks) all.push(b[i]); });
  }
  // 3. Vẽ hàm cố định
  const size = ver*4 + 17;
  const mod = Array.from({length:size}, () => new Array(size).fill(false));
  const fn  = Array.from({length:size}, () => new Array(size).fill(false));
  const setF = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };
  for(let i = 0; i < size; i++){ setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for(let dy = -4; dy <= 4; dy++) for(let dx = -4; dx <= 4; dx++){
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx+dx, y = cy+dy;
      if(x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size-4, 3); finder(3, size-4);
  const ap = qrAlignPos(ver);
  ap.forEach((ax, i) => ap.forEach((ay, j) => {
    if((i === 0 && j === 0) || (i === 0 && j === ap.length-1) || (i === ap.length-1 && j === 0)) return;
    for(let dy = -2; dy <= 2; dy++) for(let dx = -2; dx <= 2; dx++) setF(ax+dx, ay+dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const bch = (v, poly, bitsOut, hi) => { let r = v; for(let i = 0; i < hi; i++) r = (r << 1) ^ ((r >>> (bitsOut-1)) * poly); return r; };
  const drawFormat = mask => {
    const d = (0 << 3) | mask;                       // mức M = 00
    let rem = d; for(let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsF = ((d << 10) | rem) ^ 0x5412;
    const b = i => ((bitsF >>> i) & 1) !== 0;
    for(let i = 0; i <= 5; i++) setF(8, i, b(i));
    setF(8, 7, b(6)); setF(8, 8, b(7)); setF(7, 8, b(8));
    for(let i = 9; i < 15; i++) setF(14-i, 8, b(i));
    for(let i = 0; i < 8; i++) setF(size-1-i, 8, b(i));
    for(let i = 8; i < 15; i++) setF(8, size-15+i, b(i));
    setF(8, size-8, true);
  };
  drawFormat(0);
  if(ver >= 7){
    let rem = ver; for(let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const v = (ver << 12) | rem;
    for(let i = 0; i < 18; i++){
      const bit = ((v >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i/3);
      setF(a, bb, bit); setF(bb, a, bit);
    }
  }
  // 4. Đặt dữ liệu theo đường zig-zag
  let i = 0;
  for(let right = size-1; right >= 1; right -= 2){
    if(right === 6) right = 5;
    for(let vert = 0; vert < size; vert++) for(let j = 0; j < 2; j++){
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size-1-vert : vert;
      if(!fn[y][x] && i < all.length*8){ mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  // 5. Chọn mặt nạ tốt nhất theo điểm phạt
  const MASKS = [
    (x,y)=>(x+y)%2===0, (x,y)=>y%2===0, (x,y)=>x%3===0, (x,y)=>(x+y)%3===0,
    (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0, (x,y)=>x*y%2+x*y%3===0,
    (x,y)=>(x*y%2+x*y%3)%2===0, (x,y)=>((x+y)%2+x*y%3)%2===0 ];
  const apply = m => { for(let y = 0; y < size; y++) for(let x = 0; x < size; x++) if(!fn[y][x] && MASKS[m](x,y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0;
    const lines = [];
    for(let y = 0; y < size; y++){ lines.push(mod[y].slice()); }
    for(let x = 0; x < size; x++){ lines.push(mod.map(r => r[x])); }
    lines.forEach(l => {
      let run = 1;
      for(let k = 1; k < size; k++){ if(l[k] === l[k-1]){ run++; if(run === 5) p += 3; else if(run > 5) p++; } else run = 1; }
      const s = l.map(v => v ? "1" : "0").join("");
      const m1 = s.match(/1011101(?=0000)|(?<=0000)1011101/g); if(m1) p += 40*m1.length;
    });
    for(let y = 0; y < size-1; y++) for(let x = 0; x < size-1; x++){ const c = mod[y][x]; if(c === mod[y][x+1] && c === mod[y+1][x] && c === mod[y+1][x+1]) p += 3; }
    let dark = 0; mod.forEach(r => r.forEach(v => { if(v) dark++; }));
    p += Math.floor(Math.abs(dark*20 - size*size*10) / (size*size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for(let m = 0; m < 8; m++){ apply(m); drawFormat(m); const p = penalty(); if(p < bestP){ bestP = p; best = m; } apply(m); }
  apply(best); drawFormat(best);
  return mod;
}

/* SVG: chạy ngang (rect gộp theo hàng) để nhẹ; có viền trắng 4 ô theo chuẩn */
function qrSvg(text, px){
  let m;
  try{ m = qrMatrix(text); }catch(e){ return '<span class="text-muted small">QR lỗi</span>'; }
  const n = m.length, q = 4, t = n + q*2;
  let d = "";
  for(let y = 0; y < n; y++){
    let x = 0;
    while(x < n){
      if(m[y][x]){ let w = 1; while(x+w < n && m[y][x+w]) w++; d += `M${x+q} ${y+q}h${w}v1h-${w}z`; x += w; } else x++;
    }
  }
  const s = px ? ` width="${px}" height="${px}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}"${s} shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
