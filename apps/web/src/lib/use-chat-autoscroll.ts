"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** How close to the bottom still counts as "following the conversation". */
const NEAR_BOTTOM_THRESHOLD_PX = 120;

/**
 * Keeps a message scroller pinned to the newest message, but only while the
 * reader is already at the bottom. If they have scrolled up to read history, an
 * incoming message sets `hasNewMessages` instead of yanking the viewport, so the
 * thread can offer a jump-to-latest control rather than moving under them.
 *
 * Sending your own message always scrolls, and opening a thread always lands at
 * the newest message.
 */
export function useChatAutoScroll({
  scrollerRef,
  threadId,
  latestMessageId,
  isOwnLatestMessage,
  isLoading,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  threadId: string | null;
  latestMessageId: string | null;
  isOwnLatestMessage: boolean;
  isLoading: boolean;
}) {
  const isNearBottomRef = useRef(true);
  const lastThreadIdRef = useRef<string | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      isNearBottomRef.current = true;
      setHasNewMessages(false);
    },
    [scrollerRef]
  );

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;

    if (isNearBottomRef.current) {
      setHasNewMessages(false);
    }
  }, [scrollerRef]);

  useEffect(() => {
    if (!threadId || isLoading) {
      return undefined;
    }

    // Opening a different thread always starts at the newest message.
    const isNewThread = lastThreadIdRef.current !== threadId;

    if (isNewThread) {
      lastThreadIdRef.current = threadId;
      isNearBottomRef.current = true;
    }

    const frame = window.requestAnimationFrame(() => {
      if (isNewThread || isNearBottomRef.current || isOwnLatestMessage) {
        scrollToBottom();
        return;
      }

      if (latestMessageId) {
        setHasNewMessages(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [threadId, latestMessageId, isOwnLatestMessage, isLoading, scrollToBottom]);

  return { hasNewMessages, handleScroll, scrollToBottom };
}
