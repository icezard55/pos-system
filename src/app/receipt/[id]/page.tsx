import { createClient } from "@/lib/supabase/server";
import ReceiptClient from "./ReceiptClient";
import { notFound } from "next/navigation";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase.from("sales").select("*").eq("id", id).single();
  if (!sale) notFound();

  const { data: items } = await supabase.from("sale_items").select("*").eq("sale_id", id);
  const { data: payments } = await supabase.from("sale_payments").select("*").eq("sale_id", id);
  const { data: shopSettings } = await supabase.from("shop_settings").select("*").maybeSingle();

  return <ReceiptClient sale={sale} items={items ?? []} payments={payments ?? []} shopSettings={shopSettings ?? null} />;
}
