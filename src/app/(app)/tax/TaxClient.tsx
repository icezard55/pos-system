"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORY_LABEL, SALE_CHANNEL_LABEL, type ExpenseCategory, type SaleChannel } from "@/lib/types";

// อัตราภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (ใช้ประมาณการเท่านั้น — ตรวจสอบอัตราล่าสุดกับกรมสรรพากรก่อนยื่นจริง)
const BRACKETS: [number, number][] = [
  [150000, 0], [300000, 0.05], [500000, 0.1], [750000, 0.15],
  [1000000, 0.2], [2000000, 0.25], [5000000, 0.3], [Infinity, 0.35],
];
const FLAT_RATE = 0.6; // หักค่าใช้จ่ายเหมา 40(8)
const VAT_THRESHOLD = 1_800_000;

// หมวดรายจ่ายที่ปกติไม่ใช่ค่าใช้จ่ายของกิจการ (ปรับเองได้ในหน้าจอ)
const NON_DEDUCTIBLE_DEFAULT: string[] = ["personal", "travel", "main_food", "dessert", "investment", "debt_payment", "tax"];

const DEDUCTION_FIELDS: [string, string, number][] = [
  ["personal", "ลดหย่อนส่วนตัว", 60000],
  ["spouse", "คู่สมรส (ไม่มีเงินได้)", 0],
  ["children", "บุตร", 0],
  ["parents", "บิดามารดา", 0],
  ["social_security", "ประกันสังคม", 0],
  ["life_insurance", "เบี้ยประกันชีวิต/สุขภาพ", 0],
  ["funds", "กองทุน (RMF / SSF / ThaiESG / PVD)", 0],
  ["home_loan", "ดอกเบี้ยกู้ซื้อบ้าน", 0],
  ["donation", "เงินบริจาค", 0],
  ["other", "ค่าลดหย่อนอื่นๆ", 0],
];

interface Summary {
  year: number;
  revenue: number;
  bills: number;
  by_channel: { channel: string; revenue: number }[];
  monthly: { m: number; revenue: number }[];
  cogs: number;
  items_without_cost: number;
  purchases: number;
  expenses: { category: string; amount: number; count: number; no_doc: number }[];
}

