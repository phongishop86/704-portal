import type { ReactNode } from "react";

export const metadata = { title: "704-ITDiary" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>{children}</body>
    </html>
  );
}
