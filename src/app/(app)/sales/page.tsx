import { createClient } from "@/lib/supabase/server";
import SalesClient from "./SalesClient";

export default async function SalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const { data: sales } = await supabase
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return <SalesClient sales={sales ?? []} isAdmin={profile?.role === "admin"} />;
}