const baht = (n: number) => `฿${(Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function progressiveTax(net: number) {
  let tax = 0, prev = 0;
  const rows: { from: number; to: number; rate: number; tax: number }[] = [];
  for (const [cap, rate] of BRACKETS) {
    if (net <= prev) break;
    const part = Math.min(net, cap) - prev;
    const t = part * rate;
    rows.push({ from: prev, to: Math.min(net, cap), rate, tax: t });
    tax += t;
    prev = cap;
  }
  return { tax, rows };
}

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export default function TaxClient() {
  const supabase = createClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [excluded, setExcluded] = useState<string[]>(NON_DEDUCTIBLE_DEFAULT);
  const [deductions, setDeductions] = useState<Record<string, string>>(
    Object.fromEntries(DEDUCTION_FIELDS.map(([k, , d]) => [k, d ? String(d) : ""]))
  );
  const [annualize, setAnnualize] = useState(true);

  useEffect(() => {
    setExcluded(load("tax-excluded", NON_DEDUCTIBLE_DEFAULT));
    setDeductions((d) => ({ ...d, ...load<Record<string, string>>(`tax-deductions-${year}`, {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    supabase.rpc("tax_estimate_summary", { p_year: year }).then(({ data, error }) => {
      setLoading(false);
      if (error) setErr(error.message);
      else setData(data as Summary);
    });
    setDeductions((d) => ({ ...Object.fromEntries(DEDUCTION_FIELDS.map(([k, , def]) => [k, def ? String(def) : ""])), ...load<Record<string, string>>(`tax-deductions-${year}`, {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  function toggleCat(c: string) {
    const next = excluded.includes(c) ? excluded.filter((x) => x !== c) : [...excluded, c];
    setExcluded(next);
    save("tax-excluded", next);
  }
  function setDed(k: string, v: string) {
    const next = { ...deductions, [k]: v };
    setDeductions(next);
    save(`tax-deductions-${year}`, next);
  }

  const calc = useMemo(() => {
    if (!data) return null;
    const isCurrent = year === thisYear;
    const now = new Date();
    const dayOfYear = Math.max(1, Math.floor((now.getTime() - new Date(thisYear, 0, 1).getTime()) / 86400000) + 1);
    const factor = isCurrent && annualize ? 365 / dayOfYear : 1;

    const revenue = Number(data.revenue) * factor;
    const cogs = Number(data.cogs) * factor;
    const deductibleExp = data.expenses.filter((e) => !excluded.includes(e.category)).reduce((t, e) => t + Number(e.amount), 0) * factor;
    const actualExpense = cogs + deductibleExp;
    const flatExpense = revenue * FLAT_RATE;
    const allowance = Object.values(deductions).reduce((t, v) => t + (Number(v) || 0), 0);

    const mk = (expense: number) => {
      const netIncome = Math.max(0, revenue - expense - allowance);
      const { tax, rows } = progressiveTax(netIncome);
      // วิธีที่ 2: 0.5% ของเงินได้ (กรณีมีเงินได้ 40(2)-(8) ตั้งแต่ 120,000 บาท) ถ้าเกิน 5,000 บาทและมากกว่าวิธีที่ 1 ต้องเสียตามวิธีที่ 2
      const method2 = revenue >= 120000 ? revenue * 0.005 : 0;
      const useMethod2 = method2 > 5000 && method2 > tax;
      return { expense, netIncome, tax: useMethod2 ? method2 : tax, method1: tax, method2, useMethod2, rows };
    };
    const flat = mk(flatExpense);
    const actual = mk(actualExpense);
    return { factor, revenue, cogs, deductibleExp, actualExpense, allowance, flat, actual, better: actual.tax < flat.tax ? "actual" : "flat" as "actual" | "flat" };
  }, [data, excluded, deductions, annualize, year, thisYear]);

  const noDoc = data ? data.expenses.filter((e) => !excluded.includes(e.category)).reduce((t, e) => t + e.no_doc, 0) : 0;
  const vatPct = data ? Math.min(100, (Number(data.revenue) / VAT_THRESHOLD) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🧮 ภาษีประมาณการ (บุคคลธรรมดา)</h1>
          <p className="text-sm text-gray-500">เทียบหักค่าใช้จ่ายแบบเหมา 60% กับหักตามจริง จากข้อมูลขายและรายจ่ายในระบบ</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">ปีภาษี</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border px-3 py-2">
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y} value={y}>{y + 543} ({y})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        ⚠️ ตัวเลขทั้งหมดเป็น<b>การประมาณการ</b>เพื่อช่วยวางแผนเท่านั้น ไม่ใช่การคำนวณเพื่อยื่นภาษีจริง — นับเฉพาะรายได้จากร้านนี้ (ยังไม่รวมเงินเดือนหรือรายได้อื่น)
        อัตราภาษี เกณฑ์ และค่าลดหย่อนอาจเปลี่ยนทุกปี ควรตรวจสอบกับกรมสรรพากรหรือนักบัญชีก่อนยื่น
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      {data && calc && (
        <>
          {year === thisYear && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={annualize} onChange={(e) => setAnnualize(e.target.checked)} />
              คาดการณ์ทั้งปีจากยอดถึงวันนี้ (คูณ {calc.factor.toFixed(2)} เท่า) — ถ้าไม่ติ๊กจะคิดจากยอดจริงถึงวันนี้
            </label>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {(["flat", "actual"] as const).map((k) => {
              const r = calc[k];
              const best = calc.better === k;
              return (
                <div key={k} className={`rounded-2xl bg-white p-5 shadow-sm ${best ? "ring-2 ring-emerald-500" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">{k === "flat" ? "แบบที่ 1: หักเหมา 60%" : "แบบที่ 2: หักค่าใช้จ่ายตามจริง"}</h2>
                    {best && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">ประหยัดกว่า ✓</span>}
                  </div>
                  <p className="mt-3 text-3xl font-bold text-gray-800">{baht(r.tax)}</p>
                  <p className="text-xs text-gray-500">ภาษีโดยประมาณ{calc.factor !== 1 ? " (ทั้งปี)" : ""}</p>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">เงินได้ (ยอดขาย)</span><span>{baht(calc.revenue)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">หักค่าใช้จ่าย</span><span>−{baht(r.expense)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">หักค่าลดหย่อน</span><span>−{baht(calc.allowance)}</span></div>
                    <div className="flex justify-between border-t pt-1 font-semibold"><span>เงินได้สุทธิ</span><span>{baht(r.netIncome)}</span></div>
                    {r.useMethod2 && (
                      <p className="text-[11px] text-amber-700">ใช้วิธี 0.5% ของเงินได้ ({baht(r.method2)}) เพราะสูงกว่าวิธีขั้นบันได ({baht(r.method1)})</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-gray-600">
            {calc.better === "actual"
              ? `หักตามจริงประหยัดกว่าประมาณ ${baht(calc.flat.tax - calc.actual.tax)} — ต้องเก็บบัญชีรายรับรายจ่ายและหลักฐานให้ครบ`
              : calc.flat.tax === calc.actual.tax
              ? "ทั้งสองแบบเสียภาษีเท่ากัน"
              : `หักเหมา 60% ประหยัดกว่าประมาณ ${baht(calc.actual.tax - calc.flat.tax)} และไม่ต้องใช้หลักฐานค่าใช้จ่าย`}
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">ค่าใช้จ่ายตามจริง (ปี {year + 543}{calc.factor !== 1 ? " · ยอดถึงวันนี้" : ""})</h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between font-medium"><span>ต้นทุนสินค้าที่ขาย</span><span>{baht(Number(data.cogs))}</span></div>
                {data.items_without_cost > 0 && (
                  <p className="text-[11px] text-red-600">มีรายการขาย {data.items_without_cost.toLocaleString()} รายการที่ต้นทุนเป็น 0 — ต้นทุนจริงอาจสูงกว่านี้ ควรกรอกราคาทุนสินค้าให้ครบ</p>
                )}
                <p className="text-[11px] text-gray-400">อ้างอิง: ยอดรับสินค้าจากใบสั่งซื้อทั้งปี {baht(Number(data.purchases))}</p>
                <div className="mt-3 border-t pt-2 text-xs text-gray-500">ติ๊กหมวดที่เป็นค่าใช้จ่ายของกิจการ (หมวดที่ไม่ติ๊กจะไม่นำมาหัก)</div>
                {data.expenses.length === 0 && <p className="text-xs text-gray-400">ยังไม่มีรายจ่ายในปีนี้</p>}
                {data.expenses.map((e) => {
                  const on = !excluded.includes(e.category);
                  return (
                    <label key={e.category} className={`flex items-center justify-between gap-2 ${on ? "" : "text-gray-400 line-through"}`}>
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={on} onChange={() => toggleCat(e.category)} />
                        {EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category}
                        <span className="text-[11px] text-gray-400">({e.count} รายการ{on && e.no_doc > 0 ? ` · ไม่มีเอกสาร ${e.no_doc}` : ""})</span>
                      </span>
                      <span>{baht(Number(e.amount))}</span>
                    </label>
                  );
                })}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>รวมค่าใช้จ่ายตามจริง</span>
                  <span>{baht(Number(data.cogs) + data.expenses.filter((e) => !excluded.includes(e.category)).reduce((t, e) => t + Number(e.amount), 0))}</span>
                </div>
                {noDoc > 0 && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    📎 มีรายจ่าย {noDoc} รายการที่ยังไม่ได้แนบเอกสาร — ถ้าจะหักตามจริง ควรเก็บใบเสร็จ/ใบกำกับภาษีให้ครบ (แนบได้ที่หน้ารายจ่าย)
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">ค่าลดหย่อน (กรอกเอง · จำไว้ในเครื่องนี้)</h2>
              <div className="grid grid-cols-2 gap-2">
                {DEDUCTION_FIELDS.map(([k, label]) => (
                  <label key={k} className="text-xs text-gray-600">
                    {label}
                    <input type="number" min={0} value={deductions[k] ?? ""} onChange={(e) => setDed(k, e.target.value)}
                      className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" placeholder="0" />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm font-semibold">รวมค่าลดหย่อน {baht(calc.allowance)}</p>
              <p className="text-[11px] text-gray-400">แต่ละรายการมีเพดานตามกฎหมาย กรอกเฉพาะยอดที่ใช้สิทธิได้จริง</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">ภาษีขั้นบันได ({calc.better === "actual" ? "แบบหักตามจริง" : "แบบหักเหมา"})</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1">ช่วงเงินได้สุทธิ</th><th className="py-1 text-right">อัตรา</th><th className="py-1 text-right">ภาษี</th></tr></thead>
                <tbody>
                  {calc[calc.better].rows.map((r) => (
                    <tr key={r.from} className="border-b last:border-0">
                      <td className="py-1">{r.from.toLocaleString()} – {r.to.toLocaleString()}</td>
                      <td className="py-1 text-right">{(r.rate * 100).toFixed(0)}%</td>
                      <td className="py-1 text-right">{baht(r.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-gray-400">ยื่นภาษีครึ่งปี (ภ.ง.ด.94) และสิ้นปี (ภ.ง.ด.90) — ภาษีที่จ่ายครึ่งปีนำมาหักตอนสิ้นปีได้</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">ยอดขายจริงปี {year + 543}</h2>
              <p className="text-2xl font-bold">{baht(Number(data.revenue))} <span className="text-sm font-normal text-gray-500">· {data.bills.toLocaleString()} บิล</span></p>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500"><span>เทียบเกณฑ์จด VAT ฿1,800,000/ปี</span><span>{vatPct.toFixed(0)}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${vatPct >= 90 ? "bg-red-500" : vatPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${vatPct}%` }} /></div>
                {vatPct >= 70 && <p className="mt-1 text-[11px] text-red-600">ยอดขายใกล้หรือเกินเกณฑ์ต้องจดทะเบียนภาษีมูลค่าเพิ่ม — ควรปรึกษานักบัญชี</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {data.by_channel.map((c) => (
                  <div key={c.channel} className="flex justify-between"><span className="text-gray-500">{SALE_CHANNEL_LABEL[c.channel as SaleChannel] ?? c.channel}</span><span>{baht(Number(c.revenue))}</span></div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-[11px]">
                {data.monthly.map((m) => (
                  <div key={m.m} className="rounded bg-gray-50 px-1.5 py-1"><p className="text-gray-400">{TH_MONTH[m.m - 1]}</p><p className="font-medium">{Math.round(Number(m.revenue)).toLocaleString()}</p></div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
