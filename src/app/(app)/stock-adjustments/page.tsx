import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StockAdjustmentsClient from "./StockAdjustmentsClient";

export default async function StockAdjustmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, unit, stock_qty")
    .eq("is_active", true)
    .order("name");

  const { data: movements } = await supabase
    .from("stock_movements")
    .select("id, product_id, change_qty, reason, note, created_at, products(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return <StockAdjustmentsClient products={products ?? []} movements={movements ?? []} />;
}
