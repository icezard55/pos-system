import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnlineOrdersClient from "./OnlineOrdersClient";

export default async function OnlineOrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: orders } = await supabase
    .from("online_orders")
    .select("*, online_order_items(*)")
    .order("created_at", { ascending: false })
    .limit(300);

  return <OnlineOrdersClient orders={orders ?? []} />;
}
