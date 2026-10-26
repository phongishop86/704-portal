/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bản nội bộ Windows: BUILD_STANDALONE=1 → .next/standalone (chạy bằng node server.js, không cần npm install ở máy chủ)
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Giao diện 704-assets là một file HTML tĩnh (public/app.html), phục vụ ở trang chủ.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/app.html" }] };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
