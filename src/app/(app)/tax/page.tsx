import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TaxClient from "./TaxClient";

export default async function TaxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  return <TaxClient />;
}
