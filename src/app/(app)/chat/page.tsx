import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: conversations } = await supabase
    .from("chat_conversations")
    .select("id, customer_name, customer_phone, last_message_at, last_message_preview, unread_admin, unread_customer, created_at")
    .order("last_message_at", { ascending: false })
    .limit(200);

  return <ChatClient initialConversations={(conversations as any) ?? []} />;
}
