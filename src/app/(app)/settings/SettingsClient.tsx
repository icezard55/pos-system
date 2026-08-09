"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ShopSettings } from "@/lib/types";

export default function SettingsClient({ initialSettings }: { initialSettings: ShopSettings | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [shopName, setShopName] = useState(initialSettings?.shop_name ?? "");
  const [taxId, setTaxId] = useState(initialSettings?.tax_id ?? "");
  const [address, setAddress] = useState(initialSettings?.address ?? "");
  const [phone, setPhone] = useState(initialSettings?.phone ?? "");
  const [webhookUrl, setWebhookUrl] = useState(initialSettings?.low_stock_webhook_url ?? "");
  const [bahtPerPoint, setBahtPerPoint] = useState(String(initialSettings?.baht_per_point ?? 100));
  const [showVat, setShowVat] = useState(initialSettings?.show_vat_on_receipt ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lowStockPreview, setLowStockPreview] = useState<{ name: string; stock_qty: number }[] | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc("update_shop_settings", {
        p_shop_name: shopName,
        p_tax_id: taxId || null,
        p_address: address || null,
        p_phone: phone || null,
        p_low_stock_webhook_url: webhookUrl || null,
        p_baht_per_point: Number(bahtPerPoint) || 100,
        p_show_vat_on_receipt: showVat,
      });
      if (error) throw error;
      setSuccess("บันทึกข้อมูลร้านสำเร็จ");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckLowStock() {
    setChecking(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("check_low_stock");
      if (error) throw error;
      setLowStockPreview(data ?? []);
    } catch (err: any) {
      setError(err.message ?? "ตรวจสอบไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">ตั้งค่าร้านค้า</h1>

      <form onSubmit={handleSave} className="mb-8 grid gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800">ข้อมูลร้าน (ใช้แสดงบนใบเสร็จ/ใบกำกับภาษี)</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อร้าน</label>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เลขผู้เสียภาษีของร้าน</label>
          <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ที่อยู่ร้าน</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เบอร์โทร</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>

        <h2 className="mt-2 font-semibold text-gray-800">แต้มสะสมลูกค้า</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ยอดซื้อกี่บาท ได้ 1 แต้ม</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step="0.01"
              value={bahtPerPoint}
              onChange={(e) => setBahtPerPoint(e.target.value)}
              className="w-32 rounded-lg border px-3 py-2 text-sm"
            />
            <span className="text-sm text-gray-500">บาท / 1 แต้ม</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            ค่าเริ่มต้นคือ 100 บาทต่อ 1 แต้ม (ซื้อครบ 100 บาทได้ 1 แต้ม) เปลี่ยนได้ตามต้องการ เช่น ใส่ 50
            หมายถึงซื้อครบ 50 บาทได้ 1 แต้ม การให้แต้มจะมีผลเฉพาะบิลที่ผูกกับลูกค้า/สมาชิกเท่านั้น
          </p>
        </div>

        <h2 className="mt-2 font-semibold text-gray-800">ใบเสร็จ</h2>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={showVat} onChange={(e) => setShowVat(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            แสดงรายละเอียด VAT บนใบเสร็จ
          </label>
          <p className="mt-1 text-xs text-gray-400">
            ถ้าปิด ใบเสร็จจะไม่แสดงบรรทัดแยก VAT 7% ให้ลูกค้าเห็น (แต่ระบบยังคำนวณ VAT เก็บไว้ในฐานข้อมูลตามปกติ)
          </p>
        </div>

        <h2 className="mt-2 font-semibold text-gray-800">แจ้งเตือนสต๊อกต่ำ</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Webhook URL</label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/... หรือ URL ของ n8n/Make/Zapier"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            ระบบจะตรวจสต๊อกต่ำและส่ง JSON ไปที่ URL นี้อัตโนมัติทุกวันเวลา 08:00 น.
            รองรับ webhook แบบ Slack/Discord/n8n/Make โดยตรง หากต้องการแจ้งเตือนผ่าน LINE
            แนะนำให้ตั้ง n8n หรือ Make เป็นตัวกลางรับ webhook นี้แล้วส่งต่อเข้า LINE Notify
            (ระบบนี้ไม่ได้เชื่อมต่อ LINE โดยตรง เพื่อความปลอดภัยของโทเค็นบัญชีของคุณ)
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </form>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">ตรวจสอบสต๊อกต่ำตอนนี้</h2>
          <button
            onClick={handleCheckLowStock}
            disabled={checking}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {checking ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
          </button>
        </div>
        {lowStockPreview && (
          lowStockPreview.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อในขณะนี้</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lowStockPreview.map((p, i) => (
                <li key={i} className="flex justify-between border-b py-1 last:border-0">
                  <span>{p.name}</span>
                  <span className="text-red-600">เหลือ {p.stock_qty}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
