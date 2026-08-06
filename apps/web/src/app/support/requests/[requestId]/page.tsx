import type { Metadata } from "next";
import { GuestSupportRequestClient } from "@/features/support/guest-support-request-client";
import { MemberSupportRequestClient } from "@/features/support/member-support-request-client";

export const metadata: Metadata = {
  title: "Support request | Crushclub",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false
  }
};

export default async function SupportRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  if (token !== undefined) {
    return <GuestSupportRequestClient requestId={requestId} token={token} />;
  }

  return <MemberSupportRequestClient requestId={requestId} />;
}
