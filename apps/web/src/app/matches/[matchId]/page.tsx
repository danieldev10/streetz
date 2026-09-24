import { redirect } from "next/navigation";

export default async function LegacyMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  redirect(`/messages/${matchId}`);
}
