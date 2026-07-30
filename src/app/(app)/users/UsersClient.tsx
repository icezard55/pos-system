"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppUser, Role } from "@/lib/types";

export default function UsersClient({
  initialUsers,
  currentUserId,
  loadError,
}: {
  initialUsers: AppUser[];
  currentUserId: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError);

  async function handleRoleChange(user: AppUser, role: Role) {
    if (user.id === currentUserId && role !== "admin") {
      if (!confirm("คุณกำลังลดสิทธิ์ตัวเอง จะไม่สามารถเข้าหน้านี้ได้อีก ยืนยันหรือไม่?")) return;
    }
    setError(null);
    setUpdatingId(user.id);
    try {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เปลี่ยนสิทธิ์ไม่สำเร็จ");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">จัดการผู้ใช้</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">อีเมล</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">สมัครเมื่อ</th>
              <th className="px-4 py-3">สิทธิ์</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {u.email ?? "-"} {u.id === currentUserId && <span className="text-xs text-gray-400">(คุณ)</span>}
                </td>
                <td className="px-4 py-3">{u.full_name ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={updatingId === u.id}
                    onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                    className="rounded-lg border px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="cashier">พนักงานขาย</option>
                    <option value="admin">ผู้ดูแลระบบ</option>
                  </select>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">ไม่มีผู้ใช้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
