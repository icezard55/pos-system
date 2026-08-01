"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EXPENSE_CATEGORY_LABEL,
  RECURRING_EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type RecurringExpense,
  type RecurringExpenseCategory,
} from "@/lib/types";

const sourceLabel: Record<Expense["source"], string> = {
  manual: "บันทึกเอง",
  po_freight: "ค่าขนส่ง (ใบสั่งซื้อ)",
  recurring: "รายการประจำ (อัตโนมัติ)",
};

const sourceBadgeClass: Record<Expense["source"], string> = {
  manual: "bg-gray-100 text-gray-600",
  po_freight: "bg-blue-100 text-blue-700",
  recurring: "bg-purple-100 text-purple-700",
};

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
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busyExpense, setBusyExpense] = useState(false);

  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [rCategory, setRCategory] = useState<RecurringExpenseCategory>("water");
  const [rAmount, setRAmount] = useState("");
  const [rDay, setRDay] = useState("1");
  const [rNote, setRNote] = useState("");
  const [busyRecurring, setBusyRecurring] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const totalLoaded = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const totalThisMonth = expenses
    .filter((e) => e.expense_date.slice(0, 7) === thisMonthKey)
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

  async function handleAddRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!rAmount || Number(rAmount) <= 0) {
      setError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    setBusyRecurring(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({
          category: rCategory,
          amount: Number(rAmount),
          day_of_month: Number(rDay),
          note: rNote || null,
        })
        .select()
        .single();
      if (error) throw error;
      setRecurring((prev) => [...prev, data].sort((a, b) => a.day_of_month - b.day_of_month));
      setRAmount("");
      setRNote("");
      setRDay("1");
      setShowAddRecurring(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มรายการประจำไม่สำเร็จ");
    } finally {
      setBusyRecurring(false);
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">รายจ่ายเดือนนี้</p>
          <p className="mt-1 text-2xl font-bold text-red-600">฿{totalThisMonth.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">รวม {expenses.length} รายการล่าสุดที่แสดง</p>
          <p className="mt-1 text-2xl font-bold text-gray-700">฿{totalLoaded.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">รายการประจำ (บันทึกอัตโนมัติทุกเดือน)</h2>
          <button
            onClick={() => setShowAddRecurring((v) => !v)}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            {showAddRecurring ? "ยกเลิก" : "+ เพิ่มรายการประจำ"}
          </button>
        </div>

        {showAddRecurring && (
          <form onSubmit={handleAddRecurring} className="mb-4 grid grid-cols-1 gap-2 rounded-xl border p-4 sm:grid-cols-4">
            <select value={rCategory} onChange={(e) => setRCategory(e.target.value as RecurringExpenseCategory)} className="rounded-lg border px-3 py-2 text-sm">
              {RECURRING_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
            <input type="number" min={0} step="0.01" placeholder="จำนวนเงิน" value={rAmount} onChange={(e) => setRAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <div>
              <input type="number" min={1} max={28} placeholder="วันที่ของเดือน (1-28)" value={rDay} onChange={(e) => setRDay(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              <p className="mt-1 text-[11px] text-gray-400">ระบบจะบันทึกอัตโนมัติทุกวันที่นี้ของเดือน</p>
            </div>
            <input placeholder="หมายเหตุ" value={rNote} onChange={(e) => setRNote(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <button type="submit" disabled={busyRecurring} className="sm:col-span-4 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {busyRecurring ? "กำลังบันทึก..." : "บันทึกรายการประจำ"}
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">หมวดหมู่</th>
                <th className="py-2 text-right">จำนวนเงิน/เดือน</th>
                <th className="py-2 text-center">วันที่บันทึก</th>
                <th className="py-2">หมายเหตุ</th>
                <th className="py-2 text-center">สถานะ</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{EXPENSE_CATEGORY_LABEL[r.category]}</td>
                  <td className="py-2 text-right font-medium">฿{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-center text-gray-500">ทุกวันที่ {r.day_of_month}</td>
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
                    <button onClick={() => handleDeleteRecurring(r.id)} className="text-red-500 hover:underline">ลบ</button>
                  </td>
                </tr>
              ))}
              {recurring.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">ยังไม่มีรายการประจำ</td></tr>
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
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-500">{new Date(e.expense_date).toLocaleDateString("th-TH")}</td>
                  <td className="py-2">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                  <td className="py-2 text-right font-medium">฿{Number(e.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadgeClass[e.source]}`}>{sourceLabel[e.source]}</span>
                  </td>
                  <td className="py-2 text-gray-500">{e.note ?? "-"}</td>
                  <td className="py-2 text-right">
                    {e.source === "manual" && (
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
