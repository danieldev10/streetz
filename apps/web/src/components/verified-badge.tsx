import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({ verified, className = "" }: { verified?: boolean; className?: string }) {
  if (!verified) return null;

  return (
    <span className={`inline-flex shrink-0 align-middle ${className}`} role="img" aria-label="Verified profile" title="Live selfie verified">
      <BadgeCheck className="size-4 fill-blue-500 text-white" aria-hidden="true" />
    </span>
  );
}
