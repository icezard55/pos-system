"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

const PO_HEADER_MAP: Record<string, string> = {
  sku: "sku", "รหัสสินค้า": "sku", "รหัส": "sku",
  name: "name", "ชื่อสินค้า": "name", "ชื่อ": "name",
  unit_cost: "unit_cost", "ราคาทุนล่าสุด": "unit_cost", "ราคาทุน": "unit_cost", "ราคาทุนต่อหน่วย": "unit_cost",
  qty: "qty", "จำนวน": "qty",
};

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  cost_price: number;
}

interface POItem {
  id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
  products: { name: string; unit: string } | { name: string; unit: string }[] | null;
}

type PaymentStatus = "unpaid" | "pending_transfer" | "paid";

interface PO {
  id: string;
  supplier_id: string | null;
  status: "draft" | "received" | "cancelled";
  note: string | null;
  created_at: string;
  received_at: string | null;
  payment_status: PaymentStatus;
  paid_at: string | null;
  po_total: number | null;
  supplier_invoice_no: string | null;
  freight_cost: number;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_order_items: POItem[];
}

const paymentLabel: Record<PaymentStatus, string> = {
  unpaid: "ยังไม่จ่าย",
  pending_transfer: "รอโอน",
  paid: "จ่ายแล้ว",
};

