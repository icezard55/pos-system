import { createClient } from "@/lib/supabase/server";
import BatchClient from "./BatchClient";
import { notFound } from "next/navigation";

export default async function BatchReceiptPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const list = Array.from(new Set((ids ?? "").split(",").map((x) => x.trim()).filter(Boolean))).slice(0, 200);
  if (list.length === 0) notFound();
  const supabase = await createClient();

  const [{ data: sales }, { data: items }, { data: payments }, { data: shopSettings }] = await Promise.all([
    supabase.from("sales").select("*").in("id", list),
    supabase.from("sale_items").select("*").in("sale_id", list),
    supabase.from("sale_payments").select("*").in("sale_id", list),
    supabase.from("shop_settings").select("*").maybeSingle(),
  ]);
  if (!sales || sales.length === 0) notFound();
  // เรียงตามลำดับที่เลือก
  const order = new Map(list.map((id, i) => [id, i]));
  const sorted = [...sales].sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return <BatchClient sales={sorted} items={items ?? []} payments={payments ?? []} shopSettings={shopSettings ?? null} />;
}
