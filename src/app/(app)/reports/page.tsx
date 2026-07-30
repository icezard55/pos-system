import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: sales } = await supabase
    .from("sales")
    .select("sale_no, total, subtotal, discount, payment_method, status, created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_name, qty, line_total, sale_id, sales!inner(created_at)")
    .gte("sales.created_at", thirtyDaysAgo.toISOString());

  const byDay: Record<string, number> = {};
  (sales ?? []).forEach((s) => {
    const day = new Date(s.created_at).toLocaleDateString("th-TH");
    byDay[day] = (byDay[day] ?? 0) + Number(s.total);
  });
  const dayRows = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const byProduct: Record<string, { qty: number; total: number }> = {};
  (items ?? []).forEach((it: any) => {
    if (!byProduct[it.product_name]) byProduct[it.product_name] = { qty: 0, total: 0 };
    byProduct[it.product_name].qty += Number(it.qty);
    byProduct[it.product_name].total += Number(it.line_total);
  });
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const grandTotal = (sales ?? []).reduce((s, r) => s + Number(r.total), 0);

  return (
    <ReportsClient
      grandTotal={grandTotal}
      dayRows={dayRows}
      topProducts={topProducts}
      sales={sales ?? []}
    />
  );
}
