"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";

export default function SuppliersClient({ initialSuppliers, shopId }: { initialSuppliers: Supplier[]; shopId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ shop_id: shopId, name: name.trim(), phone: phone || null, address: address || null, note: note || null })
        .select()
        .single();
      if (error) throw error;
      setSuppliers((prev) => [data, ...prev]);
      setName("");
      setPhone("");
      setAddress("");
      setNote("");
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มผู้จัดจำหน่ายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบผู้จัดจำหน่ายนี้?")) return;
    setError(null);
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ (อาจมีใบสั่งซื้อผูกอยู่)");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ผู้จัดจำหน่าย</h1>
        <button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          {showAdd ? "ยกเลิก" : "+ เพิ่มผู้จัดจำหน่าย"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อผู้จัดจำหน่าย *" required className="rounded-lg border px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="เบอร์โทร" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่" className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
          <button type="submit" disabled={busy} className="sm:col-span-2 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">เบอร์โทร</th>
              <th className="px-4 py-3">ที่อยู่</th>
              <th className="px-4 py-3">หมายเหตุ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500">{s.address ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500">{s.note ?? "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ยังไม่มีผู้จัดจำหน่าย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