const paymentBadgeClass: Record<PaymentStatus, string> = {
  unpaid: "bg-red-100 text-red-700",
  pending_transfer: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

function oneName(v: { name: string } | { name: string }[] | null): string {
  if (!v) return "-";
  return Array.isArray(v) ? v[0]?.name ?? "-" : v.name;
}

interface DraftLine {
  productId: string;
  qty: string;
  unitCost: string;
}

function productLabel(p: { sku: string | null; name: string } | undefined): string {
  if (!p) return "";
  return p.sku ? `[${p.sku}] ${p.name}` : p.name;
}

function ProductAutocomplete({
  products,
  value,
  onSelect,
}: {
  products: ProductOption[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(() => productLabel(products.find((p) => p.id === value)));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(productLabel(products.find((p) => p.id === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const q = query.trim().toLowerCase();
  const filtered = (
    q ? products.filter((p) => `${p.sku ?? ""} ${p.name}`.toLowerCase().includes(q)) : products
  ).slice(0, 30);

  return (
    <div className="relative min-w-[10rem] flex-1">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์รหัสหรือชื่อสินค้าเพื่อค้นหา..."
        className="w-full rounded-lg border px-2 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">ไม่พบสินค้า</p>}
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={() => {
                onSelect(p.id);
                setQuery(productLabel(p));
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              {productLabel(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrdersClient({
  suppliers,
  products,
  orders,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
  orders: PO[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showCreate, setShowCreate] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [freightCost, setFreightCost] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
  const [busy, setBusy] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const payable = orders.filter((po) => po.status === "received" && po.payment_status !== "paid");
  const payableTotal = payable.reduce((s, po) => s + Number(po.po_total ?? 0), 0);
  const receivedOrders = orders.filter((po) => po.status === "received");
  const totalReceivedValue = receivedOrders.reduce((s, po) => s + Number(po.po_total ?? 0), 0);

  function addLine() {
    setLines((prev) => [...prev, { productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ product_id: l.productId, qty: Number(l.qty), unit_cost: Number(l.unitCost) || 0 }));
    if (items.length === 0) {
      setError("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_purchase_order", {
        p_supplier_id: supplierId || null,
        p_items: items,
        p_note: note || null,
        p_supplier_invoice_no: supplierInvoiceNo || null,
        p_freight_cost: Number(freightCost) || 0,
      });
      if (error) throw error;
      setLines([{ productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
      setNote("");
      setSupplierInvoiceNo("");
      setFreightCost("");
      setShowCreate(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "สร้างใบสั่งซื้อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function downloadPOTemplate() {
    const ws = XLSX.utils.json_to_sheet(
      products.map((p) => ({
        "รหัสสินค้า": p.sku ?? "",
        "ชื่อสินค้า": p.name,
        "หน่วย": p.unit,
        "ราคาทุนล่าสุด": Number(p.cost_price),
        "จำนวน": "",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "purchase_order");
    XLSX.writeFile(wb, "template_นำเข้าใบสั่งซื้อ.xlsx");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const rows = raw
        .map((row) => {
          const mapped: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const norm = PO_HEADER_MAP[key.trim()] ?? PO_HEADER_MAP[key.trim().toLowerCase()];
            if (norm) mapped[norm] = row[key];
          }
          return mapped;
        })
        .filter((r) => Number(r.qty) > 0);

      if (rows.length === 0) {
        setImportMsg("ไม่พบแถวที่มีจำนวนมากกว่า 0 ในไฟล์ กรุณากรอกคอลัมน์ \"จำนวน\" สำหรับสินค้าที่ต้องการสั่งซื้อ");
        return;
      }

      const newLines: DraftLine[] = [];
      const unmatched: string[] = [];
      rows.forEach((r) => {
        const sku = String(r.sku ?? "").trim();
        const name = String(r.name ?? "").trim();
        let product = sku ? products.find((p) => (p.sku ?? "").trim() === sku) : undefined;
        if (!product && name) product = products.find((p) => p.name.trim() === name);
        if (!product) {
          unmatched.push(sku || name || "(ไม่ระบุ)");
          return;
        }
        newLines.push({
          productId: product.id,
          qty: String(Number(r.qty) || 0),
          unitCost: String(Number(r.unit_cost) || product.cost_price || 0),
        });
      });

      if (newLines.length > 0) {
        setLines(newLines);
      }
      setImportMsg(
        `นำเข้ารายการสินค้าแล้ว ${newLines.length} รายการ` +
          (unmatched.length > 0 ? ` — ไม่พบสินค้าที่ตรงกับรหัส/ชื่อ ${unmatched.length} รายการ: ${unmatched.join(", ")}` : "")
      );
    } catch (err: any) {
      setImportMsg(`นำเข้าไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleReceive(po: PO) {
    if (!confirm(`ยืนยันรับสินค้าเข้าตามใบสั่งซื้อนี้? สต๊อกและราคาทุนจะถูกอัปเดตทันที`)) return;
    setReceivingId(po.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("receive_purchase_order", { p_po_id: po.id });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "รับสินค้าเข้าไม่สำเร็จ");
    } finally {
      setReceivingId(null);
    }
  }

  async function handlePaymentStatus(po: PO, status: PaymentStatus) {
    if (status === "paid" && !confirm(`ยืนยันว่าจ่ายเงินให้ผู้จัดจำหน่ายรายนี้ครบแล้ว?`)) return;
    setPayingId(po.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("update_po_payment_status", { p_po_id: po.id, p_status: status });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตสถานะการจ่ายเงินไม่สำเร็จ");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ใบสั่งซื้อสินค้า</h1>
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          {showCreate ? "ยกเลิก" : "+ สร้างใบสั่งซื้อ"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">เจ้าหนี้การค้าคงค้าง (ยังไม่จ่าย + รอโอน)</p>
              <p className="mt-1 text-2xl font-bold text-red-600">฿{payableTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
            <p className="text-sm text-gray-400">{payable.length} ใบ</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">ผลรวมมูลค่าสินค้าที่รับเข้าทั้งหมด</p>
              <p className="mt-1 text-2xl font-bold text-brand">฿{totalReceivedValue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
            <p className="text-sm text-gray-400">{receivedOrders.length} ใบ</p>
          </div>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-8 space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ผู้จัดจำหน่าย</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">- ไม่ระบุ -</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลขที่บิล/ใบกำกับของผู้จัดจำหน่าย</label>
              <input
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                placeholder="เช่น INV-2026-0001"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ค่าขนส่ง (ถ้ามี)</label>
              <input
                type="number" min={0} step="0.01"
                value={freightCost}
                onChange={(e) => setFreightCost(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                จะถูกบันทึกเป็นรายจ่ายอัตโนมัติในหมวด "ค่าขนส่ง" เมื่อรับสินค้าเข้า (ไม่รวมในยอดเจ้าหนี้การค้า)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
            <span className="text-xs font-medium text-gray-600">นำเข้ารายการสินค้าจาก Excel:</span>
            <button
              type="button"
              onClick={downloadPOTemplate}
              disabled={!supplierId}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ⬇️ ดาวน์โหลดเทมเพลต
            </button>
            <label
              className={`cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 ${
                !supplierId ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              📥 นำเข้าจาก Excel
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={!supplierId} className="hidden" />
            </label>
            {!supplierId && <span className="text-xs text-gray-400">กรุณาเลือกผู้จัดจำหน่ายก่อนดาวน์โหลด/นำเข้า</span>}
          </div>
          {importMsg && <p className="text-xs text-blue-700">{importMsg}</p>}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">รายการสินค้า</label>
            {lines.map((l, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <ProductAutocomplete
                  products={products}
                  value={l.productId}
                  onSelect={(id) => {
                    const p = products.find((pp) => pp.id === id);
                    updateLine(idx, {
                      productId: id,
                      unitCost: l.unitCost || (p ? String(p.cost_price) : l.unitCost),
                    });
                  }}
                />
                <input
                  type="number" min={0} placeholder="จำนวน"
                  value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })}
                  className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  type="number" min={0} placeholder="ราคาทุน/หน่วย"
                  value={l.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                  className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                />
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-xs text-brand hover:underline">+ เพิ่มรายการ</button>
          </div>

          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="w-full rounded-lg border px-3 py-2 text-sm" />

          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? "กำลังบันทึก..." : "บันทึกใบสั่งซื้อ (แบบร่าง)"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {orders.map((po) => (
          <div key={po.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {oneName(po.suppliers)}
                  {po.supplier_invoice_no && (
                    <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                      เลขที่บิล: {po.supplier_invoice_no}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  สร้างเมื่อ {new Date(po.created_at).toLocaleString("th-TH")}
                  {po.received_at && ` · รับเข้าเมื่อ ${new Date(po.received_at).toLocaleString("th-TH")}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {po.status === "draft" && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">รอรับสินค้า</span>
                )}
                {po.status === "received" && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentBadgeClass[po.payment_status]}`}>
                    {paymentLabel[po.payment_status]}
                  </span>
                )}
                {po.status === "draft" && (
                  <button
                    onClick={() => handleReceive(po)}
                    disabled={receivingId === po.id}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {receivingId === po.id ? "กำลังรับ..." : "รับสินค้าเข้า"}
                  </button>
                )}
                {po.status === "received" && po.payment_status !== "paid" && (
                  <select
                    value={po.payment_status}
                    disabled={payingId === po.id}
                    onChange={(e) => handlePaymentStatus(po, e.target.value as PaymentStatus)}
                    className="rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50"
                  >
                    <option value="unpaid">ยังไม่จ่าย</option>
                    <option value="pending_transfer">รอโอน</option>
                    <option value="paid">จ่ายแล้ว</option>
                  </select>
                )}
              </div>
            </div>
            {po.note && <p className="mb-2 text-xs text-gray-500">หมายเหตุ: {po.note}</p>}
            {po.status === "received" && (
              <p className="mb-2 text-xs text-gray-400">
                มูลค่าใบสั่งซื้อ ฿{Number(po.po_total ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                {Number(po.freight_cost) > 0 && ` + ค่าขนส่ง ฿${Number(po.freight_cost).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                {po.paid_at && ` · จ่ายเงินเมื่อ ${new Date(po.paid_at).toLocaleString("th-TH")}`}
              </p>
            )}
            {po.status === "draft" && Number(po.freight_cost) > 0 && (
              <p className="mb-2 text-xs text-gray-400">ค่าขนส่งที่ตั้งไว้ ฿{Number(po.freight_cost).toLocaleString("th-TH", { minimumFractionDigits: 2 })} (จะบันทึกเป็นรายจ่ายเมื่อรับสินค้าเข้า)</p>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="py-1">สินค้า</th>
                  <th className="py-1 text-right">จำนวน</th>
                  <th className="py-1 text-right">ราคาทุน/หน่วย</th>
                  <th className="py-1 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {po.purchase_order_items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1">{oneName(it.products)}</td>
                    <td className="py-1 text-right">{it.qty}</td>
                    <td className="py-1 text-right">฿{Number(it.unit_cost).toLocaleString("th-TH")}</td>
                    <td className="py-1 text-right">฿{(Number(it.unit_cost) * Number(it.qty)).toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-sm text-gray-400">ยังไม่มีใบสั่งซื้อ</p>}
      </div>
    </div>
  );
}
