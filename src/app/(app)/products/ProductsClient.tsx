"use client";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";
import { PRODUCT_CARD_COLORS } from "@/lib/types";

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
  return {
    id: "", sku: "", name: "", category: "", unit: "ชิ้น", cost_price: "0", sell_price: "0", stock_qty: "0",
    low_stock_threshold: "5", image_url: "", variant_group: "", variant_label: "",
    storage_location: "", no_stock_tracking: false, card_color: "", receipt_name: "", sort_order: "0",
    expiry_date: "", wholesale_price: "",
  };
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export default function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catMsg, setCatMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newBarcode, setNewBarcode] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkVariants, setBulkVariants] = useState<
    { label: string; cost: string; price: string; qty: string; active: boolean }[]
  >([]);
  const [newBulkLabel, setNewBulkLabel] = useState("");

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => (p.category ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "th")
    );
  }, [products]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const c = (p.category ?? "").trim();
      if (!c) return;
      counts[c] = (counts[c] ?? 0) + 1;
    });
    return counts;
  }, [products]);

  const uncategorizedCount = useMemo(
    () => products.filter((p) => !(p.category ?? "").trim()).length,
    [products]
  );

  const variantGroups = useMemo(() => {
    return Array.from(new Set(products.map((p) => (p.variant_group ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "th")
    );
  }, [products]);

  // include a category just typed into the form even if it hasn't been saved
  // to any product yet, otherwise the dropdown has no matching <option> for
  // it and visually looks like it "disappeared" right after adding it
  const categoryOptions = useMemo(() => {
    if (form.category && !categories.includes(form.category)) {
      return [...categories, form.category].sort((a, b) => a.localeCompare(b, "th"));
    }
    return categories;
  }, [categories, form.category]);

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
    setAddingCategory(false);
    setNewCategory("");
    setBarcodes([]);
    setNewBarcode("");
    setBulkMode(false);
    setBulkVariants([]);
    setNewBulkLabel("");
    setShowModal(true);
  }

  async function openEdit(p: Product) {
    setForm({
      id: p.id, sku: p.sku ?? "", name: p.name, category: p.category ?? "", unit: p.unit,
      cost_price: String(p.cost_price), sell_price: String(p.sell_price),
      stock_qty: String(p.stock_qty), low_stock_threshold: String(p.low_stock_threshold),
      image_url: p.image_url ?? "", variant_group: p.variant_group ?? "", variant_label: p.variant_label ?? "",
      storage_location: p.storage_location ?? "", no_stock_tracking: p.no_stock_tracking ?? false,
      card_color: p.card_color ?? "", receipt_name: p.receipt_name ?? "", sort_order: String(p.sort_order ?? 0),
      expiry_date: p.expiry_date ?? "", wholesale_price: p.wholesale_price != null ? String(p.wholesale_price) : "",
    });
    setAddingCategory(false);
    setNewCategory("");
    setBarcodes([]);
    setNewBarcode("");
    setBulkMode(false);
    setBulkVariants([]);
    setNewBulkLabel("");
    setShowModal(true);
    const { data } = await supabase.from("product_barcodes").select("barcode").eq("product_id", p.id).order("barcode");
    setBarcodes((data ?? []).map((r) => r.barcode));
  }

  function addBulkVariant() {
    const label = newBulkLabel.trim();
    if (!label) return;
    if (bulkVariants.some((v) => v.label === label)) return;
    setBulkVariants((prev) => [
      ...prev,
      { label, cost: form.cost_price || "0", price: form.sell_price || "0", qty: "0", active: true },
    ]);
    setNewBulkLabel("");
  }

  function removeBulkVariant(label: string) {
    setBulkVariants((prev) => prev.filter((v) => v.label !== label));
  }

  function updateBulkVariant(label: string, patch: Partial<{ cost: string; price: string; qty: string; active: boolean }>) {
    setBulkVariants((prev) => prev.map((v) => (v.label === label ? { ...v, ...patch } : v)));
  }

  function addBarcode() {
    const b = newBarcode.trim();
    if (!b) return;
    if (!barcodes.includes(b)) setBarcodes((prev) => [...prev, b]);
    setNewBarcode("");
  }

  function removeBarcode(b: string) {
    setBarcodes((prev) => prev.filter((x) => x !== b));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `products/${form.id || "new"}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("shop-uploads").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shop-uploads").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: pub.publicUrl }));
    } catch (err: any) {
      setMsg(`อัปโหลดรูปไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setUploadingImage(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  }

  function openCategoryManager() {
    setEditingCat(null);
    setEditingCatValue("");
    setCatMsg(null);
    setShowCategoryManager(true);
  }

  function startEditCat(cat: string) {
    setEditingCat(cat);
    setEditingCatValue(cat);
    setCatMsg(null);
  }

  function cancelEditCat() {
    setEditingCat(null);
    setEditingCatValue("");
  }

  async function saveEditCat(oldName: string) {
    const trimmed = editingCatValue.trim();
    if (!trimmed) {
      setCatMsg('กรุณาระบุชื่อหมวดหมู่ หรือกดปุ่ม "ลบ" แทนถ้าต้องการล้างหมวดหมู่นี้');
      return;
    }
    if (trimmed === oldName) {
      cancelEditCat();
      return;
    }
    if (categories.includes(trimmed) && !confirm(`หมวดหมู่ "${trimmed}" มีอยู่แล้ว ต้องการรวมสินค้าทั้งหมดใน "${oldName}" เข้าไปด้วยกันหรือไม่?`)) {
      return;
    }
    setCatBusy(true);
    setCatMsg(null);
    try {
      const { error } = await supabase.from("products").update({ category: trimmed }).eq("category", oldName);
      if (error) throw error;
      await refresh();
      setCatMsg(`เปลี่ยนชื่อหมวดหมู่ "${oldName}" เป็น "${trimmed}" แล้ว`);
      cancelEditCat();
    } catch (err: any) {
      setCatMsg(`แก้ไขไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setCatBusy(false);
    }
  }

  async function deleteCat(cat: string) {
    const count = categoryCounts[cat] ?? 0;
    if (!confirm(`ต้องการลบหมวดหมู่ "${cat}" ใช่หรือไม่? สินค้า ${count} รายการจะถูกเปลี่ยนเป็น "ไม่ระบุหมวดหมู่" (ไม่ได้ลบสินค้า)`)) return;
    setCatBusy(true);
    setCatMsg(null);
    try {
      const { error } = await supabase.from("products").update({ category: null }).eq("category", cat);
      if (error) throw error;
      await refresh();
      setCatMsg(`ลบหมวดหมู่ "${cat}" แล้ว`);
    } catch (err: any) {
      setCatMsg(`ลบไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setCatBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    if (bulkMode && !form.id) {
      if (!form.variant_group.trim()) {
        setMsg("กรุณาระบุกลุ่มสินค้า เช่น เสื้อนักเรียนชาย");
        setBusy(false);
        return;
      }
      if (bulkVariants.length === 0) {
        setMsg("กรุณาเพิ่มตัวเลือกอย่างน้อย 1 รายการ เช่น เบอร์ 28");
        setBusy(false);
        return;
      }
      try {
        const rows = bulkVariants.map((v) => ({
          sku: null,
          name: `${form.name} ${v.label}`.trim(),
          category: form.category || null,
          unit: form.unit || "ชิ้น",
          cost_price: Number(v.cost) || 0,
          sell_price: Number(v.price) || 0,
          stock_qty: Number(v.qty) || 0,
          low_stock_threshold: Number(form.low_stock_threshold) || 0,
          image_url: form.image_url || null,
          variant_group: form.variant_group.trim(),
          variant_label: v.label,
          storage_location: form.storage_location.trim() || null,
          no_stock_tracking: form.no_stock_tracking,
          card_color: form.card_color || null,
          receipt_name: form.receipt_name.trim() || null,
          sort_order: Number(form.sort_order) || 0,
          expiry_date: form.expiry_date || null,
          wholesale_price: form.wholesale_price.trim() ? Number(form.wholesale_price) : null,
          is_active: v.active,
        }));
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
        setShowModal(false);
        await refresh();
      } catch (err: any) {
        setMsg(err.message ?? "บันทึกไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
      return;
    }

    const payload = {
      sku: form.sku || null,
      name: form.name,
      category: form.category || null,
      unit: form.unit || "ชิ้น",
      cost_price: Number(form.cost_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      image_url: form.image_url || null,
      variant_group: form.variant_group.trim() || null,
      variant_label: form.variant_group.trim() ? (form.variant_label.trim() || null) : null,
      storage_location: form.storage_location.trim() || null,
      no_stock_tracking: form.no_stock_tracking,
      card_color: form.card_color || null,
      receipt_name: form.receipt_name.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      expiry_date: form.expiry_date || null,
      wholesale_price: form.wholesale_price.trim() ? Number(form.wholesale_price) : null,
    };
    try {
      let productId = form.id;
      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      // sync บาร์โค้ดหลายเลข: ลบของเดิมทั้งหมดแล้วใส่ชุดปัจจุบัน (ง่ายกว่าการ diff)
      await supabase.from("product_barcodes").delete().eq("product_id", productId);
      const cleanBarcodes = Array.from(new Set(barcodes.map((b) => b.trim()).filter(Boolean)));
      if (cleanBarcodes.length > 0) {
        const { error: bcErr } = await supabase
          .from("product_barcodes")
          .insert(cleanBarcodes.map((barcode) => ({ product_id: productId, barcode })));
        if (bcErr) throw bcErr;
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
          <button onClick={openCategoryManager} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            🏷️ จัดการหมวดหมู่
          </button>
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
              <th className="px-4 py-3">รูป</th>
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
                <td className="px-4 py-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-gray-100"
                    style={!p.image_url && p.card_color ? { backgroundColor: p.card_color } : undefined}
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    ) : p.card_color ? null : (
                      <span className="text-xs text-gray-300">📦</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.sku ?? "-"}</td>
                <td className="px-4 py-3 font-medium">
                  {p.name}
                  {p.variant_group && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-normal text-indigo-600">
                      {p.variant_group}
                      {p.variant_label ? ` · ${p.variant_label}` : ""}
                    </span>
                  )}
                  {p.no_stock_tracking && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-normal text-amber-600">
                      ไม่ตัดสต๊อก
                    </span>
                  )}
                  {p.storage_location && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500">
                      📍 {p.storage_location}
                    </span>
                  )}
                  {p.expiry_date && (() => {
                    const d = daysUntil(p.expiry_date!);
                    const expired = d < 0;
                    const soon = d >= 0 && d <= 30;
                    if (!expired && !soon) return null;
                    return (
                      <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-normal ${expired ? "bg-red-100 text-red-600" : "bg-orange-50 text-orange-600"}`}>
                        ⏰ {expired ? `หมดอายุแล้ว ${Math.abs(d)} วัน` : `ใกล้หมดอายุใน ${d} วัน`}
                      </span>
                    );
                  })()}
                  {p.wholesale_price != null && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-normal text-sky-600">
                      ส่ง {Number(p.wholesale_price).toLocaleString("th-TH")}
                    </span>
                  )}
                </td>
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
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">ไม่มีข้อมูลสินค้า</td>
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
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">รูปสินค้า (สำหรับร้านค้าออนไลน์)</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
                    {form.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl text-gray-300">📦</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">
                      {uploadingImage ? "กำลังอัปโหลด..." : form.image_url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                      <input ref={imageFileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                    </label>
                    {form.image_url && (
                      <button type="button" onClick={() => setForm((f) => ({ ...f, image_url: "" }))} className="text-xs text-red-500 hover:underline">
                        ลบรูป
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">รหัสสินค้า (SKU)</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">หมวดหมู่</label>
                {addingCategory ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="ชื่อหมวดหมู่ใหม่"
                      value={newCategory}
                      onChange={(e) => {
                        setNewCategory(e.target.value);
                        setForm((f) => ({ ...f, category: e.target.value.trim() }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newCategory.trim()) setForm((f) => ({ ...f, category: newCategory.trim() }));
                          setAddingCategory(false);
                        }
                      }}
                      onBlur={() => {
                        if (newCategory.trim()) setForm((f) => ({ ...f, category: newCategory.trim() }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newCategory.trim()) setForm((f) => ({ ...f, category: newCategory.trim() }));
                        setAddingCategory(false);
                      }}
                      className="whitespace-nowrap rounded-lg border px-2 py-2 text-xs hover:bg-gray-50"
                    >
                      ✓ ตกลง
                    </button>
                  </div>
                ) : (
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={form.category}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setNewCategory("");
                        setAddingCategory(true);
                      } else {
                        setForm({ ...form, category: e.target.value });
                      }
                    }}
                  >
                    <option value="">- ไม่ระบุหมวดหมู่ -</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__new__">+ เพิ่มหมวดหมู่ใหม่...</option>
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">หน่วยนับ</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
              {!bulkMode && (
                <>
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
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">แจ้งเตือนสต๊อกต่ำที่</label>
                <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>

              {!form.id && (
                <div className="col-span-2 flex items-center justify-between rounded-lg border border-dashed p-2">
                  <div>
                    <p className="text-xs font-medium text-gray-700">สินค้ามีหลายตัวเลือก (เบอร์/สี/ไซส์)</p>
                    <p className="text-[11px] text-gray-400">เพิ่มหลายตัวเลือกพร้อมต้นทุน/ราคา/สต๊อกแยกแต่ละตัวในครั้งเดียว</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkMode((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${bulkMode ? "bg-brand" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${bulkMode ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              )}

              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  กลุ่มสินค้า (สำหรับสินค้าที่มีหลายเบอร์/ตัวเลือก){bulkMode && " *"}
                </label>
                <input
                  required={bulkMode}
                  list="variant-group-options"
                  placeholder="เช่น เสื้อนักเรียนชาย"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.variant_group}
                  onChange={(e) => setForm({ ...form, variant_group: e.target.value })}
                />
                <datalist id="variant-group-options">
                  {variantGroups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
                <p className="mt-1 text-[11px] text-gray-400">
                  ตั้งชื่อกลุ่มให้เหมือนกันสำหรับสินค้าที่เป็นตัวเลือกของกันและกัน (เช่น เสื้อนักเรียนชายทุกเบอร์ใช้ชื่อกลุ่มเดียวกัน)
                  ระบบจะรวมเป็นการ์ดเดียวแล้วให้เลือกตัวเลือกตอนขาย
                </p>
              </div>
              {form.variant_group.trim() && !bulkMode && (
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">เบอร์/ตัวเลือก</label>
                  <input
                    placeholder="เช่น เบอร์ 28"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={form.variant_label}
                    onChange={(e) => setForm({ ...form, variant_label: e.target.value })}
                  />
                </div>
              )}

              {bulkMode && !form.id && (
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ตัวเลือกสินค้า (เบอร์/สี/ไซส์) พร้อมราคาและสต๊อก
                  </label>
                  <div className="flex gap-1">
                    <input
                      placeholder="เช่น เบอร์ 28"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      value={newBulkLabel}
                      onChange={(e) => setNewBulkLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addBulkVariant();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addBulkVariant}
                      className="whitespace-nowrap rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      + เพิ่มตัวเลือก
                    </button>
                  </div>

                  {bulkVariants.length > 0 && (
                    <div className="mt-2 overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-gray-500">
                            <th className="px-2 py-1.5">ตัวเลือก</th>
                            <th className="px-2 py-1.5 text-right">ต้นทุน</th>
                            <th className="px-2 py-1.5 text-right">ราคา</th>
                            <th className="px-2 py-1.5 text-right">จำนวน</th>
                            <th className="px-2 py-1.5 text-center">แสดงขาย</th>
                            <th className="px-2 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkVariants.map((v) => (
                            <tr key={v.label} className="border-b last:border-0">
                              <td className="px-2 py-1.5 font-medium text-gray-700">{v.label}</td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={v.cost}
                                  onChange={(e) => updateBulkVariant(v.label, { cost: e.target.value })}
                                  className="w-20 rounded border px-1.5 py-1 text-right text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={v.price}
                                  onChange={(e) => updateBulkVariant(v.label, { price: e.target.value })}
                                  className="w-20 rounded border px-1.5 py-1 text-right text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={v.qty}
                                  onChange={(e) => updateBulkVariant(v.label, { qty: e.target.value })}
                                  className="w-16 rounded border px-1.5 py-1 text-right text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={v.active}
                                  onChange={(e) => updateBulkVariant(v.label, { active: e.target.checked })}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeBulkVariant(v.label)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    ระบบจะสร้างสินค้าแยกให้ทีละตัวเลือก โดยตั้งชื่อว่า "{(form.name || "ชื่อสินค้า").trim()} + ตัวเลือก" เช่น "
                    {(form.name || "เสื้อนักเรียนชาย").trim()} เบอร์ 28" — แก้ไขชื่อ/บาร์โค้ด/รูปของแต่ละตัวเลือกทีหลังได้จากปุ่ม "แก้ไข" ในตาราง
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">ที่อยู่จัดเก็บสินค้า</label>
                <input
                  placeholder="เช่น ชั้น A2, คลัง 1"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.storage_location}
                  onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">ลำดับการแสดงผลหน้าขาย</label>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-gray-400">เลขน้อยแสดงก่อน ค่าเริ่มต้น 0</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">วันหมดอายุ</label>
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">ราคาขายส่ง (ไม่บังคับ)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="ถ้าไม่กรอกจะใช้ราคาขายปกติ"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.wholesale_price}
                  onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-gray-400">ใช้อัตโนมัติเมื่อขายให้ลูกค้าประเภท "ลูกค้าส่ง"</p>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อแยกสำหรับใบเสร็จ (ไม่บังคับ)</label>
                <input
                  placeholder="ถ้าไม่กรอกจะใช้ชื่อสินค้าปกติ"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={form.receipt_name}
                  onChange={(e) => setForm({ ...form, receipt_name: e.target.value })}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 rounded-lg border border-dashed p-2">
                <input
                  id="no_stock_tracking"
                  type="checkbox"
                  checked={form.no_stock_tracking}
                  onChange={(e) => setForm({ ...form, no_stock_tracking: e.target.checked })}
                />
                <label htmlFor="no_stock_tracking" className="text-xs text-gray-600">
                  ไม่ตัดสต๊อก (สำหรับสินค้าบริการ/รายการที่ไม่ต้องนับจำนวนคงเหลือ)
                </label>
              </div>

              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">สีการ์ด (ใช้แทนรูปภาพถ้าไม่มีรูป)</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, card_color: "" })}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs text-gray-400 ${
                      !form.card_color ? "border-brand" : "border-gray-200"
                    }`}
                    title="ไม่ใช้สี"
                  >
                    ✕
                  </button>
                  {PRODUCT_CARD_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setForm({ ...form, card_color: c.hex })}
                      className={`h-8 w-8 rounded-full border-2 ${form.card_color === c.hex ? "border-brand" : "border-transparent"}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {!bulkMode && (
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">บาร์โค้ดเพิ่มเติม (นอกเหนือจาก SKU)</label>
                  <div className="flex gap-1">
                    <input
                      placeholder="สแกนหรือพิมพ์บาร์โค้ด แล้วกด + เพิ่ม"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      value={newBarcode}
                      onChange={(e) => setNewBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addBarcode();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addBarcode}
                      className="whitespace-nowrap rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                  {barcodes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {barcodes.map((b) => (
                        <span key={b} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                          {b}
                          <button type="button" onClick={() => removeBarcode(b)} className="text-gray-400 hover:text-red-500">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

      {showCategoryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">จัดการหมวดหมู่สินค้า</h2>
              <button onClick={() => setShowCategoryManager(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {catMsg && <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{catMsg}</div>}

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  {editingCat === cat ? (
                    <>
                      <input
                        autoFocus
                        className="flex-1 rounded-lg border px-2 py-1 text-sm"
                        value={editingCatValue}
                        onChange={(e) => setEditingCatValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEditCat(cat);
                          } else if (e.key === "Escape") {
                            cancelEditCat();
                          }
                        }}
                      />
                      <button
                        disabled={catBusy}
                        onClick={() => saveEditCat(cat)}
                        className="whitespace-nowrap rounded-lg bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        บันทึก
                      </button>
                      <button disabled={catBusy} onClick={cancelEditCat} className="whitespace-nowrap rounded-lg border px-2 py-1 text-xs">
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-gray-800">{cat}</span>
                      <span className="whitespace-nowrap text-xs text-gray-400">{categoryCounts[cat] ?? 0} รายการ</span>
                      <button disabled={catBusy} onClick={() => startEditCat(cat)} className="whitespace-nowrap text-xs font-medium text-brand hover:underline">
                        แก้ไข
                      </button>
                      <button disabled={catBusy} onClick={() => deleteCat(cat)} className="whitespace-nowrap text-xs font-medium text-red-600 hover:underline">
                        ลบ
                      </button>
                    </>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีหมวดหมู่ในระบบ</p>
              )}
              {uncategorizedCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-gray-400">
                  <span className="flex-1 text-sm">- ไม่ระบุหมวดหมู่ -</span>
                  <span className="whitespace-nowrap text-xs">{uncategorizedCount} รายการ</span>
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-gray-400">
              แก้ไขชื่อหมวดหมู่จะเปลี่ยนหมวดหมู่ของสินค้าทุกรายการที่อยู่ในหมวดนั้นทันที ถ้าตั้งชื่อซ้ำกับหมวดที่มีอยู่แล้วจะเป็นการรวมหมวดหมู่เข้าด้วยกัน
              ส่วนการลบจะย้ายสินค้าไปเป็น "ไม่ระบุหมวดหมู่" เท่านั้น ไม่ได้ลบสินค้าออกจากระบบ
            </p>

            <div className="mt-5 flex justify-end">
              <button onClick={() => setShowCategoryManager(false)} className="rounded-lg border px-4 py-2 text-sm">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
