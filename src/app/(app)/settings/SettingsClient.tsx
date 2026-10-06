"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ShopSettings } from "@/lib/types";
import { STOREFRONT_THEMES, storefrontThemeStyle } from "@/lib/storefrontThemes";

export default function SettingsClient({
  initialSettings,
  shopSlug,
  shopId,
}: {
  initialSettings: ShopSettings | null;
  shopSlug: string | null;
  shopId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [storeUrl, setStoreUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shopSlug && typeof window !== "undefined") {
      setStoreUrl(`${window.location.origin}/shop/${shopSlug}`);
    }
  }, [shopSlug]);

  async function handleCopyStoreUrl() {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API ไม่พร้อมใช้งาน (เช่น เบราว์เซอร์เก่า) - ให้ผู้ใช้คัดลอกเองจากช่องข้อความ
    }
  }
  const [shopName, setShopName] = useState(initialSettings?.shop_name ?? "");
  const [taxId, setTaxId] = useState(initialSettings?.tax_id ?? "");
  const [address, setAddress] = useState(initialSettings?.address ?? "");
  const [phone, setPhone] = useState(initialSettings?.phone ?? "");
  const [webhookUrl, setWebhookUrl] = useState(initialSettings?.low_stock_webhook_url ?? "");
  const [bahtPerPoint, setBahtPerPoint] = useState(String(initialSettings?.baht_per_point ?? 100));
  const [showVat, setShowVat] = useState(initialSettings?.show_vat_on_receipt ?? true);
  const [promptpayId, setPromptpayId] = useState(initialSettings?.promptpay_id ?? "");
  const [contactEmail, setContactEmail] = useState(initialSettings?.contact_email ?? "");
  const [receiptFooter, setReceiptFooter] = useState(initialSettings?.receipt_footer_text ?? "");
  const [receiptQrUrl, setReceiptQrUrl] = useState(initialSettings?.receipt_qr_url ?? "");
  const [qrUploading, setQrUploading] = useState(false);
  const [theme, setTheme] = useState(initialSettings?.storefront_theme ?? "modern");
  const [themeSaving, setThemeSaving] = useState<string | null>(null);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);

  async function chooseTheme(id: string) {
    if (id === theme || themeSaving) return;
    setThemeSaving(id);
    setThemeMsg(null);
    const { error } = await supabase.rpc("set_storefront_theme", { p_theme: id });
    setThemeSaving(null);
    if (error) { setThemeMsg(`เปลี่ยนธีมไม่สำเร็จ: ${error.message}`); return; }
    setTheme(id);
    setThemeMsg("เปลี่ยนธีมแล้ว — เปิดดูหน้าร้านได้เลย");
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setQrUploading(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${shopId}/receipt/qr-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("shop-uploads").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shop-uploads").getPublicUrl(path);
      setReceiptQrUrl(pub.publicUrl);
      setSuccess("อัปโหลดรูป QR แล้ว — กด \"บันทึก\" ด้านล่างเพื่อใช้งาน");
    } catch (err: any) {
      setError(`อัปโหลดรูป QR ไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setQrUploading(false);
    }
  }
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
        p_promptpay_id: promptpayId.trim() || null,
        p_contact_email: contactEmail.trim() || null,
      });
      if (error) throw error;
      const { error: rxErr } = await supabase.rpc("update_receipt_extras", {
        p_footer_text: receiptFooter,
        p_qr_url: receiptQrUrl,
      });
      if (rxErr) throw rxErr;
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

      {storeUrl && (
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-semibold text-gray-800">ลิงก์หน้าร้านค้าออนไลน์</h2>
          <p className="mb-3 text-xs text-gray-400">แชร์ลิงก์นี้ให้ลูกค้าเข้ามาเลือกซื้อสินค้าและสั่งซื้อออนไลน์ได้เลย</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={storeUrl} onFocus={(e) => e.target.select()} className="min-w-[220px] flex-1 rounded-lg border bg-gray-50 px-3 py-2 text-sm" />
            <button type="button" onClick={handleCopyStoreUrl} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
              {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกลิงก์"}
            </button>
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              🔗 เปิดดูหน้าร้าน
            </a>
          </div>
        </div>
      )}

      <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-gray-800">ธีมหน้าร้านค้าออนไลน์</h2>
        <p className="mb-4 text-xs text-gray-400">เลือกหน้าตาร้านค้าออนไลน์ — กดแล้วเปลี่ยนทันที ลูกค้าจะเห็นธีมใหม่เมื่อเปิดหน้าร้าน</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STOREFRONT_THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => chooseTheme(t.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseTheme(t.id); } }}
                className={`cursor-pointer overflow-hidden rounded-xl border-2 text-left transition ${active ? "border-brand ring-2 ring-brand/30" : "border-gray-200 hover:border-gray-400"}`}
              >
                <div style={storefrontThemeStyle(t)} className="bg-sf-bg p-2">
                  <div className={`rounded-sf bg-sf-hero px-2 py-3 text-sf-hero-ink ${t.layout.heroAlign === "center" ? "text-center" : ""}`}>
                    <p className={`text-[11px] font-extrabold ${t.layout.upperTitle ? "uppercase tracking-widest" : ""}`}>ร้านของคุณ</p>
                    <p className="text-[9px] opacity-80">สั่งง่าย จ่ายสะดวก</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`overflow-hidden rounded-sf bg-sf-surface ${t.layout.cardStyle === "border" ? "border" : t.layout.cardStyle === "shadow" ? "shadow-sm" : ""}`}>
                        <div className={`bg-sf-soft ${t.layout.imageAspect === "portrait" ? "h-9" : "h-7"}`} />
                        <div className="flex items-center justify-between p-1">
                          <span className="text-[8px] font-bold text-sf-price">฿99</span>
                          <span className="h-2.5 w-2.5 rounded-sf-btn bg-sf-primary" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                    {t.label}
                    {active && <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white">ใช้อยู่</span>}
                    {themeSaving === t.id && <span className="text-[10px] font-normal text-gray-400">กำลังบันทึก...</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-gray-500">{t.description}</p>
                  {storeUrl && (
                    <a
                      href={`${storeUrl}?theme=${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
                    >
                      ดูตัวอย่าง ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {themeMsg && <p className="mt-3 text-sm text-green-600">{themeMsg}</p>}
      </div>

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
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ข้อความท้ายใบเสร็จ</label>
          <textarea
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={"เช่น ขอบคุณที่ใช้บริการ\nสินค้าซื้อแล้วเปลี่ยนได้ภายใน 7 วัน\nติดตามโปรโมชั่นได้ที่ LINE @yourshop"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">ขึ้นบรรทัดใหม่ได้ ถ้าเว้นว่างจะแสดง &quot;ขอบคุณที่ใช้บริการ&quot;</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">QR code ร้าน (แสดงท้ายใบเสร็จ)</label>
          <div className="flex items-center gap-4">
            {receiptQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptQrUrl} alt="QR ร้าน" className="h-28 w-28 rounded-lg border object-contain p-1" />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-lg border-2 border-dashed text-xs text-gray-400">ยังไม่มี QR</div>
            )}
            <div className="flex flex-col gap-2">
              <label className={`cursor-pointer rounded-lg border px-3 py-1.5 text-center text-sm hover:bg-gray-50 ${qrUploading ? "pointer-events-none opacity-50" : ""}`}>
                {qrUploading ? "กำลังอัปโหลด..." : receiptQrUrl ? "เปลี่ยนรูป QR" : "อัปโหลดรูป QR"}
                <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
              </label>
              {receiptQrUrl && (
                <button type="button" onClick={() => setReceiptQrUrl("")} className="text-sm text-red-500 hover:underline">
                  เอา QR ออก
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-400">เช่น QR LINE OA / Facebook / ร้านค้าออนไลน์ — ใช้รูป PNG หรือ JPG ที่ครอปเฉพาะตัว QR จะคมชัดที่สุด</p>
        </div>

        <h2 className="mt-2 font-semibold text-gray-800">รับชำระเงินผ่าน QR พร้อมเพย์</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เลขพร้อมเพย์ของร้าน</label>
          <input
            value={promptpayId}
            onChange={(e) => setPromptpayId(e.target.value)}
            placeholder="เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขนิติบุคคล 13 หลัก"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            ใส่เบอร์โทรหรือเลขบัตรประชาชนที่ผูกกับพร้อมเพย์ของร้าน ระบบจะใช้เลขนี้สร้าง QR โค้ดยอดเงินให้ตรงกับยอดขายอัตโนมัติ
            ตอนเลือกวิธีชำระเงินแบบ "โอนเงิน" ในหน้า POS ถ้าปล่อยว่างไว้ ปุ่มแสดง QR จะไม่ปรากฏ
          </p>
        </div>

        <h2 className="mt-2 font-semibold text-gray-800">ติดต่อผู้ขาย (หน้าร้านค้าออนไลน์)</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">อีเมลผู้ขาย/แอดมิน</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="example@gmail.com"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            ถ้าใส่ไว้ หน้าร้านค้าออนไลน์ (/shop) จะมีปุ่ม "ติดต่อผู้ขาย" ให้ลูกค้ากดแล้วเปิดแอปอีเมลของลูกค้าเอง
            พร้อมกรอกอีเมลนี้และหัวเรื่องไว้ให้อัตโนมัติ ถ้าปล่อยว่างไว้ ปุ่มจะไม่ปรากฏ
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
