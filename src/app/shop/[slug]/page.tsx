import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShopClient from "./ShopClient";
import type { StorefrontProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // public.shops (id, name, slug, is_active) is anon-readable via RLS
  // (policy: is_active = true) - this is the storefront's shop-lookup table,
  // separate from shop_settings which holds per-shop admin-configured fields.
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!shop) notFound();
  const shopId = shop.id as string;

  const { data: products } = await supabase.rpc("list_storefront_products", { p_shop_id: shopId });
  const { data: shopSettings } = await supabase
    .from("shop_settings")
    .select("shop_name, phone, address")
    .eq("shop_id", shopId)
    .maybeSingle();
  const { data: promotions } = await supabase.rpc("get_active_promotions", { p_shop_id: shopId });

  return (
    <ShopClient
      shopId={shopId}
      shopSlug={slug}
      products={(products as StorefrontProduct[]) ?? []}
      shopName={shopSettings?.shop_name ?? shop.name ?? "ร้านค้าออนไลน์"}
      promotions={promotions ?? []}
    />
  );
}
