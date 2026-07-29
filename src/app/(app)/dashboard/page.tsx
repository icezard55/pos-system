import { createClient } from "@/lib/supabase/server";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: todaySales }, { data: products }, { data: lowStock }] = await Promise.all([
    supabase.from("sales").select("total").gte("created_at", startOfToday()).eq("status", "completed"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id,name,stock_qty,low_stock_threshold").order("stock_qty", { ascending: true }).limit(8),
  ]);

  const todayTotal = (todaySales ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const todayCount = (todaySales ?? []).length;
  const lowStockItems = (lowStock ?? []).filter((p) => Number(p.stock_qty) <= Number(p.low_stock_threshold));

  const cards = [
    { label: "ยอดขายวันนี้", value: `฿${todayTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` },
    { label: "จำนวนบิลวันนี้", value: `${todayCount} บิล` },
    { label: "สินค้าใกล้หมด", value: `${lowStockItems.length} รายการ` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">แดชบอร์ด</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-800">⚠️ สินค้าสต๊อกต่ำ / ใกล้หมด</h2>
        {lowStockItems.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่มีสินค้าใกล้หมดสต๊อก</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">สินค้า</th>
                <th className="py-2">คงเหลือ</th>
                <th className="py-2">แจ้งเตือนที่</th>
              </tr>
            </thead>
            <tbody>
              {lowStockItems.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 font-medium text-red-600">{p.stock_qty}</td>
                  <td className="py-2 text-gray-500">{p.low_stock_threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
