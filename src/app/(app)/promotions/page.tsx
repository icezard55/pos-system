import { redirect } from "next/navigation";
import { fetchAllRows } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import PromotionsClient from "./PromotionsClient";

export default async function PromotionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, shop_id").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [{ data: promotions }, { data: products }] = await Promise.all([
    supabase.from("promotions").select("*").order("created_at", { ascending: false }),
    fetchAllRows((f, t) => supabase.from("products").select("id,name,sku,sell_price").eq("is_active", true).order("name").order("id").range(f, t)).then((data) => ({ data })),
  ]);

  return <PromotionsClient promotions={promotions ?? []} products={products ?? []} shopId={profile?.shop_id ?? ""} />;
}
