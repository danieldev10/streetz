import Link from "next/link";
import { Settings } from "lucide-react";

export function SettingsLink() {
  return (
    <Link href="/settings" aria-label="Settings" title="Settings"
      className="grid size-11 place-items-center rounded-full border border-line/8 bg-surface text-ink-600 transition hover:bg-brand-wash hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <Settings className="size-4" aria-hidden="true" />
    </Link>
  );
}
