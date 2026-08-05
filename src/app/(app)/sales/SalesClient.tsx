"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Sale, SaleChannel } from "@/lib/types";
import { SALE_CHANNEL_LABEL, SALE_PAYMENT_STATUS_LABEL } from "@/lib/types";

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SALE_HEADER_MAP: Record<string, string> = {
  bill_no: "bill_no", "เลขที่บิล": "bill_no", "เลขบิล": "bill_no",
  date: "date", "วันที่": "date",
  sku: "sku", "รหัสสินค้า": "sku", "รหัส": "sku",
  product_name: "product_name", "ชื่อสินค้า": "product_name",
  qty: "qty", "จำนวน": "qty",
  unit_price: "unit_price", "ราคาต่อหน่วย": "unit_price", "ราคา": "unit_price",
  discount: "discount", "ส่วนลด": "discount",
  payment_method: "payment_method", "ช่องทางชำระ": "payment_method", "ชำระโดย": "payment_method",
  customer_name: "customer_name", "ชื่อลูกค้า": "customer_name",
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "cash", เงินสด: "cash",
  transfer: "transfer", โอน: "transfer", เงินโอน: "transfer",
  card: "card", บัตร: "card", บัตรเครดิต: "card",
  credit: "credit", เชื่อ: "credit",
};

interface ImportedItem {
  sku: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount: number;
}

interface ImportedBillGroup {
  bill_no: string;
  date: string;
  customer_name: string;
  payment_method: string;
  items: ImportedItem[];
}

