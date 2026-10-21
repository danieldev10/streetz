import { EventStatus, EventType, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "crypto";

export type EventVenueSource = {
  id: string;
  eventType?: EventType;
  venueVersion?: number;
  venue: string;
  city: string;
  state: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  status?: EventStatus;
};

export function getWebsiteVenue(event: Pick<EventVenueSource, "venue" | "eventType">) {
  if (event.eventType === EventType.PRIVATE) return "Private";
  if (event.eventType === EventType.EXCLUSIVE) return "Exclusive";
  return event.venue;
}

export function getVenueRevealAt(event: Pick<EventVenueSource, "startsAt">) {
  return new Date(event.startsAt.getTime() - 24 * 60 * 60 * 1000);
}

export function getTicketVenue(event: EventVenueSource, now = new Date(), options: { initialEmail?: boolean; confirmed?: boolean } = {}) {
  if (event.eventType === EventType.PRIVATE && options.confirmed === false) {
    return ["Private", event.city, event.state].filter(Boolean).join(", ") + ". Venue details are available to confirmed ticket holders.";
  }
  if (event.eventType === EventType.EXCLUSIVE &&
      (options.initialEmail || options.confirmed === false || event.status === EventStatus.CANCELLED || now < getVenueRevealAt(event))) {
    return ["Exclusive", event.city, event.state].filter(Boolean).join(", ") +
      ". Venue details are emailed separately from 24 hours before the event.";
  }
  return [event.venue, event.city, event.state].filter(Boolean).join(", ");
}

export function getVenueDetailsHash(event: EventVenueSource) {
  return createHash("sha256").update(JSON.stringify([
    event.eventType ?? EventType.PUBLIC, event.venueVersion ?? 0, event.venue, event.city, event.state, event.startsAt.toISOString()
  ])).digest("hex");
}

export function isVenueEventActive(event: EventVenueSource, now = new Date()) {
  return event.status === EventStatus.PUBLISHED && (event.endsAt ?? event.startsAt) > now;
}

/** One durable delivery per holder and version, retained after background jobs are pruned.
 * Bulk SQL keeps large events from creating thousands of individual enqueue transactions.
 */
export async function queueEventVenueEmails(
  transaction: Prisma.TransactionClient,
  event: EventVenueSource,
  options: { detailsChanged?: boolean; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  if (!isVenueEventActive(event, now) || (event.eventType !== EventType.EXCLUSIVE && !options.detailsChanged)) return;
  const detailsHash = getVenueDetailsHash(event);
  const runAt = event.eventType === EventType.EXCLUSIVE ? new Date(Math.max(now.getTime(), getVenueRevealAt(event).getTime())) : now;
  await transaction.$executeRaw`
    INSERT INTO "EventVenueEmail" (id, key, "eventId", "userId", "guestOrderId", "detailsHash")
    SELECT 'venue-' || ${randomUUID()} || '-' || md5(holder.recipient),
      ${event.id} || ':' || ${detailsHash} || ':' || holder.recipient,
      ${event.id}, holder."userId", holder."guestOrderId", ${detailsHash}
    FROM (
      SELECT DISTINCT t."userId", t."guestOrderId",
        CASE WHEN t."userId" IS NOT NULL THEN 'user:' || t."userId" ELSE 'guest:' || t."guestOrderId" END AS recipient
      FROM "Ticket" t LEFT JOIN "User" u ON u.id = t."userId"
      WHERE t."eventId" = ${event.id} AND t.status IN ('CONFIRMED', 'PAID', 'CHECKED_IN')
        AND (t."guestOrderId" IS NOT NULL OR (u.id IS NOT NULL AND u."accountStatus" <> 'DELETED'))
    ) holder ORDER BY holder.recipient ON CONFLICT (key) DO NOTHING`;
  await transaction.$executeRaw`
    INSERT INTO "BackgroundJob" (id, key, type, payload, "runAt", "expiresAt", "updatedAt")
    SELECT 'venue-email-' || ${randomUUID()} || '-' || d.id, 'event-venue-email:' || d.id, 'EVENT_VENUE_EMAIL',
      jsonb_build_object('deliveryId', d.id), ${runAt}, ${event.endsAt ?? event.startsAt}, ${now}
    FROM "EventVenueEmail" d
    WHERE d."eventId" = ${event.id} AND d."detailsHash" = ${detailsHash} AND d."sentAt" IS NULL
      AND EXISTS (SELECT 1 FROM "Ticket" t WHERE t."eventId" = d."eventId"
        AND t.status IN ('CONFIRMED', 'PAID', 'CHECKED_IN')
        AND (t."userId" = d."userId" OR t."guestOrderId" = d."guestOrderId"))
    ON CONFLICT (key) DO UPDATE SET state = 'PENDING', "runAt" = EXCLUDED."runAt",
      attempts = 0, "completedAt" = NULL, "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = EXCLUDED."updatedAt"
    WHERE "BackgroundJob".state = 'SUCCEEDED'`;
}
