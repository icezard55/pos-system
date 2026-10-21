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

  // รายการสินค้าในแต่ละบิล (ชื่อ/จำนวน + ต้นทุนสำหรับแอดมินเพื่อคำนวณกำไรต่อบิล)
  const isAdmin = profile?.role === "admin";
  const saleIds = (sales ?? []).map((s: any) => s.id as string);
  const itemsBySale: Record<string, { name: string; qty: number; cost: number | null }[]> = {};
  for (let i = 0; i < saleIds.length; i += 80) {
    const { data: rows } = await supabase
      .from("sale_items")
      .select("sale_id, product_name, qty, cost_price")
      .in("sale_id", saleIds.slice(i, i + 80));
    for (const r of rows ?? []) {
      (itemsBySale[r.sale_id] ??= []).push({
        name: r.product_name,
        qty: Number(r.qty),
        cost: isAdmin ? Number(r.cost_price ?? 0) * Number(r.qty) : null,
      });
    }
  }

  return (
    <SalesClient
      itemsBySale={itemsBySale}
      sales={sales ?? []}
      isAdmin={profile?.role === "admin"}
      startDate={toISODate(startDate)}
      endDate={toISODate(endDate)}
      currentUserEmail={user!.email ?? ""}
    />
  );
}
