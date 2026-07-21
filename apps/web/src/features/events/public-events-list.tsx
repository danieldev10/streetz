"use client";

import type { ComponentProps } from "react";
import { EventCardList } from "@/features/events/event-card-list";

export function PublicEventsList(props: Omit<ComponentProps<typeof EventCardList>, "mode">) {
  return <EventCardList {...props} mode="explore" />;
}
