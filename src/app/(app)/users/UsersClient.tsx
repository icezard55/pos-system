"use client";
import { useEffect, useState } from "react";
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
  const [mfa, setMfa] = useState<Record<string, boolean>>({});

  async function loadMfa() {
    const { data } = await supabase.rpc("list_shop_mfa_status");
    setMfa(Object.fromEntries(((data as { user_id: string; mfa_enabled: boolean }[]) ?? []).map((r) => [r.user_id, r.mfa_enabled])));
  }
  useEffect(() => { loadMfa(); /* eslint-disable-next-line */ }, []);

  async function resetMfa(user: AppUser) {
    if (!confirm(`รีเซ็ต 2FA ของ ${user.email ?? user.full_name}? ผู้ใช้จะล็อกอินด้วยรหัสผ่านอย่างเดียว และต้องตั้งค่า 2FA ใหม่เอง`)) return;
    const { error } = await supabase.rpc("admin_reset_user_mfa", { p_user_id: user.id });
    if (error) { setError(error.message); return; }
    loadMfa();
  }

  async function handleRoleChange(user: AppUser, role: Role) {
    if (user.id === currentUserId && role !== "admin") {
      if (!confirm("คุณกำลังลดสิทธิ์ตัวเอง จะไม่สามารถเข้าหน้านี้ได้อีก ยืนยันหรือไม่?")) return;
    }
    setError(null);
    setUpdatingId(user.id);
    try {
      const { error } = await supabase.rpc("admin_update_role", { p_user_id: user.id, p_role: role });
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
              <th className="px-4 py-3">2FA</th>
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
                <td className="px-4 py-3">
                  {mfa[u.id] ? (
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">เปิดอยู่ ✓</span>
                      <button onClick={() => resetMfa(u)} className="text-xs text-red-600 hover:underline">รีเซ็ต</button>
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">ยังไม่เปิด</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ไม่มีผู้ใช้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
