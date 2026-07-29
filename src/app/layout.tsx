import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบขายหน้าร้าน & สต๊อกสินค้า",
  description: "POS + Inventory Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen text-gray-900">{children}</body>
    </html>
  );
}
