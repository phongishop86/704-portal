/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bản nội bộ Windows: BUILD_STANDALONE=1 → .next/standalone (chạy bằng node server.js, không cần npm install ở máy chủ)
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Trang chủ là ứng dụng Tài sản (public/app.html), vào thẳng không qua Portal. Portal vẫn truy cập được tại /portal.html.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/app.html" }] };
  },
  async headers() {
    return [
      // Trang giao diện luôn kiểm tra bản mới (tránh trình duyệt điện thoại giữ bản cũ sau khi cập nhật)
      { source: "/app.html", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
      { source: "/portal.html", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
