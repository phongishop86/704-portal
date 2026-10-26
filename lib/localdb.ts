/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kho dữ liệu cục bộ cho chế độ NỘI BỘ (Windows Server, không cần Firebase).
 * Mô phỏng phần Firestore Admin mà dự án dùng: collection/doc/get/set/update/delete,
 * where(==,>,>=,<,<=,array-contains), orderBy, limit, startAfter, getAll, batch, runTransaction.
 * Dữ liệu giữ trong bộ nhớ, ghi xuống DATA_DIR/data.json (ghi nguyên tử, gộp nhịp 300 ms).
 */
import fs from "node:fs";
import path from "node:path";

type Data = Record<string, Record<string, any>>;

const dir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
const file = () => path.join(dir(), "data.json");

let data: Data = {};
let loaded = false;
let timer: NodeJS.Timeout | null = null;

function load() {
  if (loaded) return;
  loaded = true;
  fs.mkdirSync(dir(), { recursive: true });
  for (const f of [file(), file() + ".bak"]) {
    try {
      if (fs.existsSync(f)) {
        data = JSON.parse(fs.readFileSync(f, "utf8"));
        return;
      }
    } catch {
      /* thử bản sao dự phòng */
    }
  }
}

function flushNow() {
  timer = null;
  const FILE = file();
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  try {
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + ".bak");
  } catch {
    /* bỏ qua */
  }
  fs.renameSync(tmp, FILE);
}
function scheduleFlush() {
  if (!timer) timer = setTimeout(flushNow, 300);
}
process.on("exit", () => {
  if (timer) {
    try { flushNow(); } catch { /* */ }
  }
});
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (timer) { try { flushNow(); } catch { /* */ } }
    process.exit(0);
  });
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const strip = (o: any): any => {
  // bỏ undefined (tương đương ignoreUndefinedProperties)
  return JSON.parse(JSON.stringify(o ?? {}));
};
const col = (name: string) => (data[name] ??= {});
let idSeq = 0;
const newId = () => Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 8);

/* ---- khóa tuần tự cho giao dịch (một tiến trình Node duy nhất) ---- */
let chain: Promise<unknown> = Promise.resolve();

class Snap {
  constructor(public ref: DocRef, private _d: any | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this._d !== undefined; }
  data() { return this._d === undefined ? undefined : clone(this._d); }
  get(f: string) { return this._d?.[f]; }
}
class QSnap {
  constructor(public docs: Snap[]) {}
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
  forEach(fn: (s: Snap) => void) { this.docs.forEach(fn); }
}

class DocRef {
  constructor(public parent: string, public id: string) {}
  async get() { load(); return new Snap(this, data[this.parent]?.[this.id]); }
  async set(d: any, opts?: { merge?: boolean }) {
    load();
    const v = strip(d);
    col(this.parent)[this.id] = opts?.merge ? { ...(col(this.parent)[this.id] ?? {}), ...v } : v;
    scheduleFlush();
  }
  async update(d: any) {
    load();
    const cur = data[this.parent]?.[this.id];
    if (cur === undefined) throw new Error(`NOT_FOUND: ${this.parent}/${this.id}`);
    const v = strip(d);
    for (const [k, val] of Object.entries(v)) {
      // khóa dạng "a.b" cập nhật lồng nhau như Firestore
      if (k.includes(".")) {
        const parts = k.split(".");
        let o = cur;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ??= {};
        o[parts[parts.length - 1]] = val;
      } else cur[k] = val;
    }
    scheduleFlush();
  }
  async delete() {
    load();
    if (data[this.parent]) delete data[this.parent][this.id];
    scheduleFlush();
  }
}

type Cond = { f: string; op: string; v: any };
const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

