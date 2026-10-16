"use client";
import Link from "next/link";
import { useState } from "react";
import ReceiptClient from "../[id]/ReceiptClient";
import type { Sale, SaleItem, SalePayment, ShopSettings } from "@/lib/types";

export default function BatchClient({
  sales,
  items,
  payments,
  shopSettings,
}: {
  sales: Sale[];
  items: SaleItem[];
  payments: SalePayment[];
  shopSettings: ShopSettings | null;
}) {
  const [paper, setPaper] = useState<"thermal" | "a5">("thermal");
  const w = paper === "a5" ? "128mm" : "80mm";
  const css =
    "@media print { .batch-root, .batch-root * { visibility: visible !important; } .batch-root { position: absolute; left: 0; top: 0; width: " + w + "; } " +
    ".batch-root .receipt-card { position: static !important; width: " + w + " !important; max-width: " + w + " !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: " + (paper === "a5" ? "0" : "4mm") + " !important; font-size: " + (paper === "a5" ? "14px" : "11px") + " !important; } " +
    (paper === "a5"
      ? "@page { size: A5 portrait; margin: 10mm; } html, body { width: auto !important; } }"
      : "@page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; } }");

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="no-print mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow">
        <div className="text-sm">
          พิมพ์ใบเสร็จ <b>{sales.length}</b> ใบ
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setPaper("thermal")} className={`rounded-full px-3 py-1 font-medium ${paper === "thermal" ? "bg-brand text-white" : "border text-gray-600"}`}>80mm</button>
          <button onClick={() => setPaper("a5")} className={`rounded-full px-3 py-1 font-medium ${paper === "a5" ? "bg-brand text-white" : "border text-gray-600"}`}>A5</button>
          <button onClick={() => window.print()} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">🖨️ พิมพ์ทั้งหมด</button>
          <Link href="/sales" className="rounded-lg border px-3 py-1.5 text-sm">← กลับ</Link>
        </div>
      </div>
      <div className="batch-root space-y-4 print:space-y-0">
        {sales.map((s) => (
          <ReceiptClient
            key={s.id}
            embedded
            forcedPaper={paper}
            sale={s}
            items={items.filter((i) => i.sale_id === s.id)}
            payments={payments.filter((p) => p.sale_id === s.id)}
            shopSettings={shopSettings}
          />
        ))}
      </div>
    </div>
  );
}
