import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: sales } = await supabase
    .from("sales")
    .select("total, created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .eq("status", "completed");

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
    <div>
      <h1 className="mb-6 text-2xl font-bold">รายงาน (30 วันล่าสุด)</h1>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">ยอดขายรวม 30 วัน</p>
        <p className="mt-1 text-3xl font-bold text-brand">฿{grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">ยอดขายรายวัน</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">วันที่</th><th className="py-2 text-right">ยอดขาย</th></tr></thead>
            <tbody>
              {dayRows.map(([day, total]) => (
                <tr key={day} className="border-b last:border-0"><td className="py-2">{day}</td><td className="py-2 text-right font-medium">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
              ))}
              {dayRows.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">สินค้าขายดี Top 10</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">สินค้า</th><th className="py-2 text-right">จำนวน</th><th className="py-2 text-right">ยอดขาย</th></tr></thead>
            <tbody>
              {topProducts.map(([name, v]) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2">{name}</td>
                  <td className="py-2 text-right">{v.qty}</td>
                  <td className="py-2 text-right font-medium">฿{v.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
