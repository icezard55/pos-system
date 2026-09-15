import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SuperAdminClient from "./SuperAdminClient";

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_owner")
    .eq("id", user!.id)
    .single();
  if (!profile?.is_platform_owner) redirect("/dashboard");

  const { data: shops } = await supabase.rpc("list_shops_for_owner");

  return <SuperAdminClient initialShops={shops ?? []} />;
}
