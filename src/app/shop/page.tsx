import { createClient } from "@/lib/supabase/server";
import ShopClient from "./ShopClient";
import type { StorefrontProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const supabase = await createClient();
  const { data: products } = await supabase.rpc("list_storefront_products");
  const { data: shopSettings } = await supabase
    .from("shop_settings")
    .select("shop_name, phone, address")
    .eq("id", true)
    .maybeSingle();

  return (
    <ShopClient
      products={(products as StorefrontProduct[]) ?? []}
      shopName={shopSettings?.shop_name ?? "ร้านค้าออนไลน์"}
    />
  );
}
