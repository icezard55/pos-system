"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

const PO_HEADER_MAP: Record<string, string> = {
  sku: "sku", "รหัสสินค้า": "sku", "รหัส": "sku",
  name: "name", "ชื่อสินค้า": "name", "ชื่อ": "name",
  unit_cost: "unit_cost", "ราคาทุนล่าสุด": "unit_cost", "ราคาทุน": "unit_cost", "ราคาทุนต่อหน่วย": "unit_cost",
  qty: "qty", "จำนวน": "qty", "จำนวนรับของ": "qty", "จำนวนสั่งซื้อ": "qty", "จำนวนที่สั่ง": "qty",
};

const PO_EDIT_HEADER_MAP: Record<string, string> = {
  po_id: "po_id", "รหัสใบสั่งซื้อ": "po_id",
  item_id: "item_id", "รหัสรายการ": "item_id",
  invoice_no: "invoice_no", "เลขที่บิลผู้จัดจำหน่าย": "invoice_no",
  freight: "freight", "ค่าขนส่ง": "freight",
  note: "note", "หมายเหตุ": "note",
  sku: "sku", "รหัสสินค้า": "sku",
  product_name: "product_name", "สินค้า": "product_name", "ชื่อสินค้า": "product_name",
  qty: "qty", "จำนวน": "qty", "จำนวนรับของ": "qty", "จำนวนสั่งซื้อ": "qty", "จำนวนที่สั่ง": "qty",
  unit_cost: "unit_cost", "ราคาทุนต่อหน่วย": "unit_cost", "ราคาทุน": "unit_cost",
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

function SupplierAutocomplete({
  suppliers,
  value,
  onSelect,
}: {
  suppliers: SupplierOption[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(() => suppliers.find((s) => s.id === value)?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(suppliers.find((s) => s.id === value)?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const q = query.trim().toLowerCase();
  const filtered = (q ? suppliers.filter((s) => s.name.toLowerCase().includes(q)) : suppliers).slice(0, 30);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value.trim() === "") onSelect("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อผู้จัดจำหน่ายเพื่อค้นหา..."
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          <button
            type="button"
            onMouseDown={() => {
              onSelect("");
              setQuery("");
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-50"
          >
            - ไม่ระบุ -
          </button>
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">ไม่พบผู้จัดจำหน่าย</p>}
          {filtered.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={() => {
                onSelect(s.id);
                setQuery(s.name);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              {s.name}
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

  const [editImporting, setEditImporting] = useState(false);
  const [editImportMsg, setEditImportMsg] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const draftItemsTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const draftGrandTotal = draftItemsTotal + (Number(freightCost) || 0);

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

  function downloadPOExport() {
    const statusLabel: Record<PO["status"], string> = { draft: "รอรับสินค้า", received: "รับเข้าแล้ว", cancelled: "ยกเลิกแล้ว" };

    const summarySheet = XLSX.utils.json_to_sheet(
      orders.map((po) => ({
        "ผู้จัดจำหน่าย": oneName(po.suppliers),
        "เลขที่บิลผู้จัดจำหน่าย": po.supplier_invoice_no ?? "",
        "สถานะ": statusLabel[po.status],
        "สถานะจ่ายเงิน": po.status === "received" ? paymentLabel[po.payment_status] : "",
        "วันที่สร้าง": new Date(po.created_at).toLocaleString("th-TH"),
        "วันที่รับเข้า": po.received_at ? new Date(po.received_at).toLocaleString("th-TH") : "",
        "วันที่จ่ายเงิน": po.paid_at ? new Date(po.paid_at).toLocaleString("th-TH") : "",
        "ค่าขนส่ง": Number(Number(po.freight_cost || 0).toFixed(2)),
        "มูลค่าใบสั่งซื้อ": Number(Number(po.po_total ?? 0).toFixed(2)),
        "หมายเหตุ": po.note ?? "",
      }))
    );

    const itemRows: Record<string, any>[] = [];
    orders.forEach((po) => {
      po.purchase_order_items.forEach((it) => {
        itemRows.push({
          "ผู้จัดจำหน่าย": oneName(po.suppliers),
          "เลขที่บิลผู้จัดจำหน่าย": po.supplier_invoice_no ?? "",
          "สินค้า": oneName(it.products),
          "จำนวน": Number(it.qty),
          "ราคาทุนต่อหน่วย": Number(it.unit_cost),
          "รวม": Number((Number(it.qty) * Number(it.unit_cost)).toFixed(2)),
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, "ใบสั่งซื้อ");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "รายการสินค้า");
    XLSX.writeFile(wb, `ใบสั่งซื้อ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadEditablePOs() {
    const draftOrders = orders.filter((po) => po.status === "draft");
    const rows: Record<string, any>[] = [];
    draftOrders.forEach((po) => {
      po.purchase_order_items.forEach((it) => {
        const product = products.find((p) => p.id === it.product_id);
        rows.push({
          "รหัสใบสั่งซื้อ": po.id,
          "รหัสรายการ": it.id,
          "ผู้จัดจำหน่าย": oneName(po.suppliers),
          "วันที่สร้าง": new Date(po.created_at).toLocaleString("th-TH"),
          "เลขที่บิลผู้จัดจำหน่าย": po.supplier_invoice_no ?? "",
          "ค่าขนส่ง": Number(po.freight_cost || 0),
          "หมายเหตุ": po.note ?? "",
          "รหัสสินค้า": product?.sku ?? "",
          "สินค้า": oneName(it.products),
          "จำนวน": Number(it.qty),
          "ราคาทุนต่อหน่วย": Number(it.unit_cost),
        });
      });
    });
    if (rows.length === 0) {
      alert("ไม่มีใบสั่งซื้อที่ยังไม่รับสินค้าเข้า (สถานะรอรับสินค้า) ให้ดาวน์โหลด");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "แก้ไขใบสั่งซื้อ");
    XLSX.writeFile(wb, `แก้ไขใบสั่งซื้อ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleImportPOEdits(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditImporting(true);
    setEditImportMsg(null);
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
            const norm = PO_EDIT_HEADER_MAP[key.trim()] ?? PO_EDIT_HEADER_MAP[key.trim().toLowerCase()];
            if (norm) mapped[norm] = row[key];
          }
          return mapped;
        })
        .filter((r) => String(r.po_id ?? "").trim() && Number(r.qty) > 0);

      if (rows.length === 0) {
        setEditImportMsg("ไม่พบข้อมูลที่ใช้ได้ในไฟล์ — ห้ามลบหรือแก้คอลัมน์ \"รหัสใบสั่งซื้อ\" และตรวจสอบว่าคอลัมน์ \"จำนวน\" มากกว่า 0");
        return;
      }

      function findProduct(sku: string, name: string) {
        if (sku) {
          const bySku = products.find((p) => (p.sku ?? "").trim().toLowerCase() === sku.toLowerCase());
          if (bySku) return bySku;
        }
        if (name) {
          const exact = products.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
          if (exact) return exact;
        }
        return null;
      }

      interface EditGroup {
        po_id: string;
        invoice_no: string;
        freight: string;
        note: string;
        items: { item_id: string; sku: string; product_name: string; qty: number; unit_cost: number }[];
      }
      const groups = new Map<string, EditGroup>();
      rows.forEach((r) => {
        const poId = String(r.po_id).trim();
        if (!groups.has(poId)) {
          groups.set(poId, {
            po_id: poId,
            invoice_no: String(r.invoice_no ?? "").trim(),
            freight: String(r.freight ?? "").trim(),
            note: String(r.note ?? "").trim(),
            items: [],
          });
        }
        groups.get(poId)!.items.push({
          item_id: String(r.item_id ?? "").trim(),
          sku: String(r.sku ?? "").trim(),
          product_name: String(r.product_name ?? "").trim(),
          qty: Number(r.qty) || 0,
          unit_cost: Number(r.unit_cost) || 0,
        });
      });

      let successCount = 0;
      const errors: string[] = [];
      for (const g of groups.values()) {
        try {
          const items = g.items.map((it) => {
            if (it.item_id) {
              return { item_id: it.item_id, qty: it.qty, unit_cost: it.unit_cost };
            }
            // ไม่ระบุ "รหัสรายการ" = เพิ่มสินค้าใหม่เข้าใบสั่งซื้อนี้ จับคู่ด้วยรหัสสินค้า/ชื่อสินค้า
            const product = findProduct(it.sku, it.product_name);
            if (!product) throw new Error(`ไม่พบสินค้า "${it.sku || it.product_name}" สำหรับเพิ่มในใบสั่งซื้อ`);
            return { item_id: null, product_id: product.id, qty: it.qty, unit_cost: it.unit_cost || product.cost_price };
          });
          const { error: rpcError } = await supabase.rpc("update_draft_purchase_order", {
            p_po_id: g.po_id,
            p_supplier_invoice_no: g.invoice_no || null,
            p_freight_cost: Number(g.freight) || 0,
            p_note: g.note || null,
            p_items: items,
          });
          if (rpcError) throw rpcError;
          successCount++;
        } catch (err: any) {
          errors.push(`${err.message ?? err}`);
        }
      }

      setEditImportMsg(
        `อัปเดตสำเร็จ ${successCount} ใบ จากทั้งหมด ${groups.size} ใบ` +
          (errors.length > 0 ? ` — ล้มเหลว ${errors.length}: ${errors.join(" | ")}` : "")
      );
      router.refresh();
    } catch (err: any) {
      setEditImportMsg(`นำเข้าไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setEditImporting(false);
      if (editFileRef.current) editFileRef.current.value = "";
    }
  }

  async function handleCancel(po: PO) {
    if (!confirm(`ยืนยันยกเลิกใบสั่งซื้อนี้? (ยกเลิกได้เฉพาะใบที่ยังไม่รับสินค้าเข้า)`)) return;
    setReceivingId(po.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("cancel_purchase_order", { p_po_id: po.id });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ยกเลิกใบสั่งซื้อไม่สำเร็จ");
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
        <div className="flex items-center gap-2">
          <button onClick={downloadPOExport} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            📊 ส่งออก Excel
          </button>
          <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            {showCreate ? "ยกเลิก" : "+ สร้างใบสั่งซื้อ"}
          </button>
        </div>
      </div>

      <div className="mb-6 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-gray-700">แก้ไขใบสั่งซื้อที่มีอยู่ผ่าน Excel:</span>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={downloadEditablePOs} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            ⬇️ ดาวน์โหลดใบสั่งซื้อ (แก้ไขได้)
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            {editImporting ? "กำลังอัปเดต..." : "📥 นำเข้าไฟล์ที่แก้ไขแล้ว"}
            <input
              ref={editFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportPOEdits}
              disabled={editImporting}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-gray-400">
          ดาวน์โหลดได้เฉพาะใบสั่งซื้อที่ยังไม่รับสินค้าเข้า (สถานะรอรับสินค้า) แก้ไขจำนวน/ราคาทุน/เลขที่บิล/ค่าขนส่ง/หมายเหตุ ในไฟล์แล้วนำเข้ากลับเพื่ออัปเดต —
          <span className="font-medium text-gray-500"> ห้ามแก้คอลัมน์ "รหัสใบสั่งซื้อ"</span> เพราะใช้จับคู่ว่าจะแก้ไบไหน
          หากต้องการเพิ่มสินค้าใหม่เข้าใบเดิม ให้เพิ่มแถวใหม่ ใส่ "รหัสใบสั่งซื้อ" เดิม เว้น "รหัสรายการ" ว่างไว้ แล้วกรอกรหัสสินค้า/ชื่อสินค้า+จำนวน+ราคาทุน
          ใบสั่งซื้อที่รับสินค้าเข้าแล้วจะไม่สามารถแก้ไขผ่านไฟล์นี้ได้ (ให้ใช้ปุ่มสถานะการจ่ายเงินแทน)
        </p>
        {editImportMsg && <p className="text-xs text-blue-700">{editImportMsg}</p>}
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
              <SupplierAutocomplete suppliers={suppliers} value={supplierId} onSelect={setSupplierId} />
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
          <p className="text-xs text-gray-400">
            รองรับไฟล์รายการสินค้าที่มีคอลัมน์ รหัสสินค้า/ชื่อสินค้า, ราคาทุน และคอลัมน์จำนวน (เช่น "จำนวน", "จำนวนรับของ", "จำนวนสั่งซื้อ") — ไม่ต้องใช้เทมเพลตด้านบนก็ได้ ถ้าไฟล์มีคอลัมน์เหล่านี้อยู่แล้ว
          </p>
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
                  type="number" min={0} step="0.01" placeholder="ราคาทุน/หน่วย"
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

          <div className="space-y-1 rounded-xl bg-gray-50 p-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>ยอดรวมค่าสินค้า</span>
              <span className="font-semibold text-gray-800">฿{draftItemsTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
            {Number(freightCost) > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>+ ค่าขนส่ง</span>
                <span>฿{Number(freightCost).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 text-base font-bold text-gray-900">
              <span>ยอดรวมทั้งหมด</span>
              <span>฿{draftGrandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

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
                {po.status === "cancelled" && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">ยกเลิกแล้ว</span>
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
                {po.status === "draft" && (
                  <button
                    onClick={() => handleCancel(po)}
                    disabled={receivingId === po.id}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    ยกเลิกใบสั่งซื้อ
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
