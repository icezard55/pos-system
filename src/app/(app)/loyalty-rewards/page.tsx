import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoyaltyRewardsClient from "./LoyaltyRewardsClient";

export default async function LoyaltyRewardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: rewards } = await supabase.from("loyalty_rewards").select("*").order("created_at", { ascending: false });

  return <LoyaltyRewardsClient rewards={rewards ?? []} />;
}
