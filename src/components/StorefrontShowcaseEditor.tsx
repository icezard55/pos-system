"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ตั้งค่าการแสดงโค้ดส่วนลด/โปรโมชั่นในหน้า "โปรโมชั่น & โค้ดส่วนลด" ของร้านค้าออนไลน์ (รูป + คำอธิบาย + เปิด/ปิดแสดง)
export default function StorefrontShowcaseEditor({
  kind,
  id,
  shopId,
  imageUrl,
  showOnStorefront,
  description,
}: {
  kind: "code" | "promotion";
  id: string;
  shopId: string;
  imageUrl: string | null;
  showOnStorefront?: boolean;
  description?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState(imageUrl ?? "");
  const [show, setShow] = useState(!!showOnStorefront);
  const [desc, setDesc] = useState(description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCode = kind === "code";

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${shopId}/deals/${kind}-${id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("shop-uploads").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (error) throw error;
      setImg(supabase.storage.from("shop-uploads").getPublicUrl(path).data.publicUrl);
    } catch (ex: any) {
      setErr(`อัปโหลดรูปไม่สำเร็จ: ${ex.message ?? ex}`);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const patch: Record<string, unknown> = { image_url: img || null };
      if (isCode) {
        patch.show_on_storefront = show;
        patch.public_description = desc.trim() || null;
      }
      const { error } = await supabase.from(isCode ? "discount_codes" : "promotions").update(patch).eq("id", id);
      if (error) throw error;
      setOpen(false);
      router.refresh();
    } catch (ex: any) {
      setErr(ex.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-gray-600 hover:text-brand hover:underline">
        {isCode ? (showOnStorefront ? "🛍️ โชว์หน้าร้าน" : "🛍️ หน้าร้าน") : imageUrl ? "🖼️ รูปหน้าร้าน" : "🖼️ ใส่รูป"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-left" onClick={() => !busy && setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-bold">แสดงในหน้าร้านค้าออนไลน์</h3>
            <p className="mb-4 text-xs text-gray-500">
              {isCode ? "โค้ดที่เปิด \"แสดงในหน้าร้าน\" จะขึ้นในหน้า โปรโมชั่น & โค้ดส่วนลด ให้ลูกค้าคัดลอกไปใช้ได้" : "โปรโมชั่นที่เปิดใช้งานจะขึ้นในหน้า โปรโมชั่น & โค้ดส่วนลด อัตโนมัติ (ถ้าไม่ใส่รูป จะใช้รูปสินค้าแทน)"}
            </p>
            {isCode && (
              <label className="mb-4 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4" />
                แสดงโค้ดนี้ในหน้าร้านค้าออนไลน์
              </label>
            )}
            <div className="mb-4">
              <p className="mb-1 text-sm font-medium text-gray-700">รูปภาพ (แนะนำแนวนอน 2:1)</p>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="mb-2 aspect-[2/1] w-full rounded-lg border object-cover" />
              ) : (
                <div className="mb-2 grid aspect-[2/1] w-full place-items-center rounded-lg border-2 border-dashed text-xs text-gray-400">ยังไม่มีรูป</div>
              )}
              <div className="flex gap-3">
                <label className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                  {img ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                  <input type="file" accept="image/*" className="hidden" onChange={upload} />
                </label>
                {img && <button type="button" onClick={() => setImg("")} className="text-sm text-red-500 hover:underline">เอารูปออก</button>}
              </div>
            </div>
            {isCode && (
              <div className="mb-4">
                <p className="mb-1 text-sm font-medium text-gray-700">คำอธิบายสำหรับลูกค้า</p>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={300} placeholder="เช่น ลด 10% ทุกออเดอร์ สำหรับลูกค้าใหม่" className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            )}
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button>
              <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
