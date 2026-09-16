import { EventStatus, Prisma } from "@prisma/client";

export const EVENT_ROOM_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

type EventRoomLifecycleSource = {
  startsAt: Date;
  endsAt: Date | null;
  status: EventStatus;
};

export function getEventRoomClosesAt(event: Pick<EventRoomLifecycleSource, "startsAt" | "endsAt">) {
  return new Date((event.endsAt ?? event.startsAt).getTime() + EVENT_ROOM_GRACE_PERIOD_MS);
}

export function isEventRoomAvailable(event: EventRoomLifecycleSource, now = new Date()) {
  return (
    (event.status === EventStatus.PUBLISHED || event.status === EventStatus.COMPLETED) &&
    getEventRoomClosesAt(event) > now
  );
}

export function getAvailableEventRoomWhere(now = new Date()): Prisma.EventWhereInput {
  const eventCutoff = new Date(now.getTime() - EVENT_ROOM_GRACE_PERIOD_MS);

  return {
    status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
    OR: [
      { endsAt: { gt: eventCutoff } },
      {
        endsAt: null,
        startsAt: { gt: eventCutoff }
      }
    ]
  };
}

export function isEventRoomEnabledForStatus(status: EventStatus) {
  return status === EventStatus.PUBLISHED || status === EventStatus.COMPLETED;
}
