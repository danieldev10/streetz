import type { RoomMember } from "@/lib/types";

export type MentionSearch = {
  start: number;
  end: number;
  query: string;
};

export function getMentionSearch(body: string, caretIndex: number | null | undefined): MentionSearch | null {
  const end = Math.max(0, Math.min(caretIndex ?? body.length, body.length));
  const textBeforeCaret = body.slice(0, end);
  const mentionStart = textBeforeCaret.lastIndexOf("@");

  if (mentionStart < 0) {
    return null;
  }

  const beforeMention = mentionStart > 0 ? body[mentionStart - 1] : "";

  if (beforeMention && !/\s/.test(beforeMention)) {
    return null;
  }

  const query = body.slice(mentionStart + 1, end);

  if (/\s/.test(query)) {
    return null;
  }

  return {
    start: mentionStart,
    end,
    query,
  };
}

function isMentionBoundary(character: string | undefined) {
  return !character || /[\s.,!?;:()[\]{}"']/u.test(character);
}

export function getUniqueRoomMembers(members: RoomMember[]) {
  const seenIds = new Set<string>();

  return members.filter((member) => {
    if (seenIds.has(member.id) || !member.displayName.trim()) {
      return false;
    }

    seenIds.add(member.id);
    return true;
  });
}

export function renderRoomMessageBody(
  body: string,
  members: RoomMember[],
  currentUserId: string | null,
  onOpenMember: (member: RoomMember) => void,
  onDark = false
) {
  const mentionTargets = getUniqueRoomMembers(members)
    .map((member) => ({ member, token: `@${member.displayName.trim()}` }))
    .sort((first, second) => second.token.length - first.token.length);

  if (mentionTargets.length === 0) {
    return body;
  }

  const parts = [];
  let index = 0;
  let key = 0;

  while (index < body.length) {
    if (body[index] !== "@") {
      const nextMentionIndex = body.indexOf("@", index + 1);
      const nextIndex = nextMentionIndex === -1 ? body.length : nextMentionIndex;
      parts.push(body.slice(index, nextIndex));
      index = nextIndex;
      continue;
    }

    const match = mentionTargets.find(({ token }) => {
      const possibleMention = body.slice(index, index + token.length);

      return possibleMention.toLocaleLowerCase() === token.toLocaleLowerCase() && isMentionBoundary(body[index + token.length]);
    });

    if (!match) {
      parts.push(body[index]);
      index += 1;
      continue;
    }

    const isCurrentUser = match.member.id === currentUserId;

    parts.push(
      <button
        key={`mention-${match.member.id}-${key}`}
        type="button"
        className={`inline bg-transparent p-0 font-semibold underline underline-offset-2 transition ${
          onDark
            ? "text-white decoration-white/60 hover:text-white/80"
            : `no-underline ${isCurrentUser ? "text-[#7c1f7d]" : "text-[#9d2a9e] hover:text-[#7c1f7d]"}`
        }`}
        onClick={() => onOpenMember(match.member)}
      >
        {body.slice(index, index + match.token.length)}
      </button>
    );
    key += 1;
    index += match.token.length;
  }

  return parts;
}