export default function SalesClient({
  sales,
  isAdmin,
  startDate,
  endDate,
  currentUserEmail,
}: {
  sales: Sale[];
  isAdmin: boolean;
  startDate: string;
  endDate: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [channelFilter, setChannelFilter] = useState<SaleChannel | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [receiveTarget, setReceiveTarget] = useState<Sale | null>(null);
  const [receiveDate, setReceiveDate] = useState(toLocalISODate(new Date()));
  const [receiving, setReceiving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = sales.filter(
    (s) =>
      (s.sale_no.toLowerCase().includes(search.toLowerCase()) || (s.customer_name ?? "").toLowerCase().includes(search.toLowerCase())) &&
      (channelFilter === "all" || s.channel === channelFilter) &&
      (paymentFilter === "all" || s.payment_status === paymentFilter)
  );

  function openReceiveConfirm(sale: Sale) {
    setReceiveTarget(sale);
    setReceiveDate(toLocalISODate(new Date()));
  }

  async function handleConfirmReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveTarget) return;
    setReceiving(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("set_sale_payment_status", {
        p_sale_id: receiveTarget.id,
        p_paid: true,
        p_received_date: receiveDate,
      });
      if (error) throw error;
      setReceiveTarget(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตสถานะรับเงินไม่สำเร็จ");
    } finally {
      setReceiving(false);
    }
  }

  async function handleUndoReceive(sale: Sale) {
    setError(null);
    try {
      const { error } = await supabase.rpc("set_sale_payment_status", {
        p_sale_id: sale.id,
        p_paid: false,
      });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตสถานะรับเงินไม่สำเร็จ");
    }
  }

  const todayTotal = sales
    .filter((s) => s.status !== "void" && new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + Number(s.total), 0);

  function applyRange() {
    router.push(`/sales?start=${start}&end=${end}`);
  }

  function openVoidConfirm(sale: Sale) {
    setVoidTarget(sale);
    setConfirmPassword("");
    setReauthError(null);
  }

  async function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    setReauthError(null);
    setVoidingId(voidTarget.id);
    try {
      // require the admin to re-enter their own password before an irreversible void
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUserEmail,
        password: confirmPassword,
      });
      if (authError) throw new Error("รหัสผ่านไม่ถูกต้อง");

      const { error } = await supabase.rpc("void_sale", { p_sale_id: voidTarget.id });
      if (error) throw error;
      setVoidTarget(null);
      router.refresh();
    } catch (err: any) {
      setReauthError(err.message ?? "ยกเลิกบิลไม่สำเร็จ");
    } finally {
      setVoidingId(null);
    }
  }

  function downloadSalesTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        "เลขที่บิล": "OLD-0001",
        "วันที่": "2026-01-15",
        "รหัสสินค้า": "SKU001",
        "ชื่อสินค้า": "ตัวอย่างสินค้า",
        "จำนวน": 2,
        "ราคาต่อหน่วย": 50,
        "ส่วนลด": 0,
        "ช่องทางชำระ": "เงินสด",
        "ชื่อลูกค้า": "",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "sales");
    XLSX.writeFile(wb, "template_นำเข้าประวัติการขาย.xlsx");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const rows = raw
        .map((row) => {
          const mapped: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const norm = SALE_HEADER_MAP[key.trim()] ?? SALE_HEADER_MAP[key.trim().toLowerCase()];
            if (norm) mapped[norm] = row[key];
          }
          return mapped;
        })
        .filter((r) => (r.qty && Number(r.qty) > 0) && (String(r.sku ?? "").trim() || String(r.product_name ?? "").trim()));

      if (rows.length === 0) {
        setImportMsg("ไม่พบข้อมูลที่ใช้ได้ในไฟล์ กรุณาตรวจสอบหัวคอลัมน์ เช่น เลขที่บิล, รหัสสินค้า, จำนวน, ราคาต่อหน่วย");
        return;
      }

      // จัดกลุ่มแถวตาม "เลขที่บิล" ให้เป็น 1 บิลขาย 1 รายการ ถ้าไม่ระบุเลขที่บิลจะถือว่าเป็นบิลของตัวเอง 1 รายการ
      const groups = new Map<string, ImportedBillGroup>();
      let anonCounter = 0;
      rows.forEach((r) => {
        const billNo = String(r.bill_no ?? "").trim() || `__anon_${anonCounter++}`;
        if (!groups.has(billNo)) {
          groups.set(billNo, {
            bill_no: String(r.bill_no ?? "").trim(),
            date: String(r.date ?? "").trim(),
            customer_name: String(r.customer_name ?? "").trim(),
            payment_method: String(r.payment_method ?? "").trim(),
            items: [],
          });
        }
        const g = groups.get(billNo)!;
        if (!g.date && r.date) g.date = String(r.date).trim();
        if (!g.customer_name && r.customer_name) g.customer_name = String(r.customer_name).trim();
        if (!g.payment_method && r.payment_method) g.payment_method = String(r.payment_method).trim();
        g.items.push({
          sku: String(r.sku ?? "").trim(),
          product_name: String(r.product_name ?? "").trim(),
          qty: Number(r.qty) || 0,
          unit_price: Number(r.unit_price) || 0,
          discount: Number(r.discount) || 0,
        });
      });

      let successCount = 0;
      const errors: string[] = [];

      for (const g of groups.values()) {
        try {
          const paymentKey = g.payment_method.toLowerCase();
          const mappedMethod = PAYMENT_METHOD_MAP[paymentKey] ?? PAYMENT_METHOD_MAP[g.payment_method] ?? "cash";
          let saleDate: string | null = null;
          if (g.date) {
            const parsed = new Date(g.date);
            if (!isNaN(parsed.getTime())) saleDate = parsed.toISOString();
          }
          const { error: rpcError } = await supabase.rpc("import_historical_sale", {
            p_sale_no: g.bill_no || null,
            p_sale_date: saleDate,
            p_customer_name: g.customer_name || null,
            p_payment_method: mappedMethod,
            p_items: g.items.map((it) => ({
              sku: it.sku || null,
              product_name: it.product_name || null,
              qty: it.qty,
              unit_price: it.unit_price,
              discount: it.discount,
            })),
          });
          if (rpcError) throw rpcError;
          successCount++;
        } catch (err: any) {
          errors.push(`${g.bill_no || "(ไม่ระบุเลขที่บิล)"}: ${err.message ?? err}`);
        }
      }

      setImportMsg(
        `นำเข้าสำเร็จ ${successCount} บิล จากทั้งหมด ${groups.size} บิล` +
          (errors.length > 0 ? ` — ล้มเหลว ${errors.length} บิล: ${errors.join(" | ")}` : "")
      );
      router.refresh();
    } catch (err: any) {
      setImportMsg(`นำเข้าไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ประวัติการขาย</h1>
        <p className="text-sm text-gray-500">
          ยอดขายวันนี้: <span className="font-bold text-brand">฿{todayTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        </p>
      </div>

      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <span className="text-sm font-medium text-gray-700">นำเข้าประวัติการขายเก่า:</span>
          <button onClick={downloadSalesTemplate} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            ⬇️ ดาวน์โหลดเทมเพลต
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            {importing ? "กำลังนำเข้า..." : "📥 นำเข้าจาก Excel"}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing} className="hidden" />
          </label>
          <span className="text-xs text-gray-400">
            สำหรับย้อนบันทึกบิลเก่า/ข้อมูลจากระบบอื่น เก็บเป็นประวัติเท่านั้น ไม่ตัดสต๊อกหรือให้แต้มสะสม
          </span>
        </div>
      )}
      {importMsg && <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{importMsg}</div>}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleConfirmVoid} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 font-bold text-gray-800">ยืนยันยกเลิกบิล {voidTarget.sale_no}</h2>
            <p className="mb-3 text-xs text-gray-500">สต๊อกสินค้าจะถูกคืนกลับอัตโนมัติ และไม่สามารถย้อนกลับได้ กรุณายืนยันตัวตนด้วยรหัสผ่านของคุณ</p>
            <input
              type="password"
              autoFocus
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="รหัสผ่านของคุณ"
              required
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            />
            {reauthError && <p className="mb-3 text-sm text-red-600">{reauthError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={voidingId === voidTarget.id}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {voidingId === voidTarget.id ? "กำลังยกเลิก..." : "ยืนยันยกเลิกบิล"}
              </button>
              <button type="button" onClick={() => setVoidTarget(null)} className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50">
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleConfirmReceive} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 font-bold text-gray-800">ยืนยันรับเงินบิล {receiveTarget.sale_no}</h2>
            <p className="mb-3 text-xs text-gray-500">
              บันทึกว่าได้รับเงินจาก{receiveTarget.channel === "other" ? (receiveTarget.platform_name || "แพลตฟอร์ม") : SALE_CHANNEL_LABEL[receiveTarget.channel]}แล้ว
            </p>
            <label className="mb-1 block text-xs text-gray-600">วันที่ได้รับเงิน</label>
            <input
              type="date"
              autoFocus
              value={receiveDate}
              onChange={(e) => setReceiveDate(e.target.value)}
              required
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={receiving}
                className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {receiving ? "กำลังบันทึก..." : "ยืนยันรับเงินแล้ว"}
              </button>
              <button type="button" onClick={() => setReceiveTarget(null)} className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50">
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-gray-600">จากวันที่</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">ถึงวันที่</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <button onClick={applyRange} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-gray-50">แสดงผล</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="ค้นหาเลขที่บิลหรือชื่อลูกค้า..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as SaleChannel | "all")}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">ทุกช่องทาง</option>
          {(Object.keys(SALE_CHANNEL_LABEL) as SaleChannel[]).map((c) => (
            <option key={c} value={c}>{SALE_CHANNEL_LABEL[c]}</option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as "all" | "unpaid" | "paid")}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">ทุกสถานะรับเงิน</option>
          <option value="unpaid">รอรับเงิน</option>
          <option value="paid">ได้รับเงินแล้ว</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เลขที่บิล</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">ลูกค้า</th>
              <th className="px-4 py-3">ชำระโดย</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isVoid = s.status === "void";
              return (
                <tr key={s.id} className={`border-b last:border-0 hover:bg-gray-50 ${isVoid ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    {s.sale_no}
                    {s.source === "imported" && (
                      <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">นำเข้า</span>
                    )}
                    {s.channel !== "store" && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        {s.channel === "other" ? (s.platform_name || SALE_CHANNEL_LABEL.other) : SALE_CHANNEL_LABEL[s.channel]}
                      </span>
                    )}
                    {s.platform_fee_amount > 0 && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        (ค่าธรรมเนียม ฿{Number(s.platform_fee_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3">{s.customer_name ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.payment_method}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {isVoid ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ยกเลิกแล้ว</span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">สำเร็จ</span>
                      )}
                      {!isVoid && s.channel !== "store" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.payment_status === "unpaid" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {SALE_PAYMENT_STATUS_LABEL[s.payment_status]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${isVoid ? "line-through" : ""}`}>
                    ฿{Number(s.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/receipt/${s.id}`} className="text-brand hover:underline">ดูใบเสร็จ</Link>
                      {isAdmin && !isVoid && s.channel !== "store" && s.payment_status === "unpaid" && (
                        <button
                          onClick={() => openReceiveConfirm(s)}
                          className="text-emerald-600 hover:underline"
                        >
                          ยืนยันรับเงิน
                        </button>
                      )}
                      {isAdmin && !isVoid && s.channel !== "store" && s.payment_status === "paid" && (
                        <button
                          onClick={() => handleUndoReceive(s)}
                          className="text-gray-400 hover:underline"
                        >
                          ยกเลิกรับเงิน
                        </button>
                      )}
                      {isAdmin && !isVoid && (
                        <button
                          onClick={() => openVoidConfirm(s)}
                          className="text-red-600 hover:underline"
                        >
                          ยกเลิกบิล
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">ไม่มีรายการขาย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
