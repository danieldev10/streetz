import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function PrivacyPolicyLink({ onClick, tabIndex }: { onClick?: () => void; tabIndex?: number }) {
  return (
    <Link href="/privacy-policy" onClick={onClick} tabIndex={tabIndex}
      className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink-600 transition hover:bg-surface-muted hover:text-ink">
      <ShieldCheck className="size-4" aria-hidden="true" />
      Privacy Policy
    </Link>
  );
}
