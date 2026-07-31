import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: settings } = await supabase.from("shop_settings").select("*").eq("id", true).maybeSingle();

  return <SettingsClient initialSettings={settings} />;
}
