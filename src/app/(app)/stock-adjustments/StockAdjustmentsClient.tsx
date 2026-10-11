"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  stock_qty: number;
  cost_price: number | null;
}

interface AdjustRequest {
  id: string;
  product_id: string;
  product_name: string;
  change_qty: number;
  reason_code: string;
  note: string | null;
  cost_value: number;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decide_note: string | null;
}

interface Movement {
  id: string;
  change_qty: number;
  reason: string | null;
  note: string | null;
  created_at: string;
  products: { name: string } | { name: string }[] | null;
}

export const ADJUST_REASONS: { code: string; label: string; dir: "in" | "out" | "both" }[] = [
  { code: "damaged", label: "ชำรุดเสียหาย", dir: "out" },
  { code: "expired", label: "หมดอายุ/เสื่อมสภาพ", dir: "out" },
  { code: "lost", label: "สูญหาย/หาไม่พบ", dir: "out" },
  { code: "sample", label: "สินค้าตัวอย่าง/แจกฟรี", dir: "out" },
  { code: "found", label: "พบสินค้าเกิน", dir: "in" },
  { code: "restock", label: "รับสินค้าเข้า (ไม่ผ่านใบสั่งซื้อ)", dir: "in" },
  { code: "correction", label: "แก้ไขที่บันทึกผิด", dir: "both" },
  { code: "other", label: "อื่นๆ (ต้องกรอกหมายเหตุ)", dir: "both" },
];
const REASON_LABEL: Record<string, string> = Object.fromEntries(ADJUST_REASONS.map((r) => [r.code, r.label]));

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "บันทึกแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "ไม่อนุมัติ", cls: "bg-gray-200 text-gray-600" },
};

const MOVE_REASON: Record<string, string> = { adjustment: "ปรับสต๊อก", count: "ตรวจนับ", restock: "รับสินค้าเข้า" };

function productLabel(p: ProductOption | undefined): string {
  if (!p) return "";
  return p.sku ? `[${p.sku}] ${p.name}` : p.name;
}

