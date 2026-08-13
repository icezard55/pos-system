import TrackClient from "./TrackClient";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order_no?: string; phone?: string }>;
}) {
  const { order_no, phone } = await searchParams;
  return <TrackClient initialOrderNo={order_no ?? ""} initialPhone={phone ?? ""} />;
}
