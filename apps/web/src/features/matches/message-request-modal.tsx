"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { DiscoveryCandidate } from "@/lib/types";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type ConversationRequestResponse = {
  created: boolean;
  accepted?: boolean;
  conversation: {
    id: string;
    status: "REQUESTED" | "ACTIVE" | "DECLINED" | "CLOSED" | "BLOCKED" | "UNMATCHED";
  };
};

const INTRO_MESSAGE_MAX_LENGTH = 1000;

export function MessageRequestModal({ token, target, onClose, onSent, onConversationChanged }: {
  token: string;
  target: DiscoveryCandidate;
  onClose: () => void;
  onSent: (notice: string | null) => void;
  onConversationChanged: () => void;
}) {
  const router = useRouter();
  const headingId = useId();
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(true, dialogRef);

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const introduction = body.trim();
    if (!introduction || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await apiRequest<ConversationRequestResponse>("/conversations/requests", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: target.id, body: introduction }),
      });
      onConversationChanged();

      if (response.conversation.status === "ACTIVE" || response.accepted) {
        onSent(null);
        router.push(`/messages/${response.conversation.id}`);
        return;
      }

      onSent(response.created
        ? `Message request sent to ${target.displayName}.`
        : `Your message request to ${target.displayName} is already pending.`
      );
    } catch (cause) {
      setError(getUserErrorMessage(cause));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId}
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        onSubmit={sendRequest}>
        <div className="flex items-center gap-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-brand-tint">
            <CandidatePhoto candidate={target} variant="thumb" />
          </div>
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-lg font-semibold">Message {target.displayName}</h2>
            <p className="mt-0.5 text-xs text-ink-500">Send one introduction. They can accept or decline.</p>
          </div>
        </div>
        {error ? <p role="alert" className="mt-4 rounded-[16px] bg-danger-tint p-3 text-sm text-danger">{error}</p> : null}
        <textarea
          className="mt-4 min-h-32 w-full resize-none rounded-[20px] border border-black/[0.08] p-4 text-sm leading-6 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          aria-label="Introduction"
          placeholder="Introduce yourself"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={INTRO_MESSAGE_MAX_LENGTH}
          disabled={isSending}
        />
        <p className="mt-1 text-right text-xs text-ink-400">{body.length}/{INTRO_MESSAGE_MAX_LENGTH}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="h-11 rounded-full border border-black/[0.08] text-sm font-semibold"
            onClick={onClose} disabled={isSending}>
            Cancel
          </button>
          <ActionButton isLoading={isSending} icon={<MessageCircle className="size-4" aria-hidden="true" />}
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSending || !body.trim()}>
            Send request
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
