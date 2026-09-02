import { createClient } from "@/lib/supabase/server";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, shop_id").eq("id", user!.id).single();
  const isAdmin = profile?.role === "admin";

  const { data: customers } = await supabase.from("customers").select("*").order("created_at", { ascending: false });

  return <CustomersClient initialCustomers={customers ?? []} isAdmin={isAdmin} shopId={profile?.shop_id ?? ""} />;
}
