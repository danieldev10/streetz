import type { Metadata } from "next";
import { supportCategories } from "@/features/support/support-content";
import { SupportContactPage } from "@/features/support/support-contact-page";
import type { SupportRequestCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Contact support | Crushclub",
  description: "Send a private request to the Crushclub support team.",
};

export default async function SupportContactRoute({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedCategory = Array.isArray(query.category)
    ? query.category[0]
    : query.category;
  const initialCategory = supportCategories.some(
    (category) => category.id === requestedCategory,
  )
    ? (requestedCategory as SupportRequestCategory)
    : undefined;

  return <SupportContactPage initialCategory={initialCategory} />;
}
