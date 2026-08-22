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
  suppliers: { name: string } | { name: string }[] | null;
}

function oneName(v: { name: string } | { name: string }[] | null): string {
  if (!v) return "-";
  return Array.isArray(v) ? v[0]?.name ?? "-" : v.name;
}

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
}: {
  payables: Payable[];
  receivedPOs: ReceivedPO[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PayableStatus>("all");
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
    const fromPO: CombinedRow[] = receivedPOs.map((po) => ({
      key: `po-${po.id}`,
      kind: "po",
      name: oneName(po.suppliers),
      amount: Number(po.po_total ?? 0),
      status: po.payment_status,
      date: po.received_at,
      dueDate: null,
      note: po.note,
      paymentNote: po.payment_note,
      invoiceNo: po.supplier_invoice_no,
    }));
    const fromManual: CombinedRow[] = payables.map((p) => ({
      key: `manual-${p.id}`,
      kind: "manual",
      name: p.creditor_name,
      amount: Number(p.amount),
      status: p.payment_status,
      date: p.created_at,
      dueDate: p.due_date,
      note: p.note,
      paymentNote: p.payment_note,
      invoiceNo: null,
      payable: p,
    }));
    return [...fromPO, ...fromManual].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [receivedPOs, payables]);

  const filtered = tab === "all" ? combined : combined.filter((r) => r.status === tab);

  const outstandingTotal = combined
    .filter((r) => r.status !== "paid")
    .reduce((s, r) => s + r.amount, 0);
  const outstandingCount = combined.filter((r) => r.status !== "paid").length;
  const overdueCount = combined.filter(
    (r) => r.status !== "paid" && r.dueDate && r.dueDate < toLocalISODate(new Date())
  ).length;

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
        creditor_name: creditorName.trim(),
        amount: Number(amount),
        due_date: dueDate || null,
        note: note.trim() || null,
      });
      if (error) throw error;
      setCreditorName("");
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
    let note: string | null = null;
    if (status === "paid" || status === "pending_transfer") {
      // บังคับกรอกหมายเหตุทุกครั้งที่กดจ่ายแล้ว หรือรอโอน (เช่น จ่าย/โอนด้วยวิธีไหน ให้ใคร)
      const label = status === "paid" ? "จ่ายแล้ว" : "รอโอน";
      const entered = window.prompt(`ระบุหมายเหตุสำหรับสถานะ "${label}" ให้ "${row.name}" (บังคับกรอก):`);
      if (entered === null) return; // ยกเลิก
      if (!entered.trim()) {
        alert("จำเป็นต้องกรอกหมายเหตุก่อนบันทึกสถานะนี้");
        return;
      }
      note = entered.trim();
    }
    if (row.status === "paid" && status !== "paid") {
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">เจ้าหนี้คงค้างทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-red-600">฿{outstandingTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
          <p className="mt-1 text-xs text-gray-400">{outstandingCount} รายการ</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">เกินกำหนดชำระ</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{overdueCount} รายการ</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">รวมทุกแหล่ง (ใบสั่งซื้อ + หนี้อื่นๆ) ที่แสดง</p>
          <p className="mt-1 text-2xl font-bold text-gray-700">{combined.length} รายการ</p>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-2 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-4">
          <input
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            placeholder="ชื่อเจ้าหนี้ (เช่น ผู้ให้เช่า, ธนาคาร, ผู้ให้บริการ)"
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
          />
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

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
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

      <div className="space-y-3">
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
                <p className="text-lg font-bold text-gray-800">฿{row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                  {row.status === "paid" && editingStatusKey !== row.key ? (
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
                  {row.kind === "manual" && row.status !== "paid" && (
                    <button onClick={() => handleDeleteManual(row)} className="text-xs font-medium text-red-500 hover:underline">
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-gray-400">ไม่มีรายการ</p>}
      </div>
    </div>
  );
}
