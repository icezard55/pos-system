import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DiscountCodesClient from "./DiscountCodesClient";

export default async function DiscountCodesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: codes } = await supabase
    .from("discount_codes")
    .select("*")
    .order("created_at", { ascending: false });

  return <DiscountCodesClient codes={codes ?? []} />;
}
