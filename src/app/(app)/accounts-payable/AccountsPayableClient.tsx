"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Payable, PayableStatus } from "@/lib/types";
import { PAYABLE_STATUS_LABEL, PAYABLE_STATUS_BADGE_CLASS } from "@/lib/types";

interface ReceivedPO {
  id: string;
  supplier_invoice_no: string | null;
  payment_status: PayableStatus;
  paid_at: string | null;
  payment_note: string | null;
  po_total: number | null;
  freight_cost: number;
  received_at: string;
  note: string | null;
  suppliers: SupRef | SupRef[] | null;
}

type SupRef = { name: string; credit_days?: number | null };

interface Payment {
  id: string;
  kind: "po" | "manual";
  ref_id: string;
  amount: number;
  paid_date: string;
  method: string | null;
  note: string;
  attachment_url: string | null;
  created_at: string;
}

function oneSup(v: SupRef | SupRef[] | null): SupRef | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}
function oneName(v: SupRef | SupRef[] | null): string {
  return oneSup(v)?.name ?? "-";
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHODS = ["โอนเงิน", "เงินสด", "เช็ค", "อื่นๆ"];

interface CombinedRow {
  key: string;
  kind: "po" | "manual";
  name: string;
  amount: number;
  status: PayableStatus;
  date: string;
  dueDate: string | null;
  note: string | null;
  paymentNote: string | null;
  invoiceNo: string | null;
  payable?: Payable;
  refId: string;
  paid: number;
  remaining: number;
  payments: Payment[];
  paidAt: string | null;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TABS: { key: "all" | PayableStatus; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "unpaid", label: "ยังไม่จ่าย" },
  { key: "pending_transfer", label: "รอโอน" },
  { key: "paid", label: "จ่ายแล้ว" },
];

export default function AccountsPayableClient({
  payables,
  receivedPOs,
  shopId,
  payments,
}: {
  payments: Payment[];
  payables: Payable[];
  receivedPOs: ReceivedPO[];
  shopId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PayableStatus>("all");
  const [creditorFilter, setCreditorFilter] = useState("");
  const [view, setView] = useState<"debts" | "history">("debts");
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState(METHODS[0]);
  const [payNote, setPayNote] = useState("");
  const [payLink, setPayLink] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pickedCreditor, setPickedCreditor] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [creditorName, setCreditorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busyAdd, setBusyAdd] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editingStatusKey, setEditingStatusKey] = useState<string | null>(null);

  const combined: CombinedRow[] = useMemo(() => {
    const byRef = new Map<string, Payment[]>();
    payments.forEach((pm) => {
      const k = `${pm.kind}-${pm.ref_id}`;
      byRef.set(k, [...(byRef.get(k) ?? []), pm]);
    });
    const money = (amount: number, status: PayableStatus, pays: Payment[]) => {
      const sum = pays.reduce((t, x) => t + Number(x.amount), 0);
      // รายการเก่าที่กด "จ่ายแล้ว" ก่อนมีระบบแบ่งจ่าย ไม่มีประวัติ → ถือว่าจ่ายเต็ม
      const paid = status === "paid" && pays.length === 0 ? amount : sum;
      return { paid, remaining: status === "paid" ? 0 : Math.max(amount - paid, 0) };
    };
    const fromPO: CombinedRow[] = receivedPOs.map((po) => {
      const amount = Number(po.po_total ?? 0);
      const pays = byRef.get(`po-${po.id}`) ?? [];
      const sup = oneSup(po.suppliers);
      const credit = Number(sup?.credit_days ?? 0);
      return {
        key: `po-${po.id}`,
        kind: "po" as const,
        name: sup?.name ?? "-",
        amount,
        status: po.payment_status,
        date: po.received_at,
        dueDate: credit > 0 ? addDays(po.received_at, credit) : null,
        note: po.note,
        paymentNote: po.payment_note,
        invoiceNo: po.supplier_invoice_no,
        refId: po.id,
        payments: pays,
        paidAt: po.paid_at,
        ...money(amount, po.payment_status, pays),
      };
    });
    const fromManual: CombinedRow[] = payables.map((p) => {
      const amount = Number(p.amount);
      const pays = byRef.get(`manual-${p.id}`) ?? [];
      return {
        key: `manual-${p.id}`,
        kind: "manual" as const,
        name: p.creditor_name,
        amount,
        status: p.payment_status,
        date: p.created_at,
        dueDate: p.due_date,
        note: p.note,
        paymentNote: p.payment_note,
        invoiceNo: null,
        payable: p,
        refId: p.id,
        payments: pays,
        paidAt: p.paid_at,
        ...money(amount, p.payment_status, pays),
      };
    });
    return [...fromPO, ...fromManual].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [receivedPOs, payables, payments]);

  const creditorOptions = useMemo(() => {
    const m = new Map<string, number>();
    combined.forEach((r) => {
      if (r.status !== "paid") m.set(r.name, (m.get(r.name) ?? 0) + r.amount);
      else if (!m.has(r.name)) m.set(r.name, 0);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [combined]);

  const byCreditor = creditorFilter ? combined.filter((r) => r.name === creditorFilter) : combined;
  const filtered = tab === "all" ? byCreditor : byCreditor.filter((r) => r.status === tab);

  const todayIso = toLocalISODate(new Date());
  const in7Iso = addDays(todayIso, 7);
  const monthPrefix = todayIso.slice(0, 7);
  const open = byCreditor.filter((r) => r.status !== "paid");
  const outstandingTotal = open.reduce((s, r) => s + r.remaining, 0);
  const outstandingCount = open.length;
  const overdue = open.filter((r) => r.dueDate && r.dueDate < todayIso);
  const overdueCount = overdue.length;
  const overdueTotal = overdue.reduce((s, r) => s + r.remaining, 0);
  const due7 = open.filter((r) => r.dueDate && r.dueDate <= in7Iso);
  const due7Total = due7.reduce((s, r) => s + r.remaining, 0);
  const paidThisMonth =
    payments
      .filter((pm) => pm.paid_date.startsWith(monthPrefix) && (!creditorFilter || byCreditor.some((r) => r.refId === pm.ref_id)))
      .reduce((t, pm) => t + Number(pm.amount), 0) +
    byCreditor
      .filter((r) => r.status === "paid" && r.payments.length === 0 && r.paidAt && toLocalISODate(new Date(r.paidAt)).startsWith(monthPrefix))
      .reduce((t, r) => t + r.amount, 0);
  const aging = useMemo(() => {
    const b = [
      { label: "ยังไม่ครบกำหนด", color: "#10b981", n: 0, v: 0 },
      { label: "เกิน 1–30 วัน", color: "#f59e0b", n: 0, v: 0 },
      { label: "เกิน 31–60 วัน", color: "#f97316", n: 0, v: 0 },
      { label: "เกิน 61–90 วัน", color: "#ef4444", n: 0, v: 0 },
      { label: "เกิน 90 วัน", color: "#991b1b", n: 0, v: 0 },
    ];
    open.forEach((r) => {
      let i = 0;
      if (r.dueDate && r.dueDate < todayIso) {
        const days = Math.floor((new Date(todayIso).getTime() - new Date(r.dueDate).getTime()) / 86400000);
        i = days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      }
      b[i].n += 1;
      b[i].v += r.remaining;
    });
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byCreditor, todayIso]);
  const agingMax = Math.max(1, ...aging.map((a) => a.v));
  const historyRows = useMemo(() => {
    const nameByRef = new Map(combined.map((r) => [`${r.kind}-${r.refId}`, r.name]));
    return payments
      .map((pm) => ({ ...pm, name: nameByRef.get(`${pm.kind}-${pm.ref_id}`) ?? "-" }))
      .filter((pm) => !creditorFilter || pm.name === creditorFilter);
  }, [payments, combined, creditorFilter]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!creditorName.trim()) {
      setError("กรุณาระบุชื่อเจ้าหนี้");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    setBusyAdd(true);
    setError(null);
    try {
      const { error } = await supabase.from("payables").insert({
        shop_id: shopId,
        creditor_name: creditorName.trim(),
        amount: Number(amount),
        due_date: dueDate || null,
        note: note.trim() || null,
      });
      if (error) throw error;
      setCreditorName("");
      setPickedCreditor("");
      setAmount("");
      setDueDate("");
      setNote("");
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มรายการไม่สำเร็จ");
    } finally {
      setBusyAdd(false);
    }
  }

  async function handleStatusChange(row: CombinedRow, status: PayableStatus) {
    if (status === "paid") {
      openPay(row);
      setEditingStatusKey(null);
      return;
    }
    let note: string | null = null;
    if (status === "pending_transfer") {
      // บังคับกรอกหมายเหตุทุกครั้งที่กดจ่ายแล้ว หรือรอโอน (เช่น จ่าย/โอนด้วยวิธีไหน ให้ใคร)
      const label = "รอโอน";
      const entered = window.prompt(`ระบุหมายเหตุสำหรับสถานะ "${label}" ให้ "${row.name}" (บังคับกรอก):`);
      if (entered === null) return; // ยกเลิก
      if (!entered.trim()) {
        alert("จำเป็นต้องกรอกหมายเหตุก่อนบันทึกสถานะนี้");
        return;
      }
      note = entered.trim();
    }
    if (row.status === "paid" && (status as string) !== "paid") {
      const ok = confirm(
        row.kind === "manual"
          ? `เปลี่ยนสถานะ "${row.name}" จาก "จ่ายแล้ว" กลับเป็น "${PAYABLE_STATUS_LABEL[status]}" ใช่หรือไม่? ระบบจะลบรายจ่ายที่บันทึกไว้อัตโนมัติออกด้วย`
          : `เปลี่ยนสถานะ "${row.name}" จาก "จ่ายแล้ว" กลับเป็น "${PAYABLE_STATUS_LABEL[status]}" ใช่หรือไม่?`
      );
      if (!ok) return;
    }
    setBusyKey(row.key);
    setError(null);
    try {
      if (row.kind === "po") {
        const { error } = await supabase.rpc("update_po_payment_status", {
          p_po_id: row.key.replace("po-", ""),
          p_status: status,
          p_note: note,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("update_payable_status", {
          p_payable_id: row.key.replace("manual-", ""),
          p_status: status,
          p_note: note,
        });
        if (error) throw error;
      }
      setEditingStatusKey(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  function openPay(row: CombinedRow) {
    setPayingKey(row.key);
    setPayAmount(String(Number(row.remaining.toFixed(2))));
    setPayDate(todayIso);
    setPayMethod(METHODS[0]);
    setPayNote("");
    setPayLink("");
    setError(null);
  }

  async function submitPayment(row: CombinedRow) {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return setError("กรุณากรอกจำนวนเงินที่จ่าย");
    if (amt > row.remaining + 0.005) return setError(`จำนวนเงินเกินยอดคงค้าง (฿${baht(row.remaining)})`);
    if (!payNote.trim()) return setError("กรุณากรอกหมายเหตุการจ่ายเงิน (เช่น โอนให้ใคร / เลขที่สลิป)");
    if (payLink.trim() && !/^https?:\/\//i.test(payLink.trim())) return setError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
    setBusyKey(row.key);
    setError(null);
    try {
      const { error } = await supabase.rpc("record_payable_payment", {
        p_link: payLink.trim() || null,
        p_kind: row.kind,
        p_ref_id: row.refId,
        p_amount: amt,
        p_date: payDate || todayIso,
        p_method: payMethod,
        p_note: payNote.trim(),
      });
      if (error) throw error;
      setPayingKey(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกการจ่ายไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  async function deletePayment(id: string) {
    if (!confirm("ลบรายการจ่ายเงินนี้? ยอดคงค้างจะกลับมา" )) return;
    setError(null);
    const { error } = await supabase.rpc("delete_payable_payment", { p_id: id });
    if (error) return setError(error.message);
    router.refresh();
  }

  function startEditNote(row: CombinedRow) {
    if (!row.payable) return;
    setEditingId(row.payable.id);
    setEditNote(row.payable.note ?? "");
    setEditDueDate(row.payable.due_date ?? "");
    setError(null);
  }

  function cancelEditNote() {
    setEditingId(null);
    setEditNote("");
    setEditDueDate("");
  }

  async function saveEditNote(payableId: string) {
    setError(null);
    try {
      const { error } = await supabase
        .from("payables")
        .update({ note: editNote.trim() || null, due_date: editDueDate || null })
        .eq("id", payableId);
      if (error) throw error;
      cancelEditNote();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกไม่สำเร็จ");
    }
  }

  async function handleDeleteManual(row: CombinedRow) {
    if (!row.payable) return;
    if (!confirm(`ลบรายการเจ้าหนี้ "${row.name}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("payables").delete().eq("id", row.payable.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">เจ้าหนี้การค้า</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {showAdd ? "ยกเลิก" : "+ เพิ่มหนี้ใหม่"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">เจ้าหนี้คงค้างทั้งหมด</p>
          <p className="mt-1 text-xl font-bold text-red-600 sm:text-2xl">฿{baht(outstandingTotal)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{outstandingCount} รายการที่ยังจ่ายไม่ครบ</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">ครบกำหนดภายใน 7 วัน</p>
          <p className="mt-1 text-xl font-bold text-amber-600 sm:text-2xl">฿{baht(due7Total)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{due7.length} รายการ (รวมที่เกินกำหนด) — เตรียมเงินจ่าย</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">เกินกำหนดชำระ</p>
          <p className="mt-1 text-xl font-bold text-orange-600 sm:text-2xl">฿{baht(overdueTotal)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{overdueCount} รายการ — เสี่ยงต่อความสัมพันธ์ผู้ขาย</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">จ่ายชำระเดือนนี้</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 sm:text-2xl">฿{baht(paidThisMonth)}</p>
          <p className="mt-1 text-[11px] text-gray-400">ทั้งหมด {byCreditor.length} รายการในระบบ</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-800">อายุหนี้ (นับจากวันครบกำหนด)</h2>
        <div className="space-y-2">
          {aging.map((a) => (
            <div key={a.label} className="flex items-center gap-3 text-xs">
              <span className="w-28 shrink-0 text-gray-600">{a.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                <div className="h-full rounded" style={{ width: `${(a.v / agingMax) * 100}%`, background: a.color, minWidth: a.v > 0 ? 4 : 0 }} />
              </div>
              <span className="w-44 shrink-0 text-right text-gray-700">
                ฿{baht(a.v)} <span className="text-gray-400">· {a.n} รายการ</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          รายการที่ไม่มีวันครบกำหนดนับเป็น "ยังไม่ครบกำหนด" — ตั้งเครดิต (วัน) ที่หน้า "ผู้จัดจำหน่าย" เพื่อให้ระบบคำนวณวันครบกำหนดของใบสั่งซื้ออัตโนมัติ
        </p>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-2 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-4">
          <div className="flex gap-2 sm:col-span-2">
            <select
              value={pickedCreditor}
              onChange={(e) => {
                setPickedCreditor(e.target.value);
                setCreditorName(e.target.value);
              }}
              className="w-40 shrink-0 rounded-lg border px-2 py-2 text-sm"
            >
              <option value="">เลือกเจ้าหนี้...</option>
              {creditorOptions.map(([n]) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <input
              value={creditorName}
              onChange={(e) => {
                setCreditorName(e.target.value);
                setPickedCreditor("");
              }}
              placeholder="หรือพิมพ์ชื่อเจ้าหนี้ใหม่"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="จำนวนเงิน"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ถ้ามี)"
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-4"
          />
          <button
            type="submit"
            disabled={busyAdd}
            className="rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-4"
          >
            {busyAdd ? "กำลังบันทึก..." : "บันทึกรายการเจ้าหนี้"}
          </button>
          <p className="text-xs text-gray-400 sm:col-span-4">
            ใช้สำหรับหนี้สินอื่นๆ ที่ไม่ได้มาจากใบสั่งซื้อสินค้า เช่น ค่าเช่า เงินกู้ ค่าบริการ — เมื่อกด "จ่ายแล้ว" ระบบจะบันทึกเป็นรายจ่ายในหมวด "ชำระหนี้เจ้าหนี้การค้า" ให้อัตโนมัติ
          </p>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-3 flex gap-2 border-b text-sm">
        <button onClick={() => setView("debts")} className={`-mb-px border-b-2 px-3 py-2 font-medium ${view === "debts" ? "border-brand text-brand" : "border-transparent text-gray-500"}`}>
          รายการเจ้าหนี้
        </button>
        <button onClick={() => setView("history")} className={`-mb-px border-b-2 px-3 py-2 font-medium ${view === "history" ? "border-brand text-brand" : "border-transparent text-gray-500"}`}>
          ประวัติการจ่ายเงิน ({historyRows.length})
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={creditorFilter}
          onChange={(e) => setCreditorFilter(e.target.value)}
          className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium"
        >
          <option value="">เจ้าหนี้ทั้งหมด ({creditorOptions.length})</option>
          {creditorOptions.map(([n, owed]) => (
            <option key={n} value={n}>
              {n}{owed > 0 ? ` — ค้าง ฿${owed.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : ""}
            </option>
          ))}
        </select>
        {view === "debts" && TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === t.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "history" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3">วันที่จ่าย</th>
                <th className="px-4 py-3">เจ้าหนี้</th>
                <th className="px-4 py-3">วิธีจ่าย</th>
                <th className="px-4 py-3">หมายเหตุ</th>
                <th className="px-4 py-3 text-right">จำนวนเงิน (฿)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((pm) => (
                <tr key={pm.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(pm.paid_date).toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-3 font-medium">{pm.name}</td>
                  <td className="px-4 py-3 text-gray-500">{pm.method ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {pm.note}
                    {pm.attachment_url && (
                      <a href={pm.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-medium text-brand hover:underline">🔗 ไฟล์แนบ</a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{baht(Number(pm.amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deletePayment(pm.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                  </td>
                </tr>
              ))}
              {historyRows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">ยังไม่มีประวัติการจ่ายเงิน</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className={`space-y-3 ${view === "history" ? "hidden" : ""}`}>
        {filtered.map((row) => (
          <div key={row.key} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">{row.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PAYABLE_STATUS_BADGE_CLASS[row.status]}`}>
                    {PAYABLE_STATUS_LABEL[row.status]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.kind === "po" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                    {row.kind === "po" ? "จากใบสั่งซื้อ" : "บันทึกเอง"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {row.kind === "po" ? "รับสินค้าเมื่อ" : "บันทึกเมื่อ"} {new Date(row.date).toLocaleDateString("th-TH")}
                  {row.invoiceNo && ` · เลขที่บิล: ${row.invoiceNo}`}
                  {row.dueDate && (
                    <span className={row.status !== "paid" && row.dueDate < toLocalISODate(new Date()) ? "font-medium text-orange-600" : ""}>
                      {" "}
                      · กำหนดชำระ {new Date(row.dueDate).toLocaleDateString("th-TH")}
                    </span>
                  )}
                </p>
                {editingId === row.payable?.id ? (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-dashed p-2">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full rounded-lg border px-2 py-1 text-xs sm:w-48"
                    />
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="หมายเหตุ"
                      rows={2}
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEditNote(row.payable!.id)}
                        className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
                      >
                        บันทึก
                      </button>
                      <button onClick={cancelEditNote} className="rounded-lg border px-3 py-1 text-xs">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  row.note && <p className="mt-1 text-xs text-gray-500">หมายเหตุ: {row.note}</p>
                )}
                {row.paymentNote && (
                  <p className="mt-1 text-xs font-medium text-green-700">หมายเหตุการจ่ายเงิน: {row.paymentNote}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-800">฿{baht(row.amount)}</p>
                {row.status !== "paid" && row.paid > 0 && (
                  <p className="text-xs text-gray-500">
                    จ่ายแล้ว <span className="text-emerald-700">฿{baht(row.paid)}</span> · คงค้าง <span className="font-semibold text-red-600">฿{baht(row.remaining)}</span>
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                  {row.status !== "paid" && payingKey !== row.key && (
                    <button onClick={() => openPay(row)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                      {row.paid > 0 ? "จ่ายเพิ่ม" : "บันทึกการจ่าย"}
                    </button>
                  )}
                  {row.payments.length > 0 && (
                    <button onClick={() => setExpandedKey(expandedKey === row.key ? null : row.key)} className="text-xs font-medium text-brand hover:underline">
                      {expandedKey === row.key ? "ซ่อนประวัติ" : `ประวัติจ่าย (${row.payments.length})`}
                    </button>
                  )}
                  {row.payments.length > 0 ? null : row.status === "paid" && editingStatusKey !== row.key ? (
                    <button
                      onClick={() => setEditingStatusKey(row.key)}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      แก้ไขสถานะ
                    </button>
                  ) : (
                    <>
                      <select
                        value={row.status}
                        disabled={busyKey === row.key}
                        onChange={(e) => handleStatusChange(row, e.target.value as PayableStatus)}
                        className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="unpaid">ยังไม่จ่าย</option>
                        <option value="pending_transfer">รอโอน</option>
                        <option value="paid">จ่ายแล้ว</option>
                      </select>
                      {row.status === "paid" && (
                        <button
                          onClick={() => setEditingStatusKey(null)}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </>
                  )}
                  {row.kind === "manual" && editingId !== row.payable?.id && (
                    <button onClick={() => startEditNote(row)} className="text-xs font-medium text-brand hover:underline">
                      แก้ไข
                    </button>
                  )}
                  {row.kind === "manual" && row.status !== "paid" && row.payments.length === 0 && (
                    <button onClick={() => handleDeleteManual(row)} className="text-xs font-medium text-red-500 hover:underline">
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            </div>

            {payingKey === row.key && (
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 sm:grid-cols-4">
                <label className="text-xs text-gray-600">
                  จำนวนเงินที่จ่าย (คงค้าง ฿{baht(row.remaining)})
                  <input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">
                  วันที่จ่าย
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">
                  วิธีจ่าย
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  หมายเหตุ (บังคับ)
                  <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="เช่น โอนเข้า SCB / เลขสลิป" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600 sm:col-span-4">
                  ลิงก์หลักฐาน เช่น Google Drive / OneDrive (ไม่บังคับ)
                  <input value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://drive.google.com/..." className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                </label>
                <div className="flex gap-2 sm:col-span-4">
                  <button disabled={busyKey === row.key} onClick={() => submitPayment(row)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {busyKey === row.key ? "กำลังบันทึก..." : "บันทึกการจ่าย"}
                  </button>
                  <button onClick={() => setPayingKey(null)} className="rounded-lg border bg-white px-4 py-2 text-xs">ยกเลิก</button>
                  <button type="button" onClick={() => setPayAmount(String(Number(row.remaining.toFixed(2))))} className="ml-auto text-xs text-brand hover:underline">จ่ายเต็มจำนวน</button>
                </div>
              </div>
            )}

            {expandedKey === row.key && row.payments.length > 0 && (
              <div className="mt-3 rounded-xl bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-600">ประวัติการจ่ายเงิน</p>
                <ul className="divide-y text-xs">
                  {row.payments.map((pm) => (
                    <li key={pm.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span className="text-gray-600">
                        {new Date(pm.paid_date).toLocaleDateString("th-TH")} · {pm.method ?? "-"} · {pm.note}
                        {pm.attachment_url && (
                          <a href={pm.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-medium text-brand hover:underline">🔗 เปิดไฟล์แนบ</a>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-semibold text-emerald-700">฿{baht(Number(pm.amount))}</span>
                        <button onClick={() => deletePayment(pm.id)} className="text-red-500 hover:underline">ลบ</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-gray-400">ไม่มีรายการ</p>}
      </div>
    </div>
  );
}
