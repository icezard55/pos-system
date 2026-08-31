import { createClient } from "@/lib/supabase/server";
import PosClient from "./PosClient";

export default async function PosPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const { data: barcodes } = await supabase.from("product_barcodes").select("product_id, barcode");

  const { data: shopSettings } = await supabase.from("shop_settings").select("*").single();

  const { data: promotions } = await supabase.rpc("get_active_promotions");

  const { data: loyaltyRewards } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("is_active", true)
    .order("points_cost");

  return (
    <PosClient
      products={products ?? []}
      barcodes={barcodes ?? []}
      showVatOnReceipt={shopSettings?.show_vat_on_receipt ?? true}
      promotions={promotions ?? []}
      loyaltyRewards={loyaltyRewards ?? []}
    />
  );
}
