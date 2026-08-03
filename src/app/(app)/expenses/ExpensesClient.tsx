"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EXPENSE_CATEGORY_LABEL,
  RECURRING_EXPENSE_CATEGORIES,
  THAI_MONTH_ABBR,
  type Expense,
  type ExpenseCategory,
  type RecurringExpense,
  type RecurringExpenseCategory,
} from "@/lib/types";

const sourceLabel: Record<Expense["source"], string> = {
  manual: "บันทึกเอง",
  po_freight: "ค่าขนส่ง (ใบสั่งซื้อ)",
  recurring: "รายการประจำ",
};

const sourceBadgeClass: Record<Expense["source"], string> = {
  manual: "bg-gray-100 text-gray-600",
  po_freight: "bg-blue-100 text-blue-700",
  recurring: "bg-purple-100 text-purple-700",
};

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// หาวันที่ครั้งถัดไปที่ตรงกับเดือนที่เลือกไว้ของรายการประจำนี้ (มองไปข้างหน้าได้ถึง 2 ปี) ใช้เป็นค่าเริ่มต้นตอนวางแผนล่วงหน้า
function nextOccurrenceDate(rec: RecurringExpense, afterStr: string): string {
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, rec.day_of_month);
    if (rec.months.includes(d.getMonth() + 1)) {
      const iso = toLocalISODate(d);
      if (iso > afterStr) return iso;
    }
  }
  return afterStr;
}

