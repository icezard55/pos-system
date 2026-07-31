"use client";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

const HEADER_MAP: Record<string, string> = {
  sku: "sku", "รหัส": "sku", "รหัสสินค้า": "sku",
  name: "name", "ชื่อ": "name", "ชื่อสินค้า": "name",
  category: "category", "หมวดหมู่": "category", "ประเภท": "category",
  unit: "unit", "หน่วย": "unit", "หน่วยนับ": "unit",
  cost_price: "cost_price", "ราคาทุน": "cost_price", "ต้นทุน": "cost_price",
  sell_price: "sell_price", "ราคาขาย": "sell_price", "ราคา": "sell_price",
  stock_qty: "stock_qty", "จำนวน": "stock_qty", "จำนวนคงเหลือ": "stock_qty", "สต๊อก": "stock_qty",
  low_stock_threshold: "low_stock_threshold", "จุดสั่งซื้อ": "low_stock_threshold", "แจ้งเตือนขั้นต่ำ": "low_stock_threshold",
};

function emptyForm() {
  return { id: "", sku: "", name: "", category: "", unit: "ชิ้น", cost_price: "0", sell_price: "0", stock_qty: "0", low_stock_threshold: "5" };
}

export default function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  async function refresh() {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data ?? []);
  }

  function openAdd() {
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id, sku: p.sku ?? "", name: p.name, category: p.category ?? "", unit: p.unit,
      cost_price: String(p.cost_price), sell_price: String(p.sell_price),
      stock_qty: String(p.stock_qty), low_stock_threshold: String(p.low_stock_threshold),
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payload = {
      sku: form.sku || null,
      name: form.name,
      category: form.category || null,
      unit: form.unit || "ชิ้น",
      cost_price: Number(form.cost_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
    };
    try {
      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      await refresh();
    } catch (err: any) {
      setMsg(err.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`ลบสินค้า "${p.name}" ใช่หรือไม่?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const rows = raw
        .map((row) => {
          const mapped: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const norm = HEADER_MAP[key.trim()] ?? HEADER_MAP[key.trim().toLowerCase()];
            if (norm) mapped[norm] = row[key];
          }
          return mapped;
        })
        .filter((r) => r.name && String(r.name).trim() !== "");

      if (rows.length === 0) {
        setMsg("ไม่พบข้อมูลสินค้าในไฟล์ กรุณาตรวจสอบหัวคอลัมน์ เช่น ชื่อสินค้า, รหัสสินค้า, ราคาขาย, จำนวน");
        setBusy(false);
        return;
      }

      const { data, error } = await supabase.rpc("import_products", { p_rows: rows });
      if (error) throw error;
      setMsg(`นำเข้าสำเร็จ ${data} รายการ`);
      await refresh();
    } catch (err: any) {
      setMsg(`นำเข้าไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { "รหัสสินค้า": "SKU001", "ชื่อสินค้า": "ตัวอย่างสินค้า", "หมวดหมู่": "ทั่วไป", "หน่วย": "ชิ้น", "ราคาทุน": 50, "ราคาขาย": 80, "จำนวนคงเหลือ": 100, "จุดสั่งซื้อ": 5 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "products");
    XLSX.writeFile(wb, "template_นำเข้าสินค้า.xlsx");
  }

  function downloadCurrentProducts() {
    // same column layout as the import template, but filled with every
    // product currently in the system — edit this file and re-import it
    // to bulk-update prices/stock/etc.
    const ws = XLSX.utils.json_to_sheet(
      products.map((p) => ({
        "รหัสสินค้า": p.sku ?? "",
        "ชื่อสินค้า": p.name,
        "หมวดหมู่": p.category ?? "",
        "หน่วย": p.unit,
        "ราคาทุน": Number(p.cost_price),
        "ราคาขาย": Number(p.sell_price),
        "จำนวนคงเหลือ": Number(p.stock_qty),
        "จุดสั่งซื้อ": Number(p.low_stock_threshold),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "products");
    XLSX.writeFile(wb, `สินค้าในระบบ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">จัดการสต๊อกสินค้า</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadCurrentProducts} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            ⬇️ ดาวน์โหลดสินค้าในระบบ
          </button>
          <button onClick={downloadTemplate} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            ⬇️ ดาวน์โหลดเทมเพลตเปล่า
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            📥 นำเข้าจาก Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
          <button onClick={openAdd} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            + เพิ่มสินค้า
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-400">
        "ดาวน์โหลดสินค้าในระบบ" จะได้ไฟล์ Excel ที่มีสินค้าทั้งหมดตอนนี้ แก้ไขราคา/จำนวน หรือเพิ่มแถวสินค้าใหม่ต่อท้ายได้เลย
        แล้วกด "นำเข้าจาก Excel" กลับเข้าไป — ระบบจะ<span className="font-medium text-gray-500">แทนที่ค่าราคาและจำนวนคงเหลือ</span>ของสินค้าที่มีรหัส (SKU) ตรงกัน
        ด้วยค่าล่าสุดในไฟล์ (ไม่ใช่การบวกเพิ่ม) ส่วนแถวที่เป็นสินค้าใหม่จะถูกเพิ่มเข้าระบบตามปกติ
      </p>

      {msg && <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{msg}</div>}

      <div className="mb-4">
        <input
          placeholder="ค้นหาสินค้า, รหัส หรือหมวดหมู่..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">รหัส</th>
              <th className="px-4 py-3">ชื่อสินค้า</th>
              <th className="px-4 py-3">หมวดหมู่</th>
              <th className="px-4 py-3">หน่วย</th>
              <th className="px-4 py-3 text-right">ราคาทุน</th>
              <th className="px-4 py-3 text-right">ราคาขาย</th>
              <th className="px-4 py-3 text-right">คงเหลือ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{p.sku ?? "-"}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.category ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                <td className="px-4 py-3 text-right">{Number(p.cost_price).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-right">{Number(p.sell_price).toLocaleString("th-TH")}</td>
                <td className={`px-4 py-3 text-right font-semibold ${Number(p.stock_qty) <= Number(p.low_stock_threshold) ? "text-red-600" : "text-gray-800"}`}>
                  {p.stock_qty}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(p)} className="mr-3 text-brand hover:underline">แก้ไข</button>
                  <button onClick={() => handleDelete(p)} className="text-red-600 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">ไม่มีข้อมูลสินค้า</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSave} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">{form.id ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อสินค้า *</label>
                <input required className="w-full rounded-lg border px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">รหัสสินค้า (SKU)</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">หมวดหมู่</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">หน่วยนับ</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">ราคาทุน</label>
                <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">ราคาขาย *</label>
                <input required type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">จำนวนคงเหลือ</label>
                <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">แจ้งเตือนสต๊อกต่ำที่</label>
                <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>
            </div>
            {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button>
              <button disabled={busy} type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
