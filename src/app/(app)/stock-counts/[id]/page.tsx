import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import StockCountDetailClient from "./StockCountDetailClient";

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();

  const { data: count } = await supabase.from("stock_counts").select("*").eq("id", id).maybeSingle();
  if (!count) notFound();

  const [items, products, barcodes] = await Promise.all([
    fetchAllRows((f, t) =>
      supabase
        .from("stock_count_items")
        .select("id, product_id, product_name, system_qty, counted_qty, cost_price, counted_at")
        .eq("count_id", id)
        .order("product_name")
        .order("id")
        .range(f, t)
    ),
    fetchAllRows((f, t) =>
      supabase.from("products").select("id, sku, name, unit, variant_group, variant_label").eq("is_active", true).order("id").range(f, t)
    ),
    fetchAllRows((f, t) => supabase.from("product_barcodes").select("product_id, barcode").order("id").range(f, t)),
  ]);

  return (
    <StockCountDetailClient
      count={count}
      initialItems={items}
      products={products}
      barcodes={barcodes}
      isAdmin={profile?.role === "admin"}
    />
  );
}
