"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNT_STATUS, type StockCount } from "../StockCountsClient";

interface Item {
  id: string;
  product_id: string;
  product_name: string;
  system_qty: number;
  counted_qty: number | null;
  cost_price: number;
  counted_at: string | null;
}
interface ProductLite {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  variant_group: string | null;
  variant_label: string | null;
}

function baht(n: number) {
  return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Filter = "all" | "uncounted" | "match" | "short" | "over";

export default function StockCountDetailClient({
  count,
  initialItems,
  products,
  barcodes,
  isAdmin,
}: {
  count: StockCount;
  initialItems: Item[];
  products: ProductLite[];
  barcodes: { product_id: string; barcode: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [scanQty, setScanQty] = useState("1");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState<ProductLite[] | null>(null);
  const [limit, setLimit] = useState(150);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const editable = count.status === "counting";

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const codeMap = useMemo(() => {
    const m = new Map<string, ProductLite[]>();
    const add = (code: string, p: ProductLite) => {
      const k = code.trim().toLowerCase();
      if (!k) return;
      const l = m.get(k);
      if (l) { if (!l.some((x) => x.id === p.id)) l.push(p); } else m.set(k, [p]);
    };
    for (const p of products) if (p.sku) add(p.sku, p);
    for (const b of barcodes) { const p = productById.get(b.product_id); if (p) add(b.barcode, p); }
    return m;
  }, [products, barcodes, productById]);

  const stats = useMemo(() => {
    let counted = 0, match = 0, short = 0, over = 0, net = 0, abs = 0;
    for (const i of items) {
      if (i.counted_qty === null) continue;
      counted++;
      const d = Number(i.counted_qty) - Number(i.system_qty);
      if (d === 0) match++; else if (d < 0) short++; else over++;
      net += d * Number(i.cost_price);
      abs += Math.abs(d) * Number(i.cost_price);
    }
    return { counted, match, short, over, net, abs, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.product_name.toLowerCase().includes(q) && !(productById.get(i.product_id)?.sku ?? "").toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "uncounted") return i.counted_qty === null;
      if (i.counted_qty === null) return false;
      const d = Number(i.counted_qty) - Number(i.system_qty);
      return filter === "match" ? d === 0 : filter === "short" ? d < 0 : d > 0;
    });
  }, [items, filter, search, productById]);

  function flash(ok: boolean, text: string) {
    setScanMsg({ ok, text });
    window.setTimeout(() => setScanMsg(null), 3000);
  }

  async function addScan(p: ProductLite) {
    setPick(null);
    const delta = Number(scanQty) || 1;
    const { data, error } = await supabase.rpc("scan_stock_count", { p_count_id: count.id, p_product_id: p.id, p_delta: delta });
    if (error) return flash(false, error.message);
    setItems((prev) => {
      const exists = prev.some((i) => i.product_id === p.id);
      if (!exists) {
        router.refresh();
        return [...prev, { id: `tmp-${p.id}`, product_id: p.id, product_name: p.name, system_qty: 0, counted_qty: Number(data), cost_price: 0, counted_at: new Date().toISOString() }];
      }
      return prev.map((i) => (i.product_id === p.id ? { ...i, counted_qty: Number(data), counted_at: new Date().toISOString() } : i));
    });
    flash(true, `${p.name} → นับได้ ${Number(data)}`);
    scanRef.current?.focus();
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim().toLowerCase();
    setScan("");
    if (!code) return;
    const matches = codeMap.get(code) ?? [];
    if (matches.length === 0) {
      // ลองค้นจากชื่อ ถ้าเจอรายการเดียวในใบนี้ก็นับให้เลย
      const byName = items.filter((i) => i.product_name.toLowerCase().includes(code));
      if (byName.length === 1) {
        const p = productById.get(byName[0].product_id);
        if (p) return void addScan(p);
      }
      return flash(false, `ไม่พบสินค้ารหัส "${code}"`);
    }
    if (matches.length === 1) return void addScan(matches[0]);
    setPick(matches.sort((a, b) => (a.variant_label ?? a.name).localeCompare(b.variant_label ?? b.name, "th", { numeric: true })));
  }

  async function saveQty(item: Item) {
    const raw = drafts[item.id];
    if (raw === undefined) return;
    const v = raw.trim() === "" ? null : Number(raw);
    if (v !== null && (isNaN(v) || v < 0)) return flash(false, "จำนวนไม่ถูกต้อง");
    if (v === item.counted_qty) {
      setDrafts((d) => { const n = { ...d }; delete n[item.id]; return n; });
      return;
    }
    const { error } = await supabase.rpc("set_stock_count_qty", { p_item_id: item.id, p_counted_qty: v });
    if (error) return flash(false, error.message);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, counted_qty: v } : i)));
    setDrafts((d) => { const n = { ...d }; delete n[item.id]; return n; });
  }

  async function fillZero() {
    const n = stats.total - stats.counted;
    if (!confirm(`ตั้งค่า "นับได้ = 0" ให้ ${n} รายการที่ยังไม่ได้นับ?\n(ใช้เมื่อนับครบทั้งร้านแล้ว และรายการที่เหลือคือหาไม่เจอจริง)`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("fill_uncounted_zero", { p_count_id: count.id });
    setBusy(false);
    if (error) return alert(error.message);
    setItems((prev) => prev.map((i) => (i.counted_qty === null ? { ...i, counted_qty: 0 } : i)));
  }

  async function post() {
    const uncounted = stats.total - stats.counted;
    const msg =
      `อนุมัติปรับยอดสต๊อกตามที่นับได้?\n\n` +
      `• นับแล้ว ${stats.counted} รายการ (ตรง ${stats.match} · ขาด ${stats.short} · เกิน ${stats.over})\n` +
      `• ผลต่างสุทธิ ${stats.net < 0 ? "-" : "+"}฿${baht(Math.abs(stats.net))}\n` +
      (uncounted > 0 ? `• อีก ${uncounted} รายการที่ยังไม่นับ จะไม่ถูกปรับ\n` : "") +
      `\nเมื่ออนุมัติแล้วจะแก้ไขใบนี้ไม่ได้`;
    if (!confirm(msg)) return;
    setBusy(true);
    const { error } = await supabase.rpc("post_stock_count", { p_count_id: count.id });
    setBusy(false);
    if (error) return alert(error.message);
    router.refresh();
  }

  async function cancel() {
    if (!confirm("ยกเลิกใบตรวจนับนี้? (สต๊อกจะไม่ถูกปรับ)")) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_stock_count", { p_count_id: count.id });
    setBusy(false);
    if (error) return alert(error.message);
    router.push("/stock-counts");
    router.refresh();
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = items.map((i) => {
      const p = productById.get(i.product_id);
      const d = i.counted_qty === null ? "" : Number(i.counted_qty) - Number(i.system_qty);
      return {
        รหัส: p?.sku ?? "",
        สินค้า: i.product_name,
        "ยอดในระบบ": Number(i.system_qty),
        "นับได้": i.counted_qty ?? "",
        "ผลต่าง": d,
        "ทุน/หน่วย": Number(i.cost_price),
        "มูลค่าผลต่าง": d === "" ? "" : Number(d) * Number(i.cost_price),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ตรวจนับ");
    XLSX.writeFile(wb, `${count.count_no}.xlsx`);
  }

  const pctDone = stats.total ? (stats.counted / stats.total) * 100 : 0;
  const accuracy = stats.counted ? (stats.match / stats.counted) * 100 : 0;

  return (
    <div>
      <Link href="/stock-counts" className="text-sm text-brand hover:underline">← ใบตรวจนับทั้งหมด</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {count.count_no}{" "}
            <span className={`ml-1 align-middle rounded-full px-2 py-0.5 text-xs font-medium ${COUNT_STATUS[count.status].cls}`}>{COUNT_STATUS[count.status].label}</span>
          </h1>
          <p className="text-sm text-gray-500">
            {count.title} · {count.category ?? "ทั้งร้าน"} · เปิดเมื่อ {new Date(count.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportExcel} className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">⬇️ Excel</button>
          {editable && isAdmin && (
            <>
              <button disabled={busy} onClick={cancel} className="rounded-lg border bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">ยกเลิกใบ</button>
              <button disabled={busy || stats.counted === 0} onClick={post} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                ✓ อนุมัติปรับยอดสต๊อก
              </button>
            </>
          )}
        </div>
      </div>

      {/* สรุป */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-gray-600">นับแล้ว <b className="text-gray-800">{stats.counted.toLocaleString()}</b> / {stats.total.toLocaleString()} รายการ</span>
          <span className="font-semibold text-brand">{pctDone.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pctDone}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
          <div><p className="text-xl font-bold text-emerald-600">{stats.match}</p><p className="text-[11px] text-gray-500">ตรงกับระบบ</p></div>
          <div><p className="text-xl font-bold text-red-600">{stats.short}</p><p className="text-[11px] text-gray-500">ขาด (น้อยกว่าระบบ)</p></div>
          <div><p className="text-xl font-bold text-amber-600">{stats.over}</p><p className="text-[11px] text-gray-500">เกิน (มากกว่าระบบ)</p></div>
          <div><p className={`text-xl font-bold ${stats.net < 0 ? "text-red-600" : "text-gray-800"}`}>{stats.net < 0 ? "-" : "+"}฿{baht(Math.abs(stats.net))}</p><p className="text-[11px] text-gray-500">ผลต่างสุทธิ (ทุน)</p></div>
          <div><p className="text-xl font-bold text-gray-800">{stats.counted ? `${accuracy.toFixed(1)}%` : "—"}</p><p className="text-[11px] text-gray-500">ความแม่นยำ</p></div>
        </div>
      </div>

      {/* สแกน */}
      {editable && (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-brand/40 bg-blue-50/40 p-4">
          <form onSubmit={handleScan} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">📷 สแกนบาร์โค้ด / พิมพ์รหัสสินค้า แล้วกด Enter — นับเพิ่มทีละชิ้น</label>
              <input ref={scanRef} autoFocus value={scan} onChange={(e) => setScan(e.target.value)} placeholder="ยิงบาร์โค้ดที่นี่"
                className="w-full rounded-lg border bg-white px-3 py-2.5 text-base" />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-gray-600">จำนวนต่อครั้ง</label>
              <input type="number" min="1" value={scanQty} onChange={(e) => setScanQty(e.target.value)} className="w-full rounded-lg border bg-white px-3 py-2.5 text-base" />
            </div>
            <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">นับ</button>
          </form>
          {scanMsg && <p className={`mt-2 text-sm font-medium ${scanMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{scanMsg.ok ? "✓ " : "⚠ "}{scanMsg.text}</p>}
          {pick && (
            <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
              <p className="mb-2 text-sm font-medium text-gray-700">บาร์โค้ดนี้มีหลายเบอร์ — เลือกเบอร์ที่นับ:</p>
              <div className="flex flex-wrap gap-2">
                {pick.map((p) => (
                  <button key={p.id} onClick={() => addScan(p)} className="rounded-lg border px-3 py-2 text-sm hover:border-brand hover:bg-blue-50">
                    {p.variant_label || p.name}
                  </button>
                ))}
                <button onClick={() => setPick(null)} className="px-2 text-sm text-gray-400">ยกเลิก</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ/รหัสสินค้า" className="w-56 rounded-lg border px-3 py-1.5 text-sm" />
        {([
          ["all", "ทั้งหมด", stats.total],
          ["uncounted", "ยังไม่นับ", stats.total - stats.counted],
          ["match", "ตรง", stats.match],
          ["short", "ขาด", stats.short],
          ["over", "เกิน", stats.over],
        ] as [Filter, string, number][]).map(([k, label, n]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-brand bg-brand text-white" : "bg-white text-gray-600"}`}>
            {label} <span className="opacity-70">{n}</span>
          </button>
        ))}
        {editable && isAdmin && stats.total - stats.counted > 0 && (
          <button disabled={busy} onClick={fillZero} className="ml-auto rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            รายการที่ยังไม่นับ → นับเป็น 0
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">สินค้า</th>
              <th className="px-4 py-3 text-right">ยอดในระบบ</th>
              <th className="px-4 py-3 text-center">นับได้</th>
              <th className="px-4 py-3 text-right">ผลต่าง</th>
              <th className="px-4 py-3 text-right">มูลค่าผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((i) => {
              const p = productById.get(i.product_id);
              const d = i.counted_qty === null ? null : Number(i.counted_qty) - Number(i.system_qty);
              return (
                <tr key={i.id} className={`border-b last:border-0 ${d === null ? "" : d === 0 ? "bg-emerald-50/30" : d < 0 ? "bg-red-50/40" : "bg-amber-50/40"}`}>
                  <td className="px-4 py-2">
                    {i.product_name}
                    {p?.sku && <span className="ml-1 text-xs text-gray-400">[{p.sku}]</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{Number(i.system_qty)}</td>
                  <td className="px-4 py-2 text-center">
                    {editable && !i.id.startsWith("tmp-") ? (
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        value={drafts[i.id] ?? (i.counted_qty === null ? "" : String(i.counted_qty))}
                        onChange={(e) => setDrafts((dr) => ({ ...dr, [i.id]: e.target.value }))}
                        onBlur={() => saveQty(i)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="—"
                        className="w-20 rounded-lg border px-2 py-1 text-center"
                      />
                    ) : (
                      <span className="font-medium">{i.counted_qty ?? "—"}</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${d === null ? "text-gray-300" : d === 0 ? "text-emerald-600" : d < 0 ? "text-red-600" : "text-amber-600"}`}>
                    {d === null ? "—" : d === 0 ? "✓" : `${d > 0 ? "+" : ""}${d}`}
                  </td>
                  <td className={`px-4 py-2 text-right ${d !== null && d < 0 ? "text-red-600" : "text-gray-600"}`}>
                    {d === null || d === 0 ? "-" : baht(d * Number(i.cost_price))}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ไม่มีรายการ</td></tr>}
          </tbody>
        </table>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + 300)} className="w-full border-t py-3 text-sm text-brand hover:bg-gray-50">
            แสดงเพิ่ม (เหลืออีก {filtered.length - limit} รายการ)
          </button>
        )}
      </div>
    </div>
  );
}
