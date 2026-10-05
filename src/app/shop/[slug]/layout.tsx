import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ShopChatWidget from "./ShopChatWidget";

export const metadata: Metadata = {
  title: "ร้านค้าออนไลน์",
  description: "สั่งซื้อสินค้าออนไลน์",
};

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id, name").eq("slug", slug).eq("is_active", true).maybeSingle();
  let displayName = shop?.name ?? "ร้านค้าออนไลน์";
  if (shop?.id) {
    const { data: st } = await supabase.from("shop_settings").select("shop_name").eq("shop_id", shop.id).maybeSingle();
    if (st?.shop_name) displayName = st.shop_name;
  }
  const initial = displayName.trim().charAt(0) || "ร";

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-30 h-14 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
          <Link href={`/shop/${slug}`} className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-base font-extrabold text-white">{initial}</span>
            <span className="truncate text-base font-bold text-gray-900">{displayName}</span>
          </Link>
          <Link
            href={`/shop/${slug}/track`}
            className="shrink-0 rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
          >
            📦 ติดตามคำสั่งซื้อ
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
      <footer className="border-t border-gray-100 bg-white py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} {displayName} · ระบบร้านค้าออนไลน์โดย{" "}
        <a href="https://poskeng.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-500 hover:underline">POSKENG</a>
      </footer>
      {shop?.id && <ShopChatWidget shopId={shop.id} shopName={displayName} />}
    </div>
  );
}
