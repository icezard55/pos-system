"use client";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import type { Product } from "@/lib/types";

const CHANNEL = "shopee";

interface FileItem {
  skuId: string;
  name: string;
  variation: string;
  price: number;
  qty: number;
}

interface Candidate {
  product: Product;
  score: number;
}

type Action = "skip" | "new" | string; // string = product id to link

interface Row {
  item: FileItem;
  status: "mapped" | "sku_match" | "review";
  existingName?: string;
  productId?: string;
  candidates: Candidate[];
  action: Action;
  updatePrice: boolean;
  cost?: string; // ต้นทุน/หน่วย (ไม่บังคับ)
}

interface RawShopee { ref: string; name: string; variation: string; price: string; qty: string }
const HEADER: Record<string, keyof RawShopee> = {
  "เลขอ้างอิง sku (sku reference no.)": "ref",
  "ชื่อสินค้า": "name",
  "ชื่อตัวเลือก": "variation",
  "ราคาตั้งต้น": "price",
  "จำนวน": "qty",
};

const clean = (v: any) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();

function sizeNums(s: string): string[] {
  const out: string[] = [];
  const re = /เบอร์\s*([0-9]+(?:\.[0-9]+)?)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function stripForText(s: string) {
  return s
    .toLowerCase()
    .replace(/เบอร์\s*[0-9.]+/g, "")
    .replace(/[\s\-_/,.()\[\]*×x:+]+/g, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function score(item: FileItem, p: Product): number {
  const fileText = `${item.name} ${item.variation}`;
  const prodText = `${p.name} ${p.variant_label ?? ""}`;
  const fb = bigrams(stripForText(fileText));
  const pb = bigrams(stripForText(prodText));
  if (pb.size === 0 || fb.size === 0) return 0;
  let inter = 0;
  pb.forEach((g) => fb.has(g) && inter++);
  const recall = inter / pb.size; // สัดส่วนชื่อสินค้าเราที่ปรากฏในชื่อไฟล์
  const dice = (2 * inter) / (pb.size + fb.size);
  let s = 0.75 * recall + 0.25 * Math.min(1, dice * 2);

  const fs = sizeNums(item.variation).length ? sizeNums(item.variation) : sizeNums(item.name);
  const ps = sizeNums(prodText);
  if (fs.length && ps.length) {
    s = fs.some((x) => ps.includes(x)) ? Math.min(1, s + 0.1) : s * 0.3;
  }
  return Math.max(0, Math.min(1, s));
}

// Shopee ไม่มี SKU ID — ใช้ "รหัสอ้างอิง SKU" ถ้าร้านตั้งไว้ ไม่งั้นใช้ "ชื่อสินค้า|ชื่อตัวเลือก"
// (รูปแบบเดียวกับตอนนำเข้าออเดอร์ที่หน้าขาย เพื่อให้การจับคู่ใช้ร่วมกันได้)
function parseFile(buf: ArrayBuffer): FileItem[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase() === "orders") ?? wb.SheetNames[0]];
  const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  const seen = new Map<string, FileItem>();
  for (const r of raw) {
    const m: Partial<Record<keyof RawShopee, any>> = {};
    for (const k of Object.keys(r)) {
      const key = HEADER[k.trim().toLowerCase()];
      if (key) m[key] = r[k];
    }
    const name = clean(m.name);
    if (!name) continue;
    const variation = clean(m.variation);
    const ref = clean(m.ref);
    const skuId = ref ? `sku:${ref}` : `name:${String(m.name ?? "").trim()}|${String(m.variation ?? "").trim()}`.slice(0, 300);
    if (seen.has(skuId)) {
      seen.get(skuId)!.qty += Number(clean(m.qty).replace(/,/g, "")) || 0;
      continue;
    }
    const price = Number(clean(m.price).replace(/,/g, ""));
    const qty = Number(clean(m.qty).replace(/,/g, "")) || 0;
    seen.set(skuId, { skuId, name, variation, price: Number.isFinite(price) ? price : 0, qty });
  }
  return [...seen.values()];
}

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function ShopeeSkuImport({
  products,
  shopId,
  onClose,
  onDone,
}: {
  products: Product[];
  shopId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [costPct, setCostPct] = useState("");
  const [stockMode, setStockMode] = useState<"none" | "add" | "set">("none");
  const [msg, setMsg] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setRows(null);
    try {
      const items = parseFile(await file.arrayBuffer());
      if (items.length === 0) throw new Error('ไม่พบคอลัมน์ "ชื่อสินค้า" ในไฟล์ (ต้องเป็นไฟล์ออเดอร์ Order.toship…xlsx ของ Shopee)');

      const maps = await fetchAllRows<{ platform_sku_id: string; product_id: string }>((f, t) =>
        supabase.from("platform_sku_map").select("platform_sku_id, product_id").eq("channel", CHANNEL).order("id").range(f, t)
      );
      const mapById = new Map(maps.map((m) => [m.platform_sku_id, m.product_id]));
      const prodById = new Map(products.map((p) => [p.id, p]));
      const prodBySku = new Map(products.filter((p) => p.sku).map((p) => [String(p.sku).trim(), p]));
      const active = products.filter((p) => p.is_active !== false);

      const out: Row[] = items.map((item) => {
        const mappedId = mapById.get(item.skuId);
        if (mappedId) {
          return { item, status: "mapped", existingName: prodById.get(mappedId)?.name ?? "(สินค้าถูกลบแล้ว)", productId: prodById.has(mappedId) ? mappedId : undefined, candidates: [], action: "skip", updatePrice: false };
        }
        const bySku = item.skuId.startsWith("sku:") ? prodBySku.get(item.skuId.slice(4)) : undefined;
        if (bySku) {
          return { item, status: "sku_match", existingName: bySku.name, productId: bySku.id, candidates: [{ product: bySku, score: 1 }], action: "skip", updatePrice: false };
        }
        const candidates = active
          .map((p) => ({ product: p, score: score(item, p) }))
          .filter((c) => c.score >= 0.35)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const best = candidates[0];
        return {
          item,
          status: "review",
          candidates,
          action: best && best.score >= 0.5 ? best.product.id : "skip",
          updatePrice: true,
        };
      });
      setRows(out);
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function patch(i: number, p: Partial<Row>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  // ตั้งต้นทุนทุกรายการที่สร้างใหม่/สินค้าที่ต้นทุนยังเป็น 0 ให้เป็น % ของราคาในไฟล์
  function fillCostPct() {
    const pct = Number(costPct);
    if (!(pct > 0)) return;
    setRows((prev) =>
      prev &&
      prev.map((r) => {
        if (r.status !== "review" || r.action === "skip" || !(r.item.price > 0)) return r;
        const p = r.action === "new" ? undefined : r.candidates.find((c) => c.product.id === r.action)?.product;
        if (r.action !== "new" && Number(p?.cost_price ?? 0) > 0) return r;
        return { ...r, cost: String(Math.round(r.item.price * pct) / 100) };
      })
    );
  }

  async function apply() {
    if (!rows) return;
    setBusy(true);
    setMsg(null);
    let linked = 0, created = 0, priced = 0, autoLinked = 0;
    const errors: string[] = [];
    let stockAdj = 0;
    let costSet = 0;
    const stockTarget = new Map<string, number>(); // product id → จำนวนรวมจากไฟล์
    try {
      const todo = rows.filter((r) => r.status === "review" && r.action !== "skip");
      const mapRows: { channel: string; platform_sku_id: string; product_id: string }[] = [];
      // รหัส SKU ของสินค้าตรงกับ SKU ID อยู่แล้ว แต่ยังไม่มีในตารางจับคู่ → จับคู่ให้อัตโนมัติ (ไม่แก้ราคา)
      for (const r of rows) {
        if (stockMode !== "none" && r.status !== "review" && r.productId && r.item.qty > 0) {
          stockTarget.set(r.productId, (stockTarget.get(r.productId) ?? 0) + r.item.qty);
        }
        if (r.status === "sku_match" && r.candidates[0]) {
          mapRows.push({ channel: CHANNEL, platform_sku_id: r.item.skuId, product_id: r.candidates[0].product.id });
          autoLinked++;
        }
      }
      for (const r of todo) {
        let productId = r.action;
        if (r.action === "new") {
          const name = `${r.item.name}${r.item.variation ? ` ${r.item.variation}` : ""}`.trim();
          const { data, error } = await supabase
            .from("products")
            .insert({
              shop_id: shopId,
              name,
              sku: r.item.skuId.startsWith("sku:") ? r.item.skuId.slice(4) : null,
              unit: "ชิ้น",
              cost_price: Number(r.cost) > 0 ? Number(r.cost) : 0,
              sell_price: r.item.price,
              channel_prices: { shopee: r.item.price },
              stock_qty: stockMode !== "none" ? r.item.qty : 0,
              low_stock_threshold: 0,
            })
            .select("id")
            .single();
          if (error) {
            errors.push(`สร้าง "${name.slice(0, 40)}" ไม่สำเร็จ: ${error.message}`);
            continue;
          }
          productId = data.id;
          created++;
        } else {
          const upd: Record<string, any> = {};
          const p = products.find((x) => x.id === productId);
          if (Number(r.cost) > 0 && Number(p?.cost_price ?? 0) !== Number(r.cost)) { upd.cost_price = Number(r.cost); costSet++; }
          const cur = p?.channel_prices?.shopee;
          if (r.updatePrice && p && (cur == null || Number(cur) !== r.item.price) && r.item.price > 0) {
            upd.channel_prices = { ...(p.channel_prices ?? {}), shopee: r.item.price };
          }
          if (Object.keys(upd).length) {
            const { error } = await supabase.from("products").update(upd).eq("id", productId);
            if (error) {
              errors.push(`แก้ "${p?.name}" ไม่สำเร็จ: ${error.message}`);
              continue;
            }
            if (upd.channel_prices !== undefined) priced++;
          }
          linked++;
        }
        if (r.action !== "new" && stockMode !== "none" && r.item.qty > 0) {
          stockTarget.set(productId, (stockTarget.get(productId) ?? 0) + r.item.qty);
        }
        mapRows.push({ channel: CHANNEL, platform_sku_id: r.item.skuId, product_id: productId });
      }
      // ปรับสต๊อกสินค้าที่มีอยู่แล้ว (บันทึกประวัติ + audit log ผ่าน adjust_stock)
      for (const [pid, qty] of stockTarget) {
        const p = products.find((x) => x.id === pid);
        const delta = stockMode === "add" ? qty : qty - Number(p?.stock_qty ?? 0);
        if (!delta) continue;
        const { error } = await supabase.rpc("adjust_stock", { p_product_id: pid, p_change_qty: delta, p_note: `นำเข้าจำนวนจากไฟล์ Shopee (${stockMode === "add" ? "เพิ่ม" : "ตั้งเท่ากับ"} ${qty})` });
        if (error) errors.push(`ปรับสต๊อก "${p?.name ?? pid}" ไม่สำเร็จ: ${error.message}`);
        else stockAdj++;
      }
      if (mapRows.length) {
        const { error } = await supabase.from("platform_sku_map").upsert(mapRows, { onConflict: "shop_id,channel,platform_sku_id" });
        if (error) throw error;
      }
      setDone(
        `เสร็จแล้ว — จับคู่ ${linked + autoLinked} รายการ · สร้างสินค้าใหม่ ${created} · ตั้งราคา Shopee ${priced}` +
          (costSet ? ` · ตั้งต้นทุนสินค้าเดิม ${costSet}` : "") +
          (stockMode !== "none" ? ` · ปรับสต๊อกสินค้าเดิม ${stockAdj} รายการ` : "") +
          (errors.length ? ` · มีปัญหา ${errors.length} รายการ: ${errors.join(" | ")}` : "")
      );
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const counts = rows
    ? {
        mapped: rows.filter((r) => r.status !== "review").length,
        review: rows.filter((r) => r.status === "review").length,
        stockable: rows.filter((r) => r.status !== "review" && r.productId && r.item.qty > 0).length,
        act: rows.filter((r) => r.status === "review" && r.action !== "skip").length,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold">นำเข้าสินค้า + ราคา Shopee จากไฟล์ออเดอร์</h2>
            <p className="text-xs text-gray-500">
              ระบบอ่านชื่อสินค้า / ตัวเลือก / ราคาตั้งต้น จากไฟล์ออเดอร์ Shopee แล้วจับคู่กับสินค้าในสต๊อก
              ราคาจะบันทึกเป็น "ราคา Shopee" (ไม่แตะราคาขายปกติ) — รายการที่จับคู่ไว้แล้วจะข้าม ส่วนที่ชื่อใกล้เคียงจะให้คุณยืนยันก่อน
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!rows && !done && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center text-sm text-gray-500 hover:bg-gray-50">
              <span className="text-3xl">📂</span>
              <span className="mt-2 font-medium">{busy ? "กำลังอ่านไฟล์..." : "เลือกไฟล์ออเดอร์ Shopee (Order.toship….xlsx)"}</span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={busy} className="hidden" />
            </label>
          )}
          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
          {done && (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              {done}
              <div className="mt-3">
                <button onClick={onDone} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">ปิดและรีเฟรชรายการสินค้า</button>
              </div>
            </div>
          )}

          {rows && !done && counts && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full bg-gray-100 px-3 py-1">ในไฟล์ {rows.length} SKU</span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">ข้าม (มีอยู่แล้ว) {counts.mapped}</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">ต้องตรวจสอบ {counts.review}</span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-green-200 bg-green-50/60 p-3 text-xs text-gray-700">
                <span className="font-medium text-sm text-gray-800">ใส่ต้นทุนสินค้าเลยไหม?</span>
                <span className="text-gray-500">ไฟล์ไม่มีราคาทุน — กรอกในแต่ละรายการ หรือตั้งเป็น % ของราคาขายทีเดียว</span>
                <input
                  type="number" min={0} max={100} placeholder="เช่น 65"
                  value={costPct} onChange={(e) => setCostPct(e.target.value)}
                  className="w-20 rounded-lg border px-2 py-1 text-sm"
                />
                <span>% ของราคา</span>
                <button type="button" onClick={fillCostPct} className="rounded-lg border border-green-300 bg-white px-3 py-1 hover:bg-green-50">ใช้กับสินค้าใหม่/ที่ต้นทุนยังเป็น 0</button>
              </div>

              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-sm">
                <p className="font-medium text-gray-800">ให้ใส่จำนวนสินค้าจากไฟล์เลยไหม?</p>
                <p className="mb-2 text-xs text-gray-500">
                  จำนวนในไฟล์คือ "จำนวนที่ลูกค้าสั่ง" รวมต่อสินค้า (ไม่ใช่สต๊อกคงเหลือ) — ใช้กับสินค้าที่จับคู่แล้วและสินค้าที่สร้างใหม่
                </p>
                {([
                  ["none", "ไม่แตะสต๊อก (ค่าเริ่มต้น)"],
                  ["add", "เพิ่มเข้าสต๊อกตามจำนวนในไฟล์ (สินค้าใหม่ = เริ่มที่จำนวนในไฟล์)"],
                  ["set", "ตั้งสต๊อกให้เท่ากับจำนวนในไฟล์ (สินค้าใหม่ = เริ่มที่จำนวนในไฟล์)"],
                ] as const).map(([v, t]) => (
                  <label key={v} className="flex items-center gap-2 py-0.5 text-xs text-gray-700">
                    <input type="radio" name="stockMode" checked={stockMode === v} onChange={() => setStockMode(v)} />
                    {t}
                  </label>
                ))}
                {stockMode !== "none" && (
                  <p className="mt-1 text-[11px] text-amber-700">รวมรายการที่ "ข้าม (จับคู่ไว้แล้ว)" ด้วย — อัปโหลดไฟล์เดิมซ้ำจะเพิ่มซ้ำ การปรับมีประวัติในหน้าปรับสต๊อก</p>
                )}
              </div>

              <div className="space-y-2">
                {rows.map((r, i) => {
                  if (r.status !== "review") {
                    return (
                      <div key={r.item.skuId} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        <span className="rounded-full bg-gray-200 px-2 py-0.5">ข้าม</span>
                        <span className="max-w-[16rem] truncate">{r.item.name} {r.item.variation}</span>
                        <span>→ {r.existingName}</span>
                        {r.item.qty > 0 && <span className="text-blue-600">· ในไฟล์ {r.item.qty} ชิ้น</span>}
                        <span className="text-gray-400">({r.status === "mapped" ? "จับคู่ไว้แล้ว" : "รหัสอ้างอิง SKU ตรงกับสินค้าอยู่แล้ว"})</span>
                      </div>
                    );
                  }
                  const best = r.candidates[0];
                  const chosen = r.action !== "skip" && r.action !== "new" ? r.candidates.find((c) => c.product.id === r.action)?.product : undefined;
                  const strong = best && best.score >= 0.8;
                  return (
                    <div key={r.item.skuId} className={`rounded-xl border p-3 ${strong ? "border-emerald-200 bg-emerald-50/40" : best ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800" title={r.item.name}>{r.item.name}</p>
                          <p className="text-xs text-gray-500">
                            {r.item.variation || "—"} · ราคาตั้งต้นในไฟล์{" "}
                            <span className="font-semibold text-gray-800">฿{baht(r.item.price)}</span>
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${strong ? "bg-emerald-100 text-emerald-700" : best ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          {strong ? "ตรงกันมาก" : best ? "ชื่อใกล้เคียง — โปรดยืนยัน" : "ไม่พบสินค้าที่ตรงกัน"}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={r.action}
                          onChange={(e) => patch(i, { action: e.target.value })}
                          className="min-w-0 max-w-full flex-1 rounded-lg border bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="skip">— ข้ามรายการนี้ —</option>
                          {r.candidates.map((c) => (
                            <option key={c.product.id} value={c.product.id}>
                              ใช่ สินค้าเดียวกับ: {c.product.name} (฿{baht(Number(c.product.sell_price))}) · เหมือน {Math.round(c.score * 100)}%
                            </option>
                          ))}
                          <option value="new">➕ ไม่ใช่ — สร้างเป็นสินค้าใหม่</option>
                        </select>
                        {chosen && (
                          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
                            <input type="checkbox" checked={r.updatePrice} onChange={(e) => patch(i, { updatePrice: e.target.checked })} />
                            {chosen.channel_prices?.shopee != null && Number(chosen.channel_prices.shopee) === r.item.price
                              ? `ราคา Shopee เท่าเดิม ฿${baht(r.item.price)}`
                              : `ตั้งราคา Shopee ${chosen.channel_prices?.shopee != null ? `฿${baht(Number(chosen.channel_prices.shopee))} → ` : "→ "}฿${baht(r.item.price)}`}
                          </label>
                        )}
                        {r.action === "new" && <span className="text-xs text-gray-500">สต๊อก {stockMode !== "none" ? r.item.qty : 0} · ราคาขาย/Shopee ฿{baht(r.item.price)}</span>}
                        {r.action !== "skip" && (
                          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-600">
                            ต้นทุน/หน่วย
                            <input
                              type="number" min={0} step="0.01" placeholder="ไม่ระบุ"
                              value={r.cost ?? ""} onChange={(e) => patch(i, { cost: e.target.value })}
                              className="w-24 rounded-lg border px-2 py-1 text-sm"
                            />
                            {chosen && Number(chosen.cost_price) > 0 && <span className="text-gray-400">(เดิม ฿{baht(Number(chosen.cost_price))})</span>}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {rows && !done && counts && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
            <p className="text-xs text-gray-500">จะดำเนินการ {counts.act} รายการ · ที่เลือก "ข้าม" จะไม่ถูกแก้ไข</p>
            <div className="flex gap-2">
              <button onClick={() => setRows(null)} className="rounded-lg border px-4 py-2 text-sm">เลือกไฟล์ใหม่</button>
              <button
                onClick={apply}
                disabled={busy || (counts.act === 0 && (stockMode === "none" || counts.stockable === 0))}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? "กำลังบันทึก..." : `ยืนยันและบันทึก (${counts.act + (stockMode !== "none" ? counts.stockable : 0)})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
