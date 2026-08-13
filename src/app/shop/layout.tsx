import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ร้านค้าออนไลน์",
  description: "สั่งซื้อสินค้าออนไลน์",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/shop" className="text-lg font-bold text-indigo-700">
            🛍️ ร้านค้าออนไลน์
          </Link>
          <Link href="/shop/track" className="text-sm font-medium text-gray-600 hover:text-indigo-700">
            ติดตามคำสั่งซื้อ
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
