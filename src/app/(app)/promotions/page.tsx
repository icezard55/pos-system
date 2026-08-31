import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PromotionsClient from "./PromotionsClient";

export default async function PromotionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [{ data: promotions }, { data: products }] = await Promise.all([
    supabase.from("promotions").select("*").order("created_at", { ascending: false }),
    supabase.from("products").select("id,name,sku,sell_price").eq("is_active", true).order("name"),
  ]);

  return <PromotionsClient promotions={promotions ?? []} products={products ?? []} />;
}
