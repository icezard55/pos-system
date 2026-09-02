import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SuppliersClient from "./SuppliersClient";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, shop_id").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: suppliers } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });

  return <SuppliersClient initialSuppliers={suppliers ?? []} shopId={profile?.shop_id ?? ""} />;
}
