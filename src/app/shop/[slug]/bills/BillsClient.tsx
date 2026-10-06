"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Bill {
  kind: "sale" | "online";
  ref_no: string;
  created_at: string;
  channel: string;
  platform_name: string | null;
  total: number;
  status: string;
  tracking_number: string | null;
  items: string | null;
  sale_id: string | null;
}

const CHANNEL: Record<string, string> = {
  store: "ซื้อที่หน้าร้าน",
  shopee: "Shopee",
  lazada: "Lazada",
  tiktok: "TikTok Shop",
  thaimart: "ThaiMart",
  online_store: "ร้านค้าออนไลน์",
  other: "ช่องทางอื่น",
};

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "ชำระแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  unpaid: { label: "รอชำระ/รอโอนจากแพลตฟอร์ม", cls: "bg-amber-100 text-amber-700" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-700" },
  returned: { label: "ตีกลับ/คืนสินค้า", cls: "bg-red-100 text-red-700" },
  void: { label: "ยกเลิก", cls: "bg-red-100 text-red-700" },
  pending_payment: { label: "รอชำระเงิน", cls: "bg-amber-100 text-amber-700" },
  pending_confirmation: { label: "รอร้านยืนยัน", cls: "bg-amber-100 text-amber-700" },
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-sky-100 text-sky-700" },
  packed: { label: "แพ็กสินค้าแล้ว", cls: "bg-sky-100 text-sky-700" },
  shipped: { label: "จัดส่งแล้ว", cls: "bg-sky-100 text-sky-700" },
  completed: { label: "สำเร็จ", cls: "bg-emerald-100 text-emerald-700" },
};

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillsClient({ shopId, slug }: { shopId: string; slug: string }) {
  const supabase = createClient();
  const [mode, setMode] = useState<"name" | "ref">("name");
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[] | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setBills(null);
    try {
      const { data, error } = await supabase.rpc(
        "lookup_customer_bills",
        mode === "name" ? { p_shop_id: shopId, p_name: name, p_last4: last4, p_ref: null } : { p_shop_id: shopId, p_name: null, p_last4: null, p_ref: ref }
      );
      if (error) throw error;
      setBills((data ?? []) as Bill[]);
    } catch (ex: any) {
      setErr(ex.message ?? "ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const tab = (m: "name" | "ref", label: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); setErr(null); setBills(null); }}
      className={`flex-1 rounded-sf-btn px-3 py-2 text-sm font-semibold transition ${mode === m ? "bg-sf-primary text-sf-on-primary" : "text-sf-muted hover:text-sf-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <Link href={`/shop/${slug}`} className="text-sm text-sf-muted hover:text-sf-primary">← กลับไปเลือกซื้อสินค้า</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-sf-ink">🧾 ค้นหาบิลของฉัน</h1>
      <p className="mt-1 text-sm text-sf-muted">ดูประวัติการซื้อ ทั้งซื้อที่หน้าร้าน ร้านค้าออนไลน์ และแพลตฟอร์ม (Shopee / TikTok / Lazada ฯลฯ)</p>

      <form onSubmit={handleSearch} className="mt-5 space-y-3 rounded-sf border bg-sf-surface p-5 shadow-sm">
        <div className="flex gap-1 rounded-sf-btn bg-sf-soft p-1">
          {tab("name", "ชื่อ + เลขท้ายเบอร์")}
          {tab("ref", "เลขออเดอร์ / เลขพัสดุ")}
        </div>
        {mode === "name" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <label className="mb-1 block text-xs font-medium text-sf-muted">ชื่อ (ตามที่ให้ไว้กับร้าน)</label>
              <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย" className="w-full rounded-lg border px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-sf-muted">เลขท้ายเบอร์โทร 4 ตัว</label>
              <input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="1234" className="w-full rounded-lg border px-3 py-2.5 text-center text-sm tracking-[0.3em]" />
            </div>
            <p className="text-xs text-sf-muted sm:col-span-2">ใช้ได้กับบิลที่ซื้อหน้าร้านแบบลงชื่อสมาชิก และคำสั่งซื้อจากร้านค้าออนไลน์นี้</p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">เลขคำสั่งซื้อ หรือ เลขพัสดุ</label>
            <input required minLength={5} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="เช่น 586264875617911955 หรือ JTTH205743056853" className="w-full rounded-lg border px-3 py-2.5 font-mono text-sm" />
            <p className="mt-1 text-xs text-sf-muted">สำหรับคำสั่งซื้อจาก Shopee / TikTok / Lazada ฯลฯ — ดูเลขได้ในแอปที่สั่งซื้อ</p>
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-sf-btn bg-sf-primary py-3 text-sm font-semibold text-sf-on-primary hover:bg-sf-primary-dark disabled:opacity-50">
          {loading ? "กำลังค้นหา..." : "ค้นหาบิล"}
        </button>
      </form>

      {bills && (
        <div className="mt-6 space-y-3">
          {bills.length === 0 ? (
            <p className="rounded-sf bg-sf-surface p-6 text-center text-sm text-sf-muted shadow-sm">ไม่พบบิล — ตรวจสอบชื่อ/เลขอีกครั้ง หรือทักแชทสอบถามร้านได้เลย</p>
          ) : (
            <>
              <p className="text-sm text-sf-muted">พบ {bills.length} บิล</p>
              {bills.map((b) => {
                const st = STATUS[b.status] ?? { label: b.status, cls: "bg-sf-soft text-sf-ink" };
                return (
                  <div key={`${b.kind}-${b.ref_no}`} className="rounded-sf border bg-sf-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-bold text-sf-ink">{b.ref_no}</p>
                        <p className="text-xs text-sf-muted">
                          {new Date(b.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · {b.channel === "other" && b.platform_name ? b.platform_name : CHANNEL[b.channel] ?? b.channel}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                    {b.items && <p className="mt-2 text-sm text-sf-ink">{b.items}</p>}
                    <div className="mt-2 flex items-end justify-between gap-2 border-t pt-2">
                      <span className="text-xs text-sf-muted">{b.tracking_number ? `เลขพัสดุ ${b.tracking_number}` : ""}</span>
                      <span className="text-lg font-extrabold text-sf-price">฿{money(b.total)}</span>
                    </div>
                    {b.sale_id ? (
                      <Link
                        href={`/shop/${slug}/receipt/${b.sale_id}?download=1`}
                        className="mt-3 block w-full rounded-sf-btn bg-sf-primary py-2.5 text-center text-sm font-semibold text-sf-on-primary hover:bg-sf-primary-dark"
                      >
                        📄 ดาวน์โหลดใบเสร็จ (PDF)
                      </Link>
                    ) : (
                      <p className="mt-3 text-center text-xs text-sf-muted">ใบเสร็จจะดาวน์โหลดได้เมื่อร้านยืนยันออเดอร์แล้ว</p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
