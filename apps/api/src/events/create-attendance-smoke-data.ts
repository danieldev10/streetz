import { NestFactory } from "@nestjs/core";
import { AccountStatus, EventKind, EventStatus, TicketStatus, UserRole } from "@prisma/client";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_USER_LIMIT = 6;
const SMOKE_EVENT_COUNT = 4;
const SLUG_PREFIX = "smoke-attendance-trust";
const REGULAR_TICKET_NAME = "Regular";
const DAY_MS = 24 * 60 * 60 * 1000;

type SmokeUser = {
  id: string;
  displayName: string;
  email: string;
};

type SmokeEventSpec = {
  title: string;
  slug: string;
  startsAt: Date;
  endsAt: Date;
};

async function bootstrap() {
  const shouldApply = process.argv.includes("--apply");
  const userLimit = getNumericOption("--users", DEFAULT_USER_LIMIT);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const prisma = app.get(PrismaService, { strict: false });
    const users = await prisma.user.findMany({
      where: {
        role: UserRole.USER,
        accountStatus: AccountStatus.ACTIVE,
        profile: { isNot: null }
      },
      select: { id: true, displayName: true, email: true },
      orderBy: { createdAt: "asc" },
      take: userLimit
    });

    if (users.length === 0) {
      console.log(
        JSON.stringify(
          {
            applied: false,
            message: "No active non-admin users with profiles were found. Create or complete a user profile first."
          },
          null,
          2
        )
      );
      return;
    }

    const events = getSmokeEventSpecs();

    if (!shouldApply) {
      console.log(
        JSON.stringify(
          {
            applied: false,
            message: "Dry run only. Re-run with --apply to create smoke events and checked-in tickets.",
            events: events.map((event) => ({ title: event.title, slug: event.slug, startsAt: event.startsAt })),
            users: users.map((user, index) => ({
              displayName: user.displayName,
              email: user.email,
              attendedEventCount: getAttendanceCount(index)
            }))
          },
          null,
          2
        )
      );
      return;
    }

    const createdEvents = await Promise.all(events.map((event) => upsertSmokeEvent(prisma, event)));
    const ticketTypes = await Promise.all(createdEvents.map((event) => upsertRegularTicketType(prisma, event.id)));
    let checkedInTickets = 0;

    for (const [userIndex, user] of users.entries()) {
      const attendanceCount = getAttendanceCount(userIndex);

      for (let eventIndex = 0; eventIndex < attendanceCount; eventIndex += 1) {
        const event = createdEvents[eventIndex];
        const ticketType = ticketTypes[eventIndex];

        await upsertCheckedInTicket(prisma, {
          eventId: event.id,
          eventSlug: event.slug,
          ticketTypeId: ticketType.id,
          user,
          checkedInAt: event.endsAt ?? event.startsAt
        });
        checkedInTickets += 1;
      }
    }

    await Promise.all(ticketTypes.map((ticketType) => refreshTicketTypeSoldCount(prisma, ticketType.id)));

    console.log(
      JSON.stringify(
        {
          applied: true,
          message: "Smoke attendance data created.",
          events: createdEvents.map((event) => ({ id: event.id, title: event.title, slug: event.slug })),
          users: users.map((user, index) => ({
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            attendedSmokeEvents: getAttendanceCount(index)
          })),
          checkedInTickets
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}

function getNumericOption(name: string, fallback: number) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const value = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getAttendanceCount(userIndex: number) {
  return SMOKE_EVENT_COUNT - (userIndex % SMOKE_EVENT_COUNT);
}

function getSmokeEventSpecs(): SmokeEventSpec[] {
  const firstStart = new Date(Date.UTC(2026, 0, 9, 18, 0, 0));

  return Array.from({ length: SMOKE_EVENT_COUNT }, (_unused, index) => {
    const startsAt = new Date(firstStart.getTime() + index * 7 * DAY_MS);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    const eventNumber = index + 1;

    return {
      title: `Smoke Attendance Trust Night ${eventNumber}`,
      slug: `${SLUG_PREFIX}-${eventNumber}`,
      startsAt,
      endsAt
    };
  });
}

async function upsertSmokeEvent(prisma: PrismaService, event: SmokeEventSpec) {
  return prisma.event.upsert({
    where: { slug: event.slug },
    create: {
      title: event.title,
      slug: event.slug,
      description: "Smoke data for checking attended-event trust markers.",
      category: "Smoke Test",
      kind: EventKind.STANDARD,
      venue: "Crush Club Smoke Venue",
      state: "Lagos",
      city: "Lagos",
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: EventStatus.COMPLETED
    },
    update: {
      title: event.title,
      description: "Smoke data for checking attended-event trust markers.",
      category: "Smoke Test",
      kind: EventKind.STANDARD,
      venue: "Crush Club Smoke Venue",
      state: "Lagos",
      city: "Lagos",
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: EventStatus.COMPLETED
    }
  });
}

async function upsertRegularTicketType(prisma: PrismaService, eventId: string) {
  const existing = await prisma.ticketType.findUnique({
    where: {
      eventId_name: {
        eventId,
        name: REGULAR_TICKET_NAME
      }
    }
  });

  if (existing) {
    return prisma.ticketType.update({
      where: { id: existing.id },
      data: {
        priceKobo: 0,
        capacity: 500,
        maxTicketsPerUser: 500
      }
    });
  }

  return prisma.ticketType.create({
    data: {
      eventId,
      name: REGULAR_TICKET_NAME,
      priceKobo: 0,
      capacity: 500,
      maxTicketsPerUser: 500
    }
  });
}

async function upsertCheckedInTicket(
  prisma: PrismaService,
  input: {
    eventId: string;
    eventSlug: string;
    ticketTypeId: string;
    user: SmokeUser;
    checkedInAt: Date;
  }
) {
  const existing = await prisma.ticket.findFirst({
    where: {
      eventId: input.eventId,
      userId: input.user.id
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return prisma.ticket.update({
      where: { id: existing.id },
      data: {
        ticketTypeId: input.ticketTypeId,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: input.checkedInAt,
        reservedUntil: null
      }
    });
  }

  return prisma.ticket.create({
    data: {
      eventId: input.eventId,
      userId: input.user.id,
      ticketTypeId: input.ticketTypeId,
      code: createTicketCode(input.eventSlug, input.user.id),
      status: TicketStatus.CHECKED_IN,
      checkedInAt: input.checkedInAt,
      reservedUntil: null
    }
  });
}

async function refreshTicketTypeSoldCount(prisma: PrismaService, ticketTypeId: string) {
  const soldCount = await prisma.ticket.count({
    where: {
      ticketTypeId,
      status: { in: [TicketStatus.PAID, TicketStatus.CHECKED_IN] }
    }
  });

  return prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: { soldCount }
  });
}

function createTicketCode(eventSlug: string, userId: string) {
  const userToken = userId.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase();
  const eventToken = eventSlug.replace(/[^a-z0-9]/gi, "").slice(-12).toUpperCase();

  return `SMOKE-${eventToken}-${userToken}`;
}

void bootstrap();
