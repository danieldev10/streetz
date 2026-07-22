import type { Metadata } from "next";
import { RafflePageClient } from "@/features/raffles/raffle-page-client";
import { publicApiRequest } from "@/lib/server-api";
import type { StreetzRaffle } from "@/lib/types";

type RafflePageProps = { params: Promise<{ raffleId: string }> };

export const revalidate = 30;

export async function generateMetadata({ params }: RafflePageProps): Promise<Metadata> {
  const { raffleId } = await params;
  const raffle = await publicApiRequest<StreetzRaffle>(`/public/raffles/${raffleId}`, 30);

  if (!raffle) return { title: "Raffle unavailable | crushclub" };

  const title = raffle.raffle.prize.title;
  const description = raffle.raffle.prize.description || `Enter the ${title} raffle on crushclub.`;
  const image = raffle.raffle.prize.image || raffle.coverImage;
  return {
    title: `${title} raffle | crushclub`,
    description,
    alternates: { canonical: `/events/raffles/${raffle.id}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(image ? { images: [{ url: image, alt: title }] } : {})
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {})
    }
  };
}

export default async function RaffleDetailPage({ params }: RafflePageProps) {
  const { raffleId } = await params;
  const raffle = await publicApiRequest<StreetzRaffle>(`/public/raffles/${raffleId}`, 30);

  return <RafflePageClient raffleId={raffleId} initialRaffle={raffle} />;
}
