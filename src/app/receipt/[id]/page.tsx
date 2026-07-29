import { createClient } from "@/lib/supabase/server";
import ReceiptClient from "./ReceiptClient";
import { notFound } from "next/navigation";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase.from("sales").select("*").eq("id", id).single();
  if (!sale) notFound();

  const { data: items } = await supabase.from("sale_items").select("*").eq("sale_id", id);

  return <ReceiptClient sale={sale} items={items ?? []} />;
}
