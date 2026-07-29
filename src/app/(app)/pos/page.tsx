import { createClient } from "@/lib/supabase/server";
import PosClient from "./PosClient";

export default async function PosPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("name");

  return <PosClient products={products ?? []} />;
}
