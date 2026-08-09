import type { Metadata } from "next";
import "./globals.css";
import RegisterSW from "./RegisterSW";

export const metadata: Metadata = {
  title: "ระบบขายหน้าร้าน & สต๊อกสินค้า",
  description: "POS + Inventory Management",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen text-gray-900">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
