/* Service worker: giữ khung giao diện để mở nhanh và báo "mất kết nối" gọn gàng. KHÔNG lưu /api (dữ liệu luôn lấy từ máy chủ). */
const VER = "v2";
const SHELL = ["/app.html", "/img/logo.png", "/img/favicon.png", "/img/icon-192.png", "/offline.html"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open("shell-" + VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== "shell-" + VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate" || url.pathname === "/app.html") {
    // Trang: ưu tiên mạng (luôn bản mới nhất), mất mạng thì dùng bản đã lưu
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open("shell-" + VER).then((c) => c.put("/app.html", cp)); return r; }).catch(() => caches.match("/app.html").then((r) => r || caches.match("/offline.html"))));
    return;
  }
  if (url.pathname.startsWith("/img/") || url.pathname.startsWith("/js/")) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((n) => { const cp = n.clone(); caches.open("shell-" + VER).then((c) => c.put(req, cp)); return n; })));
  }
});