function baht(n: number) {
  return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProductAutocomplete({ products, value, onSelect }: { products: ProductOption[]; value: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState(() => productLabel(products.find((p) => p.id === value)));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(productLabel(products.find((p) => p.id === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => `${p.sku ?? ""} ${p.name}`.toLowerCase().includes(q)).slice(0, 30);
  }, [products, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์รหัสหรือชื่อสินค้าเพื่อค้นหา..."
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg">
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
              <span className="ml-1 text-xs text-gray-400">(คงเหลือ {p.stock_qty} {p.unit})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StockAdjustmentsClient({
  products,
  requests,
  names,
  isAdmin,
  userId,
  movements,
}: {
  products: ProductOption[];
  requests: AdjustRequest[];
  names: Record<string, string>;
  isAdmin: boolean;
  userId: string;
  movements: Movement[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [productId, setProductId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [view, setView] = useState<"requests" | "movements">("requests");
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);
  const reasonOptions = ADJUST_REASONS.filter((r) => r.dir === "both" || r.dir === direction);

  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const stats = useMemo(() => {
    const thisYear = requests.filter((r) => r.status === "approved" && new Date(r.decided_at ?? r.requested_at).getTime() >= yearStart);
    const minus = thisYear.filter((r) => r.change_qty < 0).reduce((t, r) => t + Math.abs(Number(r.cost_value)), 0);
    const plus = thisYear.filter((r) => r.change_qty > 0).reduce((t, r) => t + Number(r.cost_value), 0);
    const pending = requests.filter((r) => r.status === "pending");
    const pendingValue = pending.reduce((t, r) => t + Number(r.cost_value), 0);
    const byReason: Record<string, number> = {};
    for (const r of thisYear.filter((x) => x.change_qty < 0)) byReason[r.reason_code] = (byReason[r.reason_code] ?? 0) + Math.abs(Number(r.cost_value));
    const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
    return { minus, plus, pending: pending.length, pendingValue, approvedCount: thisYear.length, topReason };
  }, [requests, yearStart]);

  const shown = requests.filter((r) => tab === "all" || r.status === tab);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const qtyNum = Number(qty);
    if (!productId) return setError("กรุณาเลือกสินค้า");
    if (!qtyNum || qtyNum <= 0) return setError("กรุณาระบุจำนวนที่มากกว่า 0");
    if (!reason) return setError("กรุณาเลือกเหตุผลการปรับสต๊อก");
    if (reason === "other" && !note.trim()) return setError('เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุด้วย');
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("request_stock_adjustment", {
        p_product_id: productId,
        p_change_qty: direction === "in" ? qtyNum : -qtyNum,
        p_reason_code: reason,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      setSuccess(data === "approved" ? "ปรับสต๊อกเรียบร้อยแล้ว" : "ส่งคำขอปรับสต๊อกแล้ว รอผู้ดูแลระบบอนุมัติ");
      setQty("");
      setNote("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ปรับสต๊อกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function decide(r: AdjustRequest, approve: boolean) {
    let decideNote: string | null = null;
    if (!approve) {
      decideNote = prompt(`เหตุผลที่ไม่อนุมัติคำขอ "${r.product_name}" (ไม่บังคับ)`) ;
      if (decideNote === null) return;
    } else if (!confirm(`อนุมัติปรับสต๊อก "${r.product_name}" ${r.change_qty > 0 ? "+" : ""}${r.change_qty} ใช่หรือไม่?`)) {
      return;
    }
    setBusyId(r.id);
    const { error } = await supabase.rpc("decide_stock_adjustment", { p_id: r.id, p_approve: approve, p_note: decideNote || null });
    setBusyId(null);
    if (error) return alert(error.message);
    router.refresh();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ปรับสต๊อกสินค้า</h1>
      <p className="mb-6 text-sm text-gray-500">
        ปรับเพิ่ม/ลดสต๊อกพร้อมเหตุผล — {isAdmin ? "แอดมินปรับแล้วมีผลทันที คำขอจากพนักงานต้องอนุมัติก่อน" : "คำขอของคุณจะมีผลหลังผู้ดูแลระบบอนุมัติ"}
      </p>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">รออนุมัติ</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.pending} <span className="text-sm font-normal text-gray-400">ใบ</span></p>
          <p className="text-[11px] text-gray-400">ผลกระทบมูลค่า ฿{baht(stats.pendingValue)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">มูลค่าปรับลด (ปีนี้)</p>
          <p className="mt-1 text-2xl font-bold text-red-600">฿{baht(stats.minus)}</p>
          <p className="text-[11px] text-gray-400">{stats.topReason ? `มากสุด: ${REASON_LABEL[stats.topReason[0]]}` : "ยังไม่มี"}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">มูลค่าปรับเพิ่ม (ปีนี้)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">฿{baht(stats.plus)}</p>
          <p className="text-[11px] text-gray-400">ราคาทุน</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">บันทึกแล้ว (ปีนี้)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{stats.approvedCount} <span className="text-sm font-normal text-gray-400">ใบ</span></p>
          <p className="text-[11px] text-gray-400">สุทธิ ฿{baht(stats.plus - stats.minus)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 grid gap-4 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">สินค้า</label>
          <ProductAutocomplete products={products} value={productId} onSelect={setProductId} />
          {selectedProduct && (
            <p className="mt-1 text-xs text-gray-500">คงเหลือในระบบ {selectedProduct.stock_qty} {selectedProduct.unit} · ทุน ฿{baht(Number(selectedProduct.cost_price ?? 0))}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทการปรับ</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setDirection("in"); setReason(""); }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direction === "in" ? "border-green-600 bg-green-50 text-green-700" : "text-gray-500"}`}>
              เพิ่มสต๊อก (+)
            </button>
            <button type="button" onClick={() => { setDirection("out"); setReason(""); }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direction === "out" ? "border-red-600 bg-red-50 text-red-700" : "text-gray-500"}`}>
              ลดสต๊อก (-)
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผล *</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">— เลือกเหตุผล —</option>
            {reasonOptions.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">จำนวน{selectedProduct ? ` (${selectedProduct.unit})` : ""}</label>
          <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required />
          {selectedProduct && Number(qty) > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              หลังปรับจะเหลือ {Number(selectedProduct.stock_qty) + (direction === "in" ? Number(qty) : -Number(qty))} {selectedProduct.unit}
              {" · "}มูลค่า {direction === "in" ? "+" : "-"}฿{baht(Number(qty) * Number(selectedProduct.cost_price ?? 0))}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ {reason === "other" ? "*" : "(ไม่บังคับ)"}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม เช่น เปียกน้ำ 2 ตัว, ลูกค้าคืนของ"
            className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {success && <p className="text-sm text-green-600 sm:col-span-2">{success}</p>}

        <div className="sm:col-span-2">
          <button type="submit" disabled={loading} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {loading ? "กำลังบันทึก..." : isAdmin ? "บันทึกการปรับสต๊อก" : "ส่งคำขอปรับสต๊อก"}
          </button>
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-sm">
          <button onClick={() => setView("requests")} className={`rounded-md px-3 py-1.5 ${view === "requests" ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}>ใบปรับสต๊อก</button>
          {isAdmin && (
            <button onClick={() => setView("movements")} className={`rounded-md px-3 py-1.5 ${view === "movements" ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}>ความเคลื่อนไหวสต๊อก</button>
          )}
        </div>
        {view === "requests" && (
          <div className="flex flex-wrap gap-1 text-xs">
            {(["all", "pending", "approved", "rejected"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 ${tab === t ? "border-brand bg-brand text-white" : "bg-white text-gray-600"}`}>
                {t === "all" ? "ทั้งหมด" : STATUS_BADGE[t].label}
                <span className="ml-1 opacity-70">{t === "all" ? requests.length : requests.filter((r) => r.status === t).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "requests" ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3">เหตุผล</th>
                <th className="px-4 py-3 text-right">จำนวน</th>
                <th className="px-4 py-3 text-right">มูลค่า (ทุน)</th>
                <th className="px-4 py-3">ผู้ขอ</th>
                <th className="px-4 py-3">สถานะ</th>
                {isAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(r.requested_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3">
                    {r.product_name}
                    {r.note && <p className="text-xs text-gray-400">{r.note}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{REASON_LABEL[r.reason_code] ?? r.reason_code}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.change_qty >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {r.change_qty >= 0 ? "+" : ""}{r.change_qty}
                  </td>
                  <td className={`px-4 py-3 text-right ${r.cost_value >= 0 ? "text-gray-600" : "text-red-600"}`}>{baht(Number(r.cost_value))}</td>
                  <td className="px-4 py-3 text-gray-500">{r.requested_by ? names[r.requested_by] ?? "-" : "-"}{r.requested_by === userId && <span className="text-xs text-gray-400"> (คุณ)</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status].cls}`}>{STATUS_BADGE[r.status].label}</span>
                    {r.decide_note && <p className="mt-0.5 text-[11px] text-gray-400">{r.decide_note}</p>}
                  </td>
                  {isAdmin && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {r.status === "pending" && (
                        <>
                          <button disabled={busyId === r.id} onClick={() => decide(r, true)} className="mr-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">อนุมัติ</button>
                          <button disabled={busyId === r.id} onClick={() => decide(r, false)} className="rounded-lg border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">ไม่อนุมัติ</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-gray-400">ยังไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3 text-right">จำนวนที่เปลี่ยน</th>
                <th className="px-4 py-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(m.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3">{!m.products ? "-" : Array.isArray(m.products) ? m.products[0]?.name ?? "-" : m.products.name}</td>
                  <td className="px-4 py-3 text-gray-500">{MOVE_REASON[m.reason ?? ""] ?? m.reason ?? "-"}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${m.change_qty >= 0 ? "text-green-600" : "text-red-600"}`}>{m.change_qty >= 0 ? "+" : ""}{m.change_qty}</td>
                  <td className="px-4 py-3 text-gray-500">{m.note ?? "-"}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ยังไม่มีประวัติ</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
