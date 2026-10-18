import ShareClient from "./ShareClient";

export const metadata = { title: "แดชบอร์ด", robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareClient token={token} />;
}
