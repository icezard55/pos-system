import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseOrdersClient from "./PurchaseOrdersClient";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, unit, cost_price")
    .eq("is_active", true)
    .order("name");
  const { data: orders } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name), purchase_order_items(id, product_id, qty, unit_cost, products(name, unit))")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <PurchaseOrdersClient
      suppliers={suppliers ?? []}
      products={products ?? []}
      orders={(orders as any) ?? []}
    />
  );
}
