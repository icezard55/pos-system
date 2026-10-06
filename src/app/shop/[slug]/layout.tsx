import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ShopChatWidget from "./ShopChatWidget";
import ThemePreview from "./ThemePreview";
import { getStorefrontTheme, storefrontThemeStyle } from "@/lib/storefrontThemes";

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
  let themeId = "modern";
  if (shop?.id) {
    const { data: prof } = await supabase.rpc("get_storefront_profile", { p_shop_id: shop.id });
    const row = Array.isArray(prof) ? prof[0] : prof;
    if (row?.shop_name) displayName = row.shop_name;
    if (row?.theme) themeId = row.theme;
  }
  const theme = getStorefrontTheme(themeId);
  const initial = displayName.trim().charAt(0) || "ร";
  const navLink = "shrink-0 rounded-sf-btn px-3 py-1.5 text-sm font-medium text-sf-ink hover:bg-sf-soft hover:text-sf-primary";

  return (
    <div className="sf-root flex min-h-screen flex-col bg-sf-bg text-sf-ink" style={storefrontThemeStyle(theme)} data-theme={theme.id}>
      <header className="sticky top-0 z-30 h-14 border-b bg-sf-surface/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
          <Link href={`/shop/${slug}`} className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sf bg-sf-hero text-base font-extrabold text-sf-hero-ink">{initial}</span>
            <span className={`truncate text-base font-bold text-sf-ink ${theme.layout.upperTitle ? "uppercase tracking-widest" : ""}`}>{displayName}</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href={`/shop/${slug}/deals`} className={navLink}>🎁<span className="hidden sm:inline"> โปรโมชั่น</span></Link>
            <Link href={`/shop/${slug}/bills`} className={navLink}>🧾<span className="hidden sm:inline"> ค้นหาบิล</span></Link>
            <Link href={`/shop/${slug}/track`} className={navLink}>📦<span className="hidden sm:inline"> ติดตามคำสั่งซื้อ</span></Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
      <footer className="border-t bg-sf-surface py-6 text-center text-xs text-sf-muted">
        © {new Date().getFullYear()} {displayName} · ระบบร้านค้าออนไลน์โดย{" "}
        <a href="https://poskeng.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-sf-primary hover:underline">POSKENG</a>
      </footer>
      {shop?.id && <ShopChatWidget shopId={shop.id} shopName={displayName} />}
      <ThemePreview />
    </div>
  );
}
