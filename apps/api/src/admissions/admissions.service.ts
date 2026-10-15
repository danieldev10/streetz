import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { AccountStatus, EventStatus, Prisma, TicketStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getAccountAccessBlock } from "../users/account-status";

type Actor = {
  id: string;
  role: UserRole;
  accountStatus: AccountStatus;
  suspendedUntil: Date | null;
};

const eventSelect = {
  id: true,
  title: true,
  venue: true,
  city: true,
  state: true,
  startsAt: true,
  status: true
} as const;
const ticketInclude = {
  event: { select: { id: true, title: true, status: true, startsAt: true } },
  ticketType: { select: { id: true, name: true } },
  user: { select: { displayName: true } },
  guestOrder: { select: { displayName: true } },
  checkedInBy: { select: { id: true, displayName: true } }
} as const;

@Injectable()
export class AdmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(userId: string, cursor?: string) {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.actor(transaction, userId);
      if (actor.role !== UserRole.ADMIN) {
        const assignment = await transaction.eventCheckInStaff.findFirst({
          where: { userId },
          select: { userId: true }
        });
        if (!assignment) {
          throw new ForbiddenException("Ticket check-in is restricted to admins and assigned event staff.");
        }
      }
      const events = await transaction.event.findMany({
        where: {
          status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
          ...(actor.role === UserRole.ADMIN ? {} : { checkInStaff: { some: { userId } } })
        },
        select: eventSelect,
        orderBy: { id: "desc" },
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      return { events: events.slice(0, 50), nextCursor: events.length > 50 ? events[49].id : null };
    });
  }

  async getEvent(userId: string, eventId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.authorize(transaction, userId, eventId);
      const event = await transaction.event.findUniqueOrThrow({
        where: { id: eventId },
        select: eventSelect
      });
      const checkedInCount = await transaction.ticket.count({
        where: { eventId, status: TicketStatus.CHECKED_IN }
      });
      return { event, checkedInCount };
    });
  }

  async checkInTicket(userId: string, eventId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (code.length < 6 || code.length > 100)
      throw new BadRequestException("Enter a valid ticket code.");
    return this.prisma.$transaction(async (transaction) => {
      // Assignment and account locks make revocation/moderation effective before
      // any subsequent scan. They do not serialize different staff members.
      const event = await this.authorize(transaction, userId, eventId);
      if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.COMPLETED) {
        throw new BadRequestException(
          event.status === EventStatus.CANCELLED
            ? "Tickets for a cancelled event cannot be checked in."
            : "This event is not open for check-in."
        );
      }
      const rows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Ticket" WHERE code = ${code} AND "eventId" = ${eventId} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException("Ticket not found for this event.");
      const ticket = await transaction.ticket.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: ticketInclude
      });
      if (ticket.status === TicketStatus.CHECKED_IN)
        return { alreadyCheckedIn: true, ticket: this.formatTicket(ticket) };
      if (ticket.status !== TicketStatus.PAID && ticket.status !== TicketStatus.CONFIRMED) {
        throw new BadRequestException("This ticket is not valid for check-in.");
      }
      const updated = await transaction.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.CHECKED_IN, checkedInAt: new Date(), checkedInById: userId },
        include: ticketInclude
      });
      return { alreadyCheckedIn: false, ticket: this.formatTicket(updated) };
    });
  }

  async listStaff(adminId: string, eventId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.authorize(transaction, adminId, eventId, true);
      const staff = await transaction.eventCheckInStaff.findMany({
        where: { eventId },
        select: {
          userId: true,
          assignedAt: true,
          user: { select: { id: true, displayName: true, email: true, accountStatus: true } }
        },
        orderBy: { assignedAt: "asc" }
      });
      return { staff };
    });
  }

  async assignStaff(adminId: string, eventId: string, email: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.authorize(transaction, adminId, eventId, true);
      const user = await transaction.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, accountStatus: true, suspendedUntil: true }
      });
      if (!user || getAccountAccessBlock(user))
        throw new BadRequestException("Use the email of an active Crushclub account.");
      await transaction.eventCheckInStaff.upsert({
        where: { eventId_userId: { eventId, userId: user.id } },
        create: { eventId, userId: user.id, assignedById: adminId },
        update: {}
      });
      return { assigned: true };
    });
  }

  async removeStaff(adminId: string, eventId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.authorize(transaction, adminId, eventId, true);
      await transaction.eventCheckInStaff.deleteMany({ where: { eventId, userId } });
      return { removed: true };
    });
  }

  private async actor(transaction: Prisma.TransactionClient, userId: string) {
    const [actor] = await transaction.$queryRaw<Actor[]>`
      SELECT id, role, "accountStatus", "suspendedUntil" FROM "User" WHERE id = ${userId} FOR SHARE`;
    if (!actor || getAccountAccessBlock(actor))
      throw new ForbiddenException("An active account is required for ticket check-in.");
    return actor;
  }

  private async authorize(
    transaction: Prisma.TransactionClient,
    userId: string,
    eventId: string,
    adminOnly = false
  ) {
    const actor = await this.actor(transaction, userId);
    if (adminOnly && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException("Only admins can manage event staff.");
    const [event] = await transaction.$queryRaw<Array<{ id: string; status: EventStatus }>>`
      SELECT id, status FROM "Event" WHERE id = ${eventId} FOR SHARE`;
    if (!event) throw new NotFoundException("Event not found.");
    if (actor.role !== UserRole.ADMIN) {
      const assigned = await transaction.$queryRaw<Array<{ userId: string }>>`
        SELECT "userId" FROM "EventCheckInStaff" WHERE "eventId" = ${eventId} AND "userId" = ${userId} FOR SHARE`;
      if (!assigned.length)
        throw new ForbiddenException("You are not assigned to check in tickets for this event.");
    }
    return event;
  }

  private formatTicket(ticket: Prisma.TicketGetPayload<{ include: typeof ticketInclude }>) {
    return {
      id: ticket.id,
      code: ticket.code,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      checkedInBy: ticket.checkedInBy,
      event: ticket.event,
      ticketType: ticket.ticketType,
      holder: ticket.user ?? ticket.guestOrder
    };
  }
}
