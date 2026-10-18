import { Users } from "lucide-react";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import type { DiscoveryCandidate } from "@/lib/types";

export function ChatAuthorAvatar({ author, onOpen, className = "size-8" }: {
  author: DiscoveryCandidate | null;
  onOpen?: (author: DiscoveryCandidate) => void;
  className?: string;
}) {
  const classes = `relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-tint ${className}`;
  const avatar = author
    ? <CandidatePhoto candidate={author} variant="thumb" />
    : <Users className="size-4 text-ink-400" aria-hidden="true" />;

  if (author && author.accountStatus !== "DELETED" && onOpen) {
    return (
      <button type="button" className={classes} onClick={() => onOpen(author)} aria-label={`View ${author.displayName} profile`}>
        {avatar}
      </button>
    );
  }

  return <span className={classes}>{avatar}</span>;
}
