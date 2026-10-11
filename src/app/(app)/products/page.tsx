import { redirect } from "next/navigation";
import { fetchAllRows } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, shop_id").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const products = await fetchAllRows((f, t) => supabase.from("products").select("*").order("name").order("id").range(f, t));
  return <ProductsClient initialProducts={products ?? []} shopId={profile?.shop_id ?? ""} />;
}
