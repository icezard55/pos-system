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
    .select("product_name, product_id, qty, line_total, cost_price, sale_id, sales!inner(created_at, status)")
    .gte("sales.created_at", startDate.toISOString())
    .lte("sales.created_at", endDate.toISOString())
    .eq("sales.status", "completed");

  const { data: productCategoryRows } = await supabase.from("products").select("id, category");
  const categoryMap: Record<string, string> = {};
  (productCategoryRows ?? []).forEach((p) => {
    categoryMap[p.id] = p.category?.trim() || "ไม่ระบุหมวดหมู่";
  });

  const { data: receivedPOs } = await supabase
    .from("purchase_orders")
    .select("id, received_at, note, suppliers(name), purchase_order_items(qty, unit_cost, products(name, unit))")
    .eq("status", "received")
    .gte("received_at", startDate.toISOString())
    .lte("received_at", endDate.toISOString())
    .order("received_at", { ascending: false });

  const { data: stockValuation } = await supabase
    .from("products")
    .select("id, name, sku, unit, stock_qty, cost_price, sell_price")
    .eq("is_active", true)
    .order("name");

  const { data: outOfStock } = await supabase.rpc("report_out_of_stock");
  const { data: accountsPayable } = await supabase.rpc("report_accounts_payable");
  const { data: accountsReceivable } = await supabase.rpc("report_accounts_receivable");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", toISODate(startDate))
    .lte("expense_date", toISODate(endDate))
    .order("expense_date", { ascending: false });

  const byDay: Record<string, { total: number; profit: number }> = {};
  (sales ?? []).forEach((s) => {
    const day = new Date(s.created_at).toLocaleDateString("th-TH");
    if (!byDay[day]) byDay[day] = { total: 0, profit: 0 };
    byDay[day].total += Number(s.total);
  });
  (items ?? []).forEach((it: any) => {
    const day = new Date(it.sales.created_at).toLocaleDateString("th-TH");
    if (!byDay[day]) byDay[day] = { total: 0, profit: 0 };
    const lineCost = Number(it.cost_price) * Number(it.qty);
    byDay[day].profit += Number(it.line_total) - lineCost;
  });
  const dayRows = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const byProduct: Record<string, { qty: number; total: number; profit: number }> = {};
  const byCategory: Record<string, { qty: number; total: number; profit: number }> = {};
  let totalCost = 0;
  (items ?? []).forEach((it: any) => {
    if (!byProduct[it.product_name]) byProduct[it.product_name] = { qty: 0, total: 0, profit: 0 };
    const lineCost = Number(it.cost_price) * Number(it.qty);
    const lineProfit = Number(it.line_total) - lineCost;
    byProduct[it.product_name].qty += Number(it.qty);
    byProduct[it.product_name].total += Number(it.line_total);
    byProduct[it.product_name].profit += lineProfit;
    totalCost += lineCost;

    const category = it.product_id ? categoryMap[it.product_id] ?? "ไม่ระบุหมวดหมู่" : "ไม่ระบุหมวดหมู่";
    if (!byCategory[category]) byCategory[category] = { qty: 0, total: 0, profit: 0 };
    byCategory[category].qty += Number(it.qty);
    byCategory[category].total += Number(it.line_total);
    byCategory[category].profit += lineProfit;
  });
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  const allProductSales = Object.entries(byProduct).sort((a, b) => a[0].localeCompare(b[0], "th"));
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

  const grandTotal = (sales ?? []).reduce((s, r) => s + Number(r.total), 0);
  const grandProfit = grandTotal - totalCost;

  return (
    <ReportsClient
      grandTotal={grandTotal}
      grandProfit={grandProfit}
      dayRows={dayRows}
      topProducts={topProducts}
      allProductSales={allProductSales}
      categoryRows={categoryRows}
      sales={sales ?? []}
      startDate={toISODate(startDate)}
      endDate={toISODate(endDate)}
      receivedPOs={(receivedPOs as any) ?? []}
      stockValuation={stockValuation ?? []}
      outOfStock={outOfStock ?? []}
      accountsPayable={accountsPayable ?? []}
      accountsReceivable={accountsReceivable ?? []}
      expenses={(expenses as any) ?? []}
    />
  );
}
