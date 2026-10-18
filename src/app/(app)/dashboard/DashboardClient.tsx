"use client";
import { useState } from "react";
import Link from "next/link";
import { BarLineChart, DonutChart, HBarList, Gauge, CHART_COLORS, fmtBaht, fmtShort } from "@/components/Charts";
import { SALE_CHANNEL_LABEL, type SaleChannel } from "@/lib/types";

export interface DashboardData {
  kpi: {
    today_total: number; today_bills: number; yesterday_total: number;
    month_total: number; month_bills: number; month_profit: number;
    prev_total: number; prev_bills: number; prev_profit: number;
  };
  monthly: { m: string; revenue: number; gross: number; expenses: number }[];
  daily: { d: string; revenue: number; bills: number }[];
  by_hour: { h: number; revenue: number; bills: number }[];
  by_channel: { channel: string; revenue: number; bills: number }[];
  by_category_month: { category: string; revenue: number }[];
  by_category_year: { category: string; revenue: number }[];
  top_products: { name: string; qty: number; revenue: number; profit: number }[];
  stock: { cost_value: number; retail_value: number; sku_count: number; out_of_stock: number; low_stock: number };
  stock_by_category: { category: string; value: number; qty: number }[];
  receivable: {
    platform_unpaid: number; platform_bills: number; aging: number[];
    credit_customers: number; credit_customer_count: number;
  };
  todo: Record<string, number>;
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function Delta({ cur, prev, suffix = "เทียบช่วงเดียวกันเดือนก่อน" }: { cur: number; prev: number; suffix?: string }) {
  const p = pct(cur, prev);
  if (p === null) return <p className="mt-1 text-[11px] text-gray-400">{suffix}: ยังไม่มีข้อมูล</p>;
  const up = p >= 0;
  return (
    <p className="mt-1 text-[11px] text-gray-400">
      <span className={`mr-1 rounded px-1.5 py-0.5 font-semibold ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
        {up ? "▲" : "▼"} {Math.abs(p).toFixed(1)}%
      </span>
      {suffix}
    </p>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 ${value === o.v ? "bg-white font-semibold text-gray-800 shadow-sm" : "text-gray-500"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// โหมดอ่านอย่างเดียว (หน้าแชร์ให้คนนอก): ลิงก์ทั้งหมดกลายเป็นข้อความธรรมดา
function A({ ro, href, className, children }: { ro?: boolean; href: string; className?: string; children: React.ReactNode }) {
  if (ro) return <div className={className}>{children}</div>;
  return <Link href={href} className={className}>{children}</Link>;
}

export default function DashboardClient({ data, shopName, readOnly = false }: { data: DashboardData; shopName: string; readOnly?: boolean }) {
  const [catRange, setCatRange] = useState<"month" | "year">("month");
  const [trend, setTrend] = useState<"daily" | "monthly">("monthly");
  const k = data.kpi;
  const t = data.todo;
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "สวัสดีตอนเช้า" : hour < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
  const avgBill = k.month_bills ? k.month_total / k.month_bills : 0;
  const prevAvg = k.prev_bills ? k.prev_total / k.prev_bills : 0;
  const marginPct = k.month_total ? (k.month_profit / k.month_total) * 100 : 0;
  const receivableTotal = data.receivable.platform_unpaid + data.receivable.credit_customers;
  const stockMargin = data.stock.retail_value ? ((data.stock.retail_value - data.stock.cost_value) / data.stock.retail_value) * 100 : 0;
  const inStockPct = data.stock.sku_count ? ((data.stock.sku_count - data.stock.out_of_stock) / data.stock.sku_count) * 100 : 0;

  const kpis = [
    { label: "ยอดขายวันนี้", value: fmtBaht(k.today_total), sub: `${k.today_bills} บิล`, delta: <Delta cur={k.today_total} prev={k.yesterday_total} suffix="เทียบเมื่อวาน" /> },
    { label: "ยอดขายเดือนนี้", value: fmtBaht(k.month_total), sub: `${k.month_bills} บิล`, delta: <Delta cur={k.month_total} prev={k.prev_total} /> },
    { label: "กำไรหลังหักทุน+ค่าธรรมเนียม (เดือนนี้)", value: fmtBaht(k.month_profit), sub: `อัตรากำไร ${marginPct.toFixed(1)}%`, delta: <Delta cur={k.month_profit} prev={k.prev_profit} /> },
    { label: "ยอดเฉลี่ยต่อบิล (เดือนนี้)", value: fmtBaht(avgBill), sub: "", delta: <Delta cur={avgBill} prev={prevAvg} /> },
    { label: "มูลค่าสต๊อก (ราคาทุน)", value: fmtBaht(data.stock.cost_value), sub: `ถ้าขายหมดได้ ${fmtBaht(data.stock.retail_value)}`, delta: <p className="mt-1 text-[11px] text-gray-400">{data.stock.sku_count.toLocaleString()} รายการ · หมด {data.stock.out_of_stock}</p> },
    { label: "รอรับเงิน / ลูกหนี้", value: fmtBaht(receivableTotal), sub: `${data.receivable.platform_bills} บิลแพลตฟอร์ม`, delta: <p className="mt-1 text-[11px] text-gray-400">ลูกค้าขายเชื่อ {fmtBaht(data.receivable.credit_customers)} ({data.receivable.credit_customer_count} ราย)</p> },
  ];

  const todos = [
    { n: t.online_pending, label: "ออเดอร์ออนไลน์รอยืนยัน", href: "/online-orders", tone: "red" },
    { n: t.online_to_ship, label: "ออเดอร์รอแพ็ก/จัดส่ง", href: "/online-orders", tone: "amber" },
    { n: t.chat_unread, label: "ข้อความลูกค้ายังไม่อ่าน", href: "/chat", tone: "red" },
    { n: t.adjust_pending, label: "คำขอปรับสต๊อกรออนุมัติ", href: "/stock-adjustments", tone: "amber" },
    { n: t.count_open, label: "ใบตรวจนับที่ยังไม่ปิด", href: "/stock-counts", tone: "blue" },
    { n: t.po_draft, label: "ใบสั่งซื้อรอรับสินค้า", href: "/purchase-orders", tone: "blue" },
    { n: t.po_unpaid, label: "ใบสั่งซื้อยังไม่จ่ายเงิน", href: "/purchase-orders", tone: "amber" },
    { n: t.payables_overdue, label: "เจ้าหนี้เลยกำหนดจ่าย", href: "/accounts-payable", tone: "red" },
    { n: t.payables_due_7, label: "เจ้าหนี้ครบกำหนดใน 7 วัน", href: "/accounts-payable", tone: "amber" },
    { n: t.platform_unpaid_30, label: "บิลแพลตฟอร์มค้างรับเงิน > 30 วัน", href: "/reports", tone: "red" },
    { n: t.low_stock, label: "สินค้าต่ำกว่าจุดแจ้งเตือน", href: "/products", tone: "amber" },
    { n: t.expiring_30, label: "สินค้าใกล้หมดอายุ (30 วัน)", href: "/products", tone: "amber" },
  ];
  const toneCls: Record<string, string> = {
    red: "text-red-600 bg-red-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
  };

  const monthLabels = data.monthly.map((m) => {
    const [y, mm] = m.m.split("-").map(Number);
    return `${TH_MONTH[mm - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
  });
  const dailyLabels = data.daily.map((d) => {
    const dt = new Date(d.d + "T00:00:00");
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
  });
  const cats = catRange === "month" ? data.by_category_month : data.by_category_year;
  const agingLabels = ["0–7 วัน", "8–15 วัน", "16–30 วัน", "31–60 วัน", "เกิน 60 วัน"];
  const busiest = [...data.by_hour].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p suppressHydrationWarning className="text-sm text-gray-400">{now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 suppressHydrationWarning className="text-2xl font-bold text-gray-800">{greet} 👋</h1>
          <p className="text-sm text-gray-500">ภาพรวม {shopName} แบบเรียลไทม์</p>
        </div>
        {!readOnly && <div className="flex flex-wrap gap-2 text-sm">
          <A ro={readOnly} href="/pos" className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-dark">🛒 ขายสินค้า</A>
          <A ro={readOnly} href="/purchase-orders" className="rounded-lg border bg-white px-3 py-2 text-gray-700 hover:bg-gray-50">📥 สั่งซื้อ</A>
          <A ro={readOnly} href="/stock-counts" className="rounded-lg border bg-white px-3 py-2 text-gray-700 hover:bg-gray-50">📋 ตรวจนับ</A>
          <A ro={readOnly} href="/reports" className="rounded-lg border bg-white px-3 py-2 text-gray-700 hover:bg-gray-50">📈 รายงาน</A>
        </div>}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">{c.value}</p>
            {c.sub && <p className="text-xs text-gray-500">{c.sub}</p>}
            {c.delta}
          </div>
        ))}
      </div>

      {/* งานที่ต้องทำ */}
      <Card title="📌 งานที่ต้องจัดการ">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {todos.map((d) => (
            <A ro={readOnly} key={d.label} href={d.href}
              className={`rounded-xl border p-3 transition hover:shadow-sm ${d.n > 0 ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              <p className={`inline-block rounded-md px-2 text-xl font-bold ${d.n > 0 ? toneCls[d.tone] : "bg-gray-50 text-gray-400"}`}>{Number(d.n || 0).toLocaleString()}</p>
              <p className="mt-1 text-[11px] leading-tight text-gray-600">{d.label}</p>
            </A>
          ))}
        </div>
      </Card>

      {/* แนวโน้มยอดขาย */}
      <Card
        title={trend === "monthly" ? "ยอดขาย / กำไรขั้นต้น / รายจ่าย รายเดือน" : "ยอดขายรายวัน (30 วันล่าสุด)"}
        right={<Toggle value={trend} onChange={setTrend} options={[{ v: "monthly", label: "12 เดือน" }, { v: "daily", label: "30 วัน" }]} />}
      >
        {trend === "monthly" ? (
          <BarLineChart
            labels={monthLabels}
            bars={[
              { name: "ยอดขาย", color: CHART_COLORS[0], values: data.monthly.map((m) => Number(m.revenue)) },
              { name: "รายจ่าย", color: "#fca5a5", values: data.monthly.map((m) => Number(m.expenses)) },
            ]}
            line={{ name: "กำไรขั้นต้น", color: CHART_COLORS[1], values: data.monthly.map((m) => Number(m.gross)) }}
          />
        ) : (
          <BarLineChart
            labels={dailyLabels}
            bars={[{ name: "ยอดขาย", color: CHART_COLORS[0], values: data.daily.map((d) => Number(d.revenue)) }]}
          />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="สัดส่วนยอดขายตามหมวดหมู่"
          right={<Toggle value={catRange} onChange={setCatRange} options={[{ v: "month", label: "เดือนนี้" }, { v: "year", label: "ปีนี้" }]} />}
        >
          <DonutChart items={cats.map((c) => ({ label: c.category, value: Number(c.revenue) }))} />
        </Card>

        <Card title="ยอดขายตามช่องทาง (เดือนนี้)">
          <DonutChart
            items={data.by_channel.map((c) => ({ label: SALE_CHANNEL_LABEL[c.channel as SaleChannel] ?? c.channel, value: Number(c.revenue) }))}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <Gauge value={marginPct} label="อัตรากำไรเดือนนี้" color={CHART_COLORS[1]} />
            <Gauge value={stockMargin} label="ส่วนต่างราคาสต๊อก" color={CHART_COLORS[4]} />
            <Gauge value={inStockPct} label="สินค้ามีของพร้อมขาย" color={CHART_COLORS[0]} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="🏆 สินค้าขายดี 10 อันดับ (เดือนนี้)">
          <HBarList
            items={data.top_products.map((p) => ({
              label: p.name.trim(),
              value: Number(p.revenue),
              sub: `· ${Number(p.qty).toLocaleString()} ชิ้น · กำไร ${fmtShort(Number(p.profit))}`,
            }))}
          />
        </Card>

        <Card title="⏰ ช่วงเวลาขายดี (30 วันล่าสุด)">
          <BarLineChart
            labels={data.by_hour.map((h) => `${h.h}`)}
            bars={[{ name: "ยอดขาย", color: CHART_COLORS[2], values: data.by_hour.map((h) => Number(h.revenue)) }]}
            height={200}
          />
          {busiest && busiest.revenue > 0 && (
            <p className="mt-2 text-center text-xs text-gray-500">
              ขายดีที่สุดช่วง <span className="font-semibold text-gray-700">{busiest.h}:00–{busiest.h + 1}:00 น.</span> ({busiest.bills} บิล)
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="📦 มูลค่าสต๊อกตามหมวดหมู่ (ราคาทุน)">
          <HBarList
            color={CHART_COLORS[4]}
            items={data.stock_by_category.slice(0, 10).map((c) => ({ label: c.category, value: Number(c.value), sub: `· ${Number(c.qty).toLocaleString()} ชิ้น` }))}
          />
        </Card>

        <Card title="💳 อายุยอดรอรับเงินจากแพลตฟอร์ม">
          <BarLineChart
            labels={agingLabels}
            bars={[{ name: "ยอดรอรับ (หลังหักค่าธรรมเนียม)", color: CHART_COLORS[3], values: data.receivable.aging.map(Number) }]}
            height={200}
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            รวมค้างรับ <span className="font-semibold text-gray-700">{fmtBaht(data.receivable.platform_unpaid)}</span> จาก {data.receivable.platform_bills} บิล
            {" · "}<A ro={readOnly} href="/reports" className="text-brand hover:underline">ดูรายละเอียด</A>
          </p>
        </Card>
      </div>
    </div>
  );
}
