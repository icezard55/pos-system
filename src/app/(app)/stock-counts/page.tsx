import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import StockCountsClient from "./StockCountsClient";

export default async function StockCountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = profile?.role === "admin";

  const [{ data: counts }, catRows] = await Promise.all([
    supabase.from("stock_counts").select("*").order("created_at", { ascending: false }).limit(200),
    fetchAllRows<{ category: string | null }>((f, t) =>
      supabase.from("products").select("category").eq("is_active", true).order("id").range(f, t)
    ),
  ]);

  const catCount: Record<string, number> = {};
  for (const r of catRows) {
    const c = (r.category ?? "").trim();
    if (c) catCount[c] = (catCount[c] ?? 0) + 1;
  }
  const categories = Object.entries(catCount)
    .sort((a, b) => a[0].localeCompare(b[0], "th"))
    .map(([name, n]) => ({ name, n }));

  return <StockCountsClient counts={counts ?? []} categories={categories} isAdmin={isAdmin} totalProducts={catRows.length} />;
}
