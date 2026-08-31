"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LoyaltyReward } from "@/lib/types";

export default function LoyaltyRewardsClient({ rewards }: { rewards: LoyaltyReward[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [name, setName] = useState("");
  const [pointsCost, setPointsCost] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [note, setNote] = useState("");

  function resetForm() {
    setName("");
    setPointsCost("");
    setStockQty("");
    setImageUrl("");
    setNote("");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `loyalty-rewards/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("shop-uploads").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shop-uploads").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
    } catch (err: any) {
      setError(`อัปโหลดรูปไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setUploadingImage(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("กรุณาตั้งชื่อของรางวัล");
      return;
    }
    if (!pointsCost || Number(pointsCost) <= 0) {
      setError("กรุณากรอกจำนวนแต้มที่ใช้แลกให้ถูกต้อง");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("loyalty_rewards").insert({
        name: name.trim(),
        points_cost: Number(pointsCost),
        stock_qty: stockQty.trim() ? Number(stockQty) : null,
        image_url: imageUrl || null,
        note: note.trim() || null,
      });
      if (error) throw error;
      resetForm();
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "สร้างของรางวัลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(r: LoyaltyReward) {
    setError(null);
    try {
      const { error } = await supabase.from("loyalty_rewards").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleDelete(r: LoyaltyReward) {
    if (!confirm(`ลบของรางวัล "${r.name}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("loyalty_rewards").delete().eq("id", r.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ของรางวัลแลกแต้มสะสม</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {showAdd ? "ยกเลิก" : "+ เพิ่มของรางวัล"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">รูปของรางวัล (ไม่บังคับ)</label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl text-gray-300">🎁</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">
                  {uploadingImage ? "กำลังอัปโหลด..." : imageUrl ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                  <input ref={imageFileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                </label>
                {imageUrl && (
                  <button type="button" onClick={() => setImageUrl("")} className="text-xs text-red-500 hover:underline">
                    ลบรูป
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">ชื่อของรางวัล</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ส่วนลด 50 บาท, กระเป๋าผ้า"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">แต้มที่ใช้แลก</label>
            <input type="number" min={1} step={1} value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">จำนวนคงเหลือ (ไม่บังคับ)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              placeholder="ไม่จำกัด"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">หมายเหตุ (ไม่บังคับ)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-2"
          >
            {busy ? "กำลังบันทึก..." : "เพิ่มของรางวัล"}
          </button>
          <p className="text-xs text-gray-400 sm:col-span-2">
            พนักงานสามารถกดแลกแต้มให้ลูกค้าได้จากหน้าบันทึกการขาย (ตอนเลือกลูกค้า)
          </p>
        </form>
      )}

      {!showAdd && error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rewards.map((r) => (
          <div key={r.id} className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex aspect-square items-center justify-center bg-gray-100">
              {r.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl text-gray-300">🎁</span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-3">
              <p className="line-clamp-2 min-h-[2.4em] text-sm font-medium text-gray-800">{r.name}</p>
              <p className="mt-1 text-sm font-bold text-brand">{r.points_cost.toLocaleString("th-TH")} แต้ม</p>
              <p className="text-[11px] text-gray-400">
                {r.stock_qty === null ? "ไม่จำกัดจำนวน" : `คงเหลือ ${r.stock_qty} ชิ้น`}
              </p>
              <div className="mt-2">
                {!r.is_active ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">ปิดใช้งาน</span>
                ) : r.stock_qty !== null && r.stock_qty <= 0 ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">ของหมด</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">ใช้งานได้</span>
                )}
              </div>
              <div className="mt-2 flex justify-between">
                <button onClick={() => toggleActive(r)} className="text-xs font-medium text-brand hover:underline">
                  {r.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
                <button onClick={() => handleDelete(r)} className="text-xs font-medium text-red-500 hover:underline">
                  ลบ
                </button>
              </div>
            </div>
          </div>
        ))}
        {rewards.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-gray-400">ยังไม่มีของรางวัล</p>
        )}
      </div>
    </div>
  );
}
