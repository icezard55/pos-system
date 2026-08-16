import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountsPayableClient from "./AccountsPayableClient";

export default async function AccountsPayablePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: payables } = await supabase
    .from("payables")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const { data: receivedPOs } = await supabase
    .from("purchase_orders")
    .select("id, supplier_invoice_no, payment_status, paid_at, po_total, freight_cost, received_at, note, suppliers(name)")
    .eq("status", "received")
    .order("received_at", { ascending: false })
    .limit(300);

  return (
    <AccountsPayableClient
      payables={payables ?? []}
      receivedPOs={(receivedPOs as any) ?? []}
    />
  );
}