class Query {
  constructor(
    protected name: string,
    protected conds: Cond[] = [],
    protected order: { f: string; dir: "asc" | "desc" }[] = [],
    protected lim = Infinity,
    protected after: any[] | null = null,
  ) {}
  protected with(p: Partial<{ conds: Cond[]; order: any[]; lim: number; after: any[] | null }>) {
    return new Query(this.name, p.conds ?? this.conds, p.order ?? this.order, p.lim ?? this.lim, p.after === undefined ? this.after : p.after);
  }
  where(f: string, op: string, v: any) { return this.with({ conds: [...this.conds, { f, op, v }] }); }
  orderBy(f: string, dir: "asc" | "desc" = "asc") { return this.with({ order: [...this.order, { f, dir }] }); }
  limit(n: number) { return this.with({ lim: n }); }
  startAfter(s: Snap | any) {
    const vals = s instanceof Snap ? this.order.map((o) => s.get(o.f)) : [s];
    return this.with({ after: vals });
  }
  async get() {
    load();
    let rows = Object.entries(col(this.name)).filter(([, d]) =>
      this.conds.every(({ f, op, v }) => {
        const x = d[f];
        switch (op) {
          case "==": return x === v;
          case "!=": return x !== v;
          case ">": return x !== undefined && x > v;
          case ">=": return x !== undefined && x >= v;
          case "<": return x !== undefined && x < v;
          case "<=": return x !== undefined && x <= v;
          case "array-contains": return Array.isArray(x) && x.includes(v);
          case "in": return Array.isArray(v) && v.includes(x);
          default: throw new Error("localdb: toán tử chưa hỗ trợ " + op);
        }
      }),
    );
    // Firestore loại tài liệu không có trường được orderBy
    for (const o of this.order) rows = rows.filter(([, d]) => d[o.f] !== undefined);
    rows.sort((a, b) => {
      for (const o of this.order) {
        const c = cmp(a[1][o.f], b[1][o.f]);
        if (c) return o.dir === "desc" ? -c : c;
      }
      return cmp(a[0], b[0]);
    });
    if (this.after && this.order.length) {
      const av = this.after;
      rows = rows.filter(([, d]) => {
        for (let i = 0; i < this.order.length; i++) {
          const c = cmp(d[this.order[i].f], av[i]);
          if (c) return this.order[i].dir === "desc" ? c < 0 : c > 0;
        }
        return false;
      });
    }
    if (Number.isFinite(this.lim)) rows = rows.slice(0, this.lim);
    return new QSnap(rows.map(([id, d]) => new Snap(new DocRef(this.name, id), d)));
  }
}

class CollRef extends Query {
  constructor(name: string) { super(name); }
  doc(id?: string) { return new DocRef(this.name, id ?? newId()); }
  async add(d: any) { const r = this.doc(); await r.set(d); return r; }
}

class Batch {
  private ops: (() => Promise<void>)[] = [];
  set(r: DocRef, d: any, o?: any) { this.ops.push(() => r.set(d, o)); return this; }
  update(r: DocRef, d: any) { this.ops.push(() => r.update(d)); return this; }
  delete(r: DocRef) { this.ops.push(() => r.delete()); return this; }
  async commit() { for (const f of this.ops) await f(); }
}

class Tx {
  private writes: (() => Promise<void>)[] = [];
  async get(x: DocRef | Query) { return x.get(); }
  set(r: DocRef, d: any, o?: any) { this.writes.push(() => r.set(d, o)); return this; }
  update(r: DocRef, d: any) { this.writes.push(() => r.update(d)); return this; }
  delete(r: DocRef) { this.writes.push(() => r.delete()); return this; }
  async commitWrites() { for (const w of this.writes) await w(); }
}

export const localDb = {
  collection: (name: string) => new CollRef(name),
  async getAll(...refs: DocRef[]) { return Promise.all(refs.map((r) => r.get())); },
  batch: () => new Batch(),
  settings: (_?: unknown) => {},
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const tx = new Tx();
      const out = await fn(tx);          // ném lỗi → không ghi gì (giống rollback)
      await tx.commitWrites();
      return out;
    });
    chain = run.catch(() => undefined);
    return run;
  },
};

/** Dùng cho kiểm thử / sao lưu. */
export const __localDbFlush = () => { load(); flushNow(); };
export const __localDbReset = () => { data = {}; loaded = true; };
