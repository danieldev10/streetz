"use client";

import type { ComponentProps } from "react";
import { EventCardList } from "@/features/events/event-card-list";

export function EventHistory(props: Omit<ComponentProps<typeof EventCardList>, "mode">) {
  return <EventCardList {...props} mode="history" />;
}
