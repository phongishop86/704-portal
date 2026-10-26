/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bản nội bộ Windows: BUILD_STANDALONE=1 → .next/standalone (chạy bằng node server.js, không cần npm install ở máy chủ)
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Trang chủ là Portal (public/portal.html); module CCDC/Tài sản là public/app.html.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/portal.html" }] };
  },
  async headers() {
    return [
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
