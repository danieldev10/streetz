import { UserRoundX } from "lucide-react";

export function DeletedAccountAvatar() {
  return (
    <span
      className="grid h-full w-full place-items-center bg-surface-shade text-ink-400"
      role="img"
      aria-label="Deleted account"
      title="This account has been deleted"
    >
      <UserRoundX className="size-1/2" aria-hidden="true" />
    </span>
  );
}
