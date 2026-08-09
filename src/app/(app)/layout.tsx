import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavClient from "./NavClient";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen">
      <NavClient
        email={user.email ?? ""}
        fullName={profile?.full_name ?? ""}
        role={(profile?.role as "admin" | "cashier") ?? "cashier"}
      />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
