import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import StockAdjustmentsClient from "./StockAdjustmentsClient";

export default async function StockAdjustmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = profile?.role === "admin";

  const [{ data: products }, { data: requests }, { data: profiles }, { data: movements }] = await Promise.all([
    fetchAllRows((f, t) => supabase.from("products").select("id, sku, name, unit, stock_qty, cost_price").eq("is_active", true).order("name").order("id").range(f, t)).then((data) => ({ data })),
    supabase
      .from("stock_adjust_requests")
      .select("id, product_id, product_name, change_qty, reason_code, note, cost_value, status, requested_by, requested_at, decided_by, decided_at, decide_note")
      .order("requested_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name"),
    isAdmin
      ? supabase
          .from("stock_movements")
          .select("id, change_qty, reason, note, created_at, products(name)")
          .in("reason", ["adjustment", "count", "restock"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const names: Record<string, string> = {};
  for (const p of profiles ?? []) names[p.id] = p.full_name || "ผู้ใช้";

  return (
    <StockAdjustmentsClient
      products={products ?? []}
      requests={requests ?? []}
      names={names}
      isAdmin={isAdmin}
      userId={user!.id}
      movements={movements ?? []}
    />
  );
}
