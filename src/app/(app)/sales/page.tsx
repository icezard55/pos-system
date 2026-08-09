import { createClient } from "@/lib/supabase/server";
import SalesClient from "./SalesClient";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start, end } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 30);
  const startDate = start ? new Date(start + "T00:00:00") : defaultStart;
  const endDate = end ? new Date(end + "T23:59:59") : new Date();

  const { data: sales } = await supabase
    .from("sales")
    .select("*")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <SalesClient
      sales={sales ?? []}
      isAdmin={profile?.role === "admin"}
      startDate={toISODate(startDate)}
      endDate={toISODate(endDate)}
      currentUserEmail={user!.email ?? ""}
    />
  );
}
