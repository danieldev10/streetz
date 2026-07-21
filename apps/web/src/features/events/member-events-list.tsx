"use client";

import type { ComponentProps } from "react";
import { EventCardList, type EventCardMode } from "@/features/events/event-card-list";

export function MemberEventsList(props: Omit<ComponentProps<typeof EventCardList>, "mode"> & {
  mode: Exclude<EventCardMode, "history">;
}) {
  return <EventCardList {...props} />;
}
