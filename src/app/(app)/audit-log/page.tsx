import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuditLogClient from "./AuditLogClient";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: entries } = await supabase
    .from("audit_log")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return <AuditLogClient entries={(entries as any) ?? []} />;
}
