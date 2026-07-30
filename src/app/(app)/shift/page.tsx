import { createClient } from "@/lib/supabase/server";
import ShiftClient from "./ShiftClient";

export default async function ShiftPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = profile?.role === "admin";

  const { data: openShift } = await supabase
    .from("cash_shifts")
    .select("*")
    .eq("opened_by", user!.id)
    .eq("status", "open")
    .maybeSingle();

  const historyQuery = supabase
    .from("cash_shifts")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(30);
  if (!isAdmin) historyQuery.eq("opened_by", user!.id);
  const { data: history } = await historyQuery;

  return <ShiftClient openShift={openShift ?? null} history={history ?? []} isAdmin={isAdmin} />;
}
