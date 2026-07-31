import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportsClient from "./ReportsClient";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start, end } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 30);
  const startDate = start ? new Date(start + "T00:00:00") : defaultStart;
  const endDate = end ? new Date(end + "T23:59:59") : new Date();

  const { data: sales } = await supabase
    .from("sales")
    .select("sale_no, total, subtotal, discount, payment_method, status, created_at")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_name, qty, line_total, cost_price, sale_id, sales!inner(created_at, status)")
    .gte("sales.created_at", startDate.toISOString())
    .lte("sales.created_at", endDate.toISOString())
    .eq("sales.status", "completed");

  const byDay: Record<string, number> = {};
  (sales ?? []).forEach((s) => {
    const day = new Date(s.created_at).toLocaleDateString("th-TH");
    byDay[day] = (byDay[day] ?? 0) + Number(s.total);
  });
  const dayRows = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const byProduct: Record<string, { qty: number; total: number; profit: number }> = {};
  let totalCost = 0;
  (items ?? []).forEach((it: any) => {
    if (!byProduct[it.product_name]) byProduct[it.product_name] = { qty: 0, total: 0, profit: 0 };
    const lineCost = Number(it.cost_price) * Number(it.qty);
    const lineProfit = Number(it.line_total) - lineCost;
    byProduct[it.product_name].qty += Number(it.qty);
    byProduct[it.product_name].total += Number(it.line_total);
    byProduct[it.product_name].profit += lineProfit;
    totalCost += lineCost;
  });
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const grandTotal = (sales ?? []).reduce((s, r) => s + Number(r.total), 0);
  const grandProfit = grandTotal - totalCost;

  return (
    <ReportsClient
      grandTotal={grandTotal}
      grandProfit={grandProfit}
      dayRows={dayRows}
      topProducts={topProducts}
      sales={sales ?? []}
      startDate={toISODate(startDate)}
      endDate={toISODate(endDate)}
    />
  );
}