export default function ExpensesClient({
  initialExpenses,
  initialRecurring,
}: {
  initialExpenses: Expense[];
  initialRecurring: RecurringExpense[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [recurring, setRecurring] = useState(initialRecurring);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("water");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => toLocalISODate(new Date()));
  const [note, setNote] = useState("");
  const [busyExpense, setBusyExpense] = useState(false);

  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [rCategory, setRCategory] = useState<RecurringExpenseCategory>("water");
  const [rAmount, setRAmount] = useState("");
  const [rDay, setRDay] = useState("1");
  const [rMonths, setRMonths] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [rNote, setRNote] = useState("");
  const [busyRecurring, setBusyRecurring] = useState(false);

  const [planningId, setPlanningId] = useState<string | null>(null);
  const [planningDate, setPlanningDate] = useState("");
  const [busyPlanning, setBusyPlanning] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const todayStr = toLocalISODate(new Date());
  const totalLoaded = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const thisMonthKey = todayStr.slice(0, 7);
  const totalThisMonth = expenses
    .filter((e) => e.expense_date.slice(0, 7) === thisMonthKey)
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalUpcoming = expenses
    .filter((e) => e.expense_date > todayStr)
    .reduce((s, e) => s + Number(e.amount), 0);

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    setBusyExpense(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          category,
          amount: Number(amount),
          expense_date: expenseDate,
          note: note || null,
          source: "manual",
        })
        .select()
        .single();
      if (error) throw error;
      setExpenses((prev) => [data, ...prev]);
      setAmount("");
      setNote("");
      setShowAddExpense(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกรายจ่ายไม่สำเร็จ");
    } finally {
      setBusyExpense(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("ลบรายการรายจ่ายนี้?")) return;
    setError(null);
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ");
    }
  }

  function toggleMonth(m: number) {
    setRMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)));
  }

  async function handleAddRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!rAmount || Number(rAmount) <= 0) {
      setError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    if (rMonths.length === 0) {
      setError("กรุณาเลือกเดือนที่มีรายจ่ายนี้อย่างน้อย 1 เดือน");
      return;
    }
    setBusyRecurring(true);
    setError(null);
    try {
      // บันทึกไว้เป็นแค่ตัวเตือนรายการประจำ ไม่มีการสร้างรายจ่ายให้อัตโนมัติ ต้องกด "บันทึกเป็นรายจ่าย" เองทุกครั้งที่ถึงกำหนดจ่ายจริง
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({
          category: rCategory,
          amount: Number(rAmount),
          day_of_month: Number(rDay),
          months: rMonths,
          note: rNote || null,
        })
        .select()
        .single();
      if (error) throw error;

      setRecurring((prev) => [...prev, data].sort((a, b) => a.day_of_month - b.day_of_month));
      setRAmount("");
      setRNote("");
      setRDay("1");
      setRMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      setShowAddRecurring(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มรายการประจำไม่สำเร็จ");
    } finally {
      setBusyRecurring(false);
    }
  }

  async function handleRecordNow(rec: RecurringExpense) {
    if (!confirm(`บันทึกเป็นรายจ่ายวันนี้ ${EXPENSE_CATEGORY_LABEL[rec.category]} ฿${Number(rec.amount).toLocaleString("th-TH")}?`)) return;
    setError(null);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          category: rec.category,
          amount: rec.amount,
          expense_date: toLocalISODate(new Date()),
          note: rec.note,
          source: "recurring",
          recurring_id: rec.id,
        })
        .select()
        .single();
      if (error) throw error;
      setExpenses((prev) => [data, ...prev]);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกรายจ่ายไม่สำเร็จ");
    }
  }

  function openPlanning(rec: RecurringExpense) {
    setPlanningId(rec.id);
    setPlanningDate(nextOccurrenceDate(rec, todayStr));
    setError(null);
  }

  function closePlanning() {
    setPlanningId(null);
    setPlanningDate("");
  }

  async function handleSavePlanned(rec: RecurringExpense) {
    if (!planningDate) {
      setError("กรุณาเลือกวันที่ที่ต้องการวางแผน");
      return;
    }
    setBusyPlanning(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          category: rec.category,
          amount: rec.amount,
          expense_date: planningDate,
          note: rec.note,
          source: "recurring",
          recurring_id: rec.id,
        })
        .select()
        .single();
      if (error) throw error;
      setExpenses((prev) => [...prev, data].sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1)));
      closePlanning();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกแผนล่วงหน้าไม่สำเร็จ");
    } finally {
      setBusyPlanning(false);
    }
  }

  async function handleToggleRecurring(rec: RecurringExpense) {
    setError(null);
    try {
      const { error } = await supabase
        .from("recurring_expenses")
        .update({ active: !rec.active })
        .eq("id", rec.id);
      if (error) throw error;
      setRecurring((prev) => prev.map((r) => (r.id === rec.id ? { ...r, active: !r.active } : r)));
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleDeleteRecurring(id: string) {
    if (!confirm("ลบรายการประจำนี้? (รายจ่ายที่บันทึกไปแล้วจะไม่ถูกลบ)")) return;
    setError(null);
    try {
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">รายจ่าย</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">รายจ่ายเดือนนี้</p>
          <p className="mt-1 text-2xl font-bold text-red-600">฿{totalThisMonth.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">วางแผนล่วงหน้า (ยังไม่ถึงกำหนด)</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">฿{totalUpcoming.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">รวม {expenses.length} รายการล่าสุดที่แสดง</p>
          <p className="mt-1 text-2xl font-bold text-gray-700">฿{totalLoaded.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">รายการประจำ (ตัวเตือน ไม่บันทึกอัตโนมัติ)</h2>
          <button
            onClick={() => setShowAddRecurring((v) => !v)}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            {showAddRecurring ? "ยกเลิก" : "+ เพิ่มรายการประจำ"}
          </button>
        </div>

        {showAddRecurring && (
          <form onSubmit={handleAddRecurring} className="mb-4 space-y-3 rounded-xl border p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select value={rCategory} onChange={(e) => setRCategory(e.target.value as RecurringExpenseCategory)} className="rounded-lg border px-3 py-2 text-sm">
                {RECURRING_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
              <input type="number" min={0} step="0.01" placeholder="จำนวนเงิน" value={rAmount} onChange={(e) => setRAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
              <input type="number" min={1} max={28} placeholder="วันที่ของเดือน (1-28)" value={rDay} onChange={(e) => setRDay(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="หมายเหตุ" value={rNote} onChange={(e) => setRNote(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">เดือนที่มีรายจ่ายนี้</label>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setRMonths([1,2,3,4,5,6,7,8,9,10,11,12])} className="text-brand hover:underline">เลือกทุกเดือน</button>
                  <button type="button" onClick={() => setRMonths([])} className="text-gray-400 hover:underline">ล้างทั้งหมด</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
                {THAI_MONTH_ABBR.map((label, idx) => {
                  const m = idx + 1;
                  const selected = rMonths.includes(m);
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => toggleMonth(m)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                        selected ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                เลือกทุกเดือนถ้าจ่ายทุกเดือน (เช่น ค่าน้ำ ค่าไฟ) หรือเลือกเฉพาะเดือนที่จ่ายจริงถ้าจ่ายปีละ 1-2 ครั้ง (เช่น ค่าประกัน)
                รายการนี้จะเป็นแค่ตัวเตือน ไม่มีการสร้างรายจ่ายให้อัตโนมัติ ต้องกด "บันทึกวันนี้" ด้านล่างเองทุกครั้งที่ถึงกำหนดจ่ายจริง
              </p>
            </div>

            <button type="submit" disabled={busyRecurring} className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {busyRecurring ? "กำลังบันทึก..." : "บันทึกรายการประจำ"}
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">หมวดหมู่</th>
                <th className="py-2 text-right">จำนวนเงิน/งวด</th>
                <th className="py-2 text-center">วันที่บันทึก</th>
                <th className="py-2">เดือนที่มีรายจ่าย</th>
                <th className="py-2">หมายเหตุ</th>
                <th className="py-2 text-center">สถานะ</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b last:border-0">
                    <td className="py-2">{EXPENSE_CATEGORY_LABEL[r.category]}</td>
                    <td className="py-2 text-right font-medium">฿{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-center text-gray-500">วันที่ {r.day_of_month}</td>
                    <td className="py-2 text-gray-500">
                      {r.months.length === 12 ? "ทุกเดือน" : r.months.map((m) => THAI_MONTH_ABBR[m - 1]).join(", ")}
                    </td>
                    <td className="py-2 text-gray-500">{r.note ?? "-"}</td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => handleToggleRecurring(r)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {r.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </button>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-3">
                        <button onClick={() => handleRecordNow(r)} className="font-medium text-brand hover:underline">บันทึกวันนี้</button>
                        <button
                          onClick={() => (planningId === r.id ? closePlanning() : openPlanning(r))}
                          className="font-medium text-orange-600 hover:underline"
                        >
                          วางแผนล่วงหน้า
                        </button>
                        <button onClick={() => handleDeleteRecurring(r.id)} className="text-red-500 hover:underline">ลบ</button>
                      </div>
                    </td>
                  </tr>
                  {planningId === r.id && (
                    <tr className="border-b bg-orange-50/60 last:border-0">
                      <td colSpan={7} className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-xs text-gray-500">
                            วางแผนบันทึกล่วงหน้า {EXPENSE_CATEGORY_LABEL[r.category]} ฿{Number(r.amount).toLocaleString("th-TH")} วันที่
                          </span>
                          <input
                            type="date"
                            value={planningDate}
                            onChange={(e) => setPlanningDate(e.target.value)}
                            className="rounded-lg border px-3 py-1.5 text-sm"
                          />
                          <button
                            onClick={() => handleSavePlanned(r)}
                            disabled={busyPlanning}
                            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                          >
                            {busyPlanning ? "กำลังบันทึก..." : "บันทึกแผนล่วงหน้า"}
                          </button>
                          <button onClick={closePlanning} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">
                            ยกเลิก
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {recurring.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">ยังไม่มีรายการประจำ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">รายจ่ายทั้งหมด (200 รายการล่าสุด)</h2>
          <button
            onClick={() => setShowAddExpense((v) => !v)}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            {showAddExpense ? "ยกเลิก" : "+ บันทึกรายจ่าย"}
          </button>
        </div>

        {showAddExpense && (
          <form onSubmit={handleAddExpense} className="mb-4 grid grid-cols-1 gap-2 rounded-xl border p-4 sm:grid-cols-4">
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="rounded-lg border px-3 py-2 text-sm">
              {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[])
                .filter((c) => c !== "shipping")
                .map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
                ))}
            </select>
            <input type="number" min={0} step="0.01" placeholder="จำนวนเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <input placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <button type="submit" disabled={busyExpense} className="sm:col-span-4 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {busyExpense ? "กำลังบันทึก..." : "บันทึกรายจ่าย"}
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">วันที่</th>
                <th className="py-2">หมวดหมู่</th>
                <th className="py-2 text-right">จำนวนเงิน</th>
                <th className="py-2">ที่มา</th>
                <th className="py-2">หมายเหตุ</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={`border-b last:border-0 ${e.expense_date > todayStr ? "bg-orange-50/50" : ""}`}>
                  <td className="py-2 text-gray-500">{new Date(e.expense_date).toLocaleDateString("th-TH")}</td>
                  <td className="py-2">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                  <td className="py-2 text-right font-medium">฿{Number(e.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadgeClass[e.source]}`}>{sourceLabel[e.source]}</span>
                    {e.expense_date > todayStr && (
                      <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">วางแผนล่วงหน้า</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-500">{e.note ?? "-"}</td>
                  <td className="py-2 text-right">
                    {e.source !== "po_freight" && (
                      <button onClick={() => handleDeleteExpense(e.id)} className="text-red-500 hover:underline">ลบ</button>
                    )}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">ยังไม่มีรายการรายจ่าย</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
