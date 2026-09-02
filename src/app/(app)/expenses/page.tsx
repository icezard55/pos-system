import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, shop_id").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: recurring } = await supabase
    .from("recurring_expenses")
    .select("*")
    .order("day_of_month", { ascending: true });

  return <ExpensesClient initialExpenses={expenses ?? []} initialRecurring={recurring ?? []} shopId={profile?.shop_id ?? ""} />;
}
