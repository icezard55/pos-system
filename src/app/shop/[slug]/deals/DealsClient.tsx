"use client";
import Link from "next/link";
import { useState } from "react";

export interface StorefrontDeals {
  codes: {
    code: string;
    discount_type: "percent" | "fixed" | string;
    discount_value: number;
    max_discount_amount: number | null;
    min_order_amount: number | null;
    valid_until: string | null;
    image_url: string | null;
    description: string | null;
    remaining: number | null;
  }[];
  promotions: {
    name: string;
    buy_qty: number;
    get_qty: number;
    get_discount_pct: number;
    valid_until: string | null;
    image_url: string | null;
    product_id: string;
    product_name: string;
    sell_price: number;
  }[];
}

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
function dateTh(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : null;
}
function promoText(p: StorefrontDeals["promotions"][number]) {
  if (Number(p.get_discount_pct) >= 100) return `ซื้อ ${p.buy_qty} แถม ${p.get_qty}`;
  return `ซื้อ ${p.buy_qty} ชิ้น ชิ้นที่ ${p.buy_qty + 1}${p.get_qty > 1 ? `-${p.buy_qty + p.get_qty}` : ""} ลด ${money(p.get_discount_pct)}%`;
}

export default function DealsClient({ slug, deals }: { slug: string; deals: StorefrontDeals }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* บางเบราว์เซอร์ไม่อนุญาต — ลูกค้ายังเห็นโค้ดบนจอ */
    }
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }
  const empty = deals.codes.length === 0 && deals.promotions.length === 0;

  return (
    <div className="pb-24">
      <div className="mb-6">
        <Link href={`/shop/${slug}`} className="text-sm text-sf-muted hover:text-sf-primary">← กลับไปเลือกซื้อสินค้า</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-sf-ink sm:text-3xl">🎁 โปรโมชั่น & โค้ดส่วนลด</h1>
        <p className="mt-1 text-sm text-sf-muted">ดีลพิเศษจากร้าน — คัดลอกโค้ดไปใช้ตอนชำระเงินได้เลย</p>
      </div>

      {empty && (
        <div className="rounded-sf bg-sf-surface p-10 text-center text-sm text-sf-muted shadow-sm">ตอนนี้ยังไม่มีโปรโมชั่น — แวะมาดูใหม่เร็วๆ นี้นะ</div>
      )}

      {deals.codes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-sf-ink">โค้ดส่วนลด</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.codes.map((c) => (
              <div key={c.code} className="flex flex-col overflow-hidden rounded-sf border bg-sf-surface shadow-sm">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.code} className="aspect-[2/1] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[2/1] w-full place-items-center bg-sf-hero text-sf-hero-ink">
                    <div className="text-center">
                      <p className="text-4xl font-extrabold">{c.discount_type === "percent" ? `${money(c.discount_value)}%` : `฿${money(c.discount_value)}`}</p>
                      <p className="text-sm opacity-80">ส่วนลด</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <p className="font-bold text-sf-ink">
                    ลด {c.discount_type === "percent" ? `${money(c.discount_value)}%` : `${money(c.discount_value)} บาท`}
                    {c.discount_type === "percent" && c.max_discount_amount ? ` (สูงสุด ${money(c.max_discount_amount)} บาท)` : ""}
                  </p>
                  {c.description && <p className="mt-1 whitespace-pre-line text-sm text-sf-muted">{c.description}</p>}
                  <ul className="mt-2 space-y-0.5 text-xs text-sf-muted">
                    {Number(c.min_order_amount) > 0 && <li>• ขั้นต่ำ {money(Number(c.min_order_amount))} บาท</li>}
                    {c.valid_until && <li>• ใช้ได้ถึง {dateTh(c.valid_until)}</li>}
                    {c.remaining != null && <li>• เหลือสิทธิ์ {c.remaining} ครั้ง</li>}
                  </ul>
                  <div className="mt-4 flex items-center gap-2 pt-1">
                    <span className="flex-1 rounded-sf-btn border-2 border-dashed border-sf-primary/50 bg-sf-soft px-3 py-2 text-center font-mono text-base font-bold tracking-wider text-sf-primary">{c.code}</span>
                    <button type="button" onClick={() => copy(c.code)} className="rounded-sf-btn bg-sf-primary px-4 py-2.5 text-sm font-semibold text-sf-on-primary hover:bg-sf-primary-dark">
                      {copied === c.code ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {deals.promotions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-sf-ink">โปรโมชั่นสินค้า</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {deals.promotions.map((p, i) => (
              <Link
                key={`${p.product_id}-${i}`}
                href={`/shop/${slug}?q=${encodeURIComponent(p.product_name)}`}
                className="group flex flex-col overflow-hidden rounded-sf border bg-sf-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-square overflow-hidden bg-sf-soft">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-5xl font-extrabold text-sf-primary/30">{p.product_name.trim().charAt(0)}</span>
                  )}
                  <span className="absolute left-2 top-2 rounded-sf-btn bg-sf-accent px-2.5 py-1 text-xs font-bold text-white shadow">{promoText(p)}</span>
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-sm font-bold text-sf-ink">{p.name}</p>
                  <p className="line-clamp-2 text-xs text-sf-muted">{p.product_name}</p>
                  <p className="mt-auto pt-2 text-lg font-extrabold text-sf-price">฿{money(p.sell_price)}</p>
                  {p.valid_until && <p className="text-[11px] text-sf-muted">ถึง {dateTh(p.valid_until)}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
