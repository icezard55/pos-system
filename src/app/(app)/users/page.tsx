import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: users, error } = await supabase.rpc("admin_list_users");

  return <UsersClient initialUsers={users ?? []} currentUserId={user!.id} loadError={error?.message ?? null} />;
}
