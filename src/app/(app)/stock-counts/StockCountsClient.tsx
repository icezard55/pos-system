"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BarLineChart, CHART_COLORS } from "@/components/Charts";

export interface StockCount {
  id: string;
  count_no: string;
  title: string;
  category: string | null;
  status: "counting" | "posted" | "cancelled";
  note: string | null;
  created_at: string;
  posted_at: string | null;
  items_total: number;
  items_counted: number;
  items_diff: number;
  diff_value_net: number;
  diff_value_abs: number;
}

export const COUNT_STATUS: Record<string, { label: string; cls: string }> = {
  counting: { label: "กำลังตรวจนับ", cls: "bg-blue-100 text-blue-700" },
  posted: { label: "ปรับยอดแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "ยกเลิก", cls: "bg-gray-200 text-gray-500" },
};

function baht(n: number) {
  return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StockCountsClient({
  counts,
  categories,
  isAdmin,
  totalProducts,
}: {
  counts: StockCount[];
  categories: { name: string; n: number }[];
  isAdmin: boolean;
  totalProducts: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "counting" | "posted" | "cancelled">("all");

  const sixMonthsAgo = Date.now() - 183 * 86400000;
  const stats = useMemo(() => {
    const posted = counts.filter((c) => c.status === "posted" && new Date(c.posted_at ?? c.created_at).getTime() >= sixMonthsAgo);
    const counted = posted.reduce((t, c) => t + c.items_counted, 0);
    const diff = posted.reduce((t, c) => t + c.items_diff, 0);
    return {
      accuracy: counted ? ((counted - diff) / counted) * 100 : null,
      counted,
      matched: counted - diff,
      abs: posted.reduce((t, c) => t + Number(c.diff_value_abs), 0),
      net: posted.reduce((t, c) => t + Number(c.diff_value_net), 0),
      open: counts.filter((c) => c.status === "counting").length,
      postedYear: counts.filter((c) => c.status === "posted" && new Date(c.posted_at ?? c.created_at).getFullYear() === new Date().getFullYear()).length,
    };
  }, [counts, sixMonthsAgo]);

  const chartCounts = counts.filter((c) => c.status === "posted").slice(0, 12).reverse();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const defaultTitle = category ? `ตรวจนับหมวด ${category}` : "ตรวจนับสต๊อกทั้งร้าน";
    const { data, error } = await supabase.rpc("create_stock_count", { p_title: title.trim() || defaultTitle, p_category: category || null });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push(`/stock-counts/${data}`);
  }

  const shown = counts.filter((c) => filter === "all" || c.status === filter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ตรวจนับสต๊อก</h1>
          <p className="text-sm text-gray-500">ระบบจำยอดในระบบไว้ → นับของจริง (สแกนบาร์โค้ดได้) → ดูผลต่าง → อนุมัติปรับยอดทีเดียว</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowNew((v) => !v)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            + เปิดใบตรวจนับ
          </button>
        )}
      </div>

      {showNew && isAdmin && (
        <form onSubmit={create} className="mb-6 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">ตรวจนับสินค้ากลุ่มไหน</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">ทั้งร้าน ({totalProducts.toLocaleString()} รายการ)</option>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.n})</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อใบตรวจนับ (ไม่บังคับ)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category ? `ตรวจนับหมวด ${category}` : "ตรวจนับสต๊อกทั้งร้าน"} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <p className="text-xs text-gray-500 sm:col-span-3">
            💡 แนะนำให้นับตอนร้านปิดหรือช่วงขายน้อย — ถ้ามีการขายระหว่างนับ ระบบจะปรับเฉพาะส่วนต่างระหว่างยอดที่นับได้กับยอดตอนเปิดใบ
          </p>
          {err && <p className="text-sm text-red-600 sm:col-span-3">{err}</p>}
          <div className="sm:col-span-3">
            <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "กำลังสร้าง..." : "สร้างใบตรวจนับแล้วเริ่มนับ"}
            </button>
          </div>
        </form>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">ความแม่นยำสต๊อก (6 เดือน)</p>
          <p className={`mt-1 text-2xl font-bold ${stats.accuracy === null ? "text-gray-400" : stats.accuracy >= 95 ? "text-emerald-600" : stats.accuracy >= 85 ? "text-amber-600" : "text-red-600"}`}>
            {stats.accuracy === null ? "—" : `${stats.accuracy.toFixed(1)}%`}
          </p>
          <p className="text-[11px] text-gray-400">{stats.matched} / {stats.counted} รายการตรงกัน</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">ผลต่างรวม (มูลค่าทุน)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">฿{baht(stats.abs)}</p>
          <p className="text-[11px] text-gray-400">นับรวมทั้งขาดและเกิน · 6 เดือน</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">ผลต่างสุทธิ</p>
          <p className={`mt-1 text-2xl font-bold ${stats.net < 0 ? "text-red-600" : "text-emerald-600"}`}>{stats.net < 0 ? "-" : "+"}฿{baht(Math.abs(stats.net))}</p>
          <p className="text-[11px] text-gray-400">ติดลบ = ของจริงน้อยกว่าในระบบ</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">ใบที่ยังไม่ปิด</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{stats.open}</p>
          <p className="text-[11px] text-gray-400">ปีนี้ปรับยอดแล้ว {stats.postedYear} ครั้ง</p>
        </div>
      </div>

      {chartCounts.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 font-semibold text-gray-800">ความแม่นยำแต่ละครั้งที่นับ</h2>
          <BarLineChart
            labels={chartCounts.map((c) => c.count_no.replace("CNT", ""))}
            bars={[{ name: "ความแม่นยำ %", color: CHART_COLORS[1], values: chartCounts.map((c) => (c.items_counted ? ((c.items_counted - c.items_diff) / c.items_counted) * 100 : 0)) }]}
            height={180}
            format={(n) => `${n.toFixed(1)}%`}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {(["all", "counting", "posted", "cancelled"] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`rounded-full border px-3 py-1 ${filter === t ? "border-brand bg-brand text-white" : "bg-white text-gray-600"}`}>
            {t === "all" ? "ทั้งหมด" : COUNT_STATUS[t].label}
            <span className="ml-1 opacity-70">{t === "all" ? counts.length : counts.filter((c) => c.status === t).length}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เลขที่</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">กลุ่มสินค้า</th>
              <th className="px-4 py-3 text-right">รายการ</th>
              <th className="px-4 py-3 text-right">มีผลต่าง</th>
              <th className="px-4 py-3 text-right">ผลต่างสุทธิ (฿)</th>
              <th className="px-4 py-3 text-right">ความแม่นยำ</th>
              <th className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-gray-50" onClick={() => router.push(`/stock-counts/${c.id}`)}>
                <td className="px-4 py-3">
                  <Link href={`/stock-counts/${c.id}`} className="font-medium text-brand hover:underline">{c.count_no}</Link>
                  <p className="text-xs text-gray-400">{c.title}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</td>
                <td className="px-4 py-3 text-gray-600">{c.category ?? "ทั้งร้าน"}</td>
                <td className="px-4 py-3 text-right">{c.status === "posted" ? `${c.items_counted}/${c.items_total}` : c.items_total}</td>
                <td className="px-4 py-3 text-right">{c.status === "posted" ? c.items_diff : "-"}</td>
                <td className={`px-4 py-3 text-right ${Number(c.diff_value_net) < 0 ? "text-red-600" : "text-gray-700"}`}>{c.status === "posted" ? baht(Number(c.diff_value_net)) : "-"}</td>
                <td className="px-4 py-3 text-right">{c.status === "posted" && c.items_counted ? `${(((c.items_counted - c.items_diff) / c.items_counted) * 100).toFixed(1)}%` : "-"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COUNT_STATUS[c.status].cls}`}>{COUNT_STATUS[c.status].label}</span></td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">ยังไม่มีใบตรวจนับ{isAdmin ? " — กด \"+ เปิดใบตรวจนับ\" เพื่อเริ่ม" : ""}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
