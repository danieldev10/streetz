import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventKind, EventStatus, PaymentPurpose, PaymentStatus, Prisma, SubscriptionStatus, TicketStatus, UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { EVENT_IMAGE_UPLOAD_MAX_BYTES, formatUploadLimit } from "../storage/upload-limits";
import { getAccountAccessBlock } from "../users/account-status";
import { BookEventDto } from "./dto/book-event.dto";
import { CreateEventDto, EVENT_CATEGORY_NAMES, EVENT_TICKET_TIER_NAMES, EventTicketTierDto } from "./dto/create-event.dto";
import { PresignEventImageDto } from "./dto/presign-event-image.dto";
import { CONFIRMED_TICKET_STATUSES, getActiveTicketWhere } from "./ticket-reservations";
import { UpdateEventDto } from "./dto/update-event.dto";

const EVENT_IMAGE_UPLOAD_EXPIRES_SECONDS = 300;
const REGULAR_TICKET_NAME = "Regular";
const EVENT_CANCELLATION_REASON_MAX_LENGTH = 500;
const DEFAULT_MAX_TICKETS_PER_USER = 4;
const DEFAULT_EVENT_CAPACITY = 100;

const contentTypeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

type EventSource = Prisma.EventGetPayload<{
  include: {
    ticketTypes: true;
    tickets: {
      include: {
        ticketType: true;
      };
    };
  };
}>;

type TicketTypeSource = EventSource["ticketTypes"][number];
type TicketTypeCounts = {
  soldCount: number;
  reservedCount: number;
};
type TicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];
type TicketTypeInput = {
  name: TicketTierName;
  priceKobo: number;
  capacity: number;
  maxTicketsPerUser: number;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getAdminEvents() {
    const events = await this.prisma.event.findMany({
      where: { kind: EventKind.STANDARD },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          include: {
            ticketType: true
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }]
    });

    return {
      events: await Promise.all(events.map((event) => this.formatEvent(event, { includeAdminCounts: true })))
    };
  }

  async createEvent(dto: CreateEventDto) {
    const startsAt = this.parseDate(dto.startsAt, "Event start date is invalid.");
    const endsAt = this.parseOptionalDate(dto.endsAt, "Event end date is invalid.");
    this.assertDateOrder(startsAt, endsAt);
    this.assertCreatableEventStatus(dto.status ?? EventStatus.DRAFT);

    const ticketTypes = this.buildTicketTypeInputs(dto);

    const event = await this.prisma.event.create({
      data: {
        title: this.cleanText(dto.title),
        slug: await this.createUniqueSlug(dto.title),
        description: this.cleanOptionalText(dto.description),
        coverImage: this.cleanCoverImage(dto.coverImage),
        category: this.cleanEventCategory(dto.category),
        venue: this.cleanText(dto.venue),
        state: this.cleanText(dto.state),
        city: this.cleanText(dto.city),
        startsAt,
        endsAt,
        status: dto.status ?? EventStatus.DRAFT,
        ticketTypes: {
          create: ticketTypes
        }
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          include: {
            ticketType: true
          }
        }
      }
    });

    return this.formatEvent(event, { includeAdminCounts: true });
  }

  async createEventImageUpload(adminUserId: string, dto: PresignEventImageDto) {
    const extension = contentTypeExtensions[dto.contentType];

    if (!extension) {
      throw new BadRequestException("Only JPG, PNG, and WebP event images are supported.");
    }

    if (dto.fileSizeBytes > EVENT_IMAGE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(`Event images must be ${formatUploadLimit(EVENT_IMAGE_UPLOAD_MAX_BYTES)} or smaller after compression.`);
    }

    const objectKey = `events/${adminUserId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;

    return {
      uploadUrl: await this.storage.createUploadUrl(objectKey, dto.contentType, EVENT_IMAGE_UPLOAD_EXPIRES_SECONDS, dto.fileSizeBytes),
      objectKey,
      publicUrl: this.storage.buildPublicUrl(objectKey),
      expiresInSeconds: EVENT_IMAGE_UPLOAD_EXPIRES_SECONDS
    };
  }

  async updateEvent(eventId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          include: {
            ticketType: true
          }
        }
      }
    });

    if (!event || event.kind !== EventKind.STANDARD) {
      throw new NotFoundException("Event not found.");
    }

    const startsAt = dto.startsAt ? this.parseDate(dto.startsAt, "Event start date is invalid.") : undefined;
    const endsAt = dto.endsAt !== undefined ? this.parseOptionalDate(dto.endsAt, "Event end date is invalid.") : undefined;
    this.assertDateOrder(startsAt ?? event.startsAt, endsAt === undefined ? event.endsAt : endsAt);

    const shouldSyncTicketTypes =
      dto.ticketTypes !== undefined ||
      dto.priceKobo !== undefined ||
      dto.capacity !== undefined ||
      dto.maxTicketsPerUser !== undefined;
    const ticketTypes = shouldSyncTicketTypes ? this.buildTicketTypeInputs(dto, event.ticketTypes) : null;

    if (dto.status !== undefined) {
      await this.assertEventStatusTransition(event, dto.status);
    }

    const isCancellingEvent = dto.status === EventStatus.CANCELLED && event.status !== EventStatus.CANCELLED;
    const cancellationReason = dto.cancellationReason !== undefined
      ? this.cleanOptionalText(dto.cancellationReason)
      : undefined;

    if (isCancellingEvent && !cancellationReason) {
      throw new BadRequestException("Cancellation reason is required.");
    }

    if (cancellationReason && cancellationReason.length > EVENT_CANCELLATION_REASON_MAX_LENGTH) {
      throw new BadRequestException(`Cancellation reason must be ${EVENT_CANCELLATION_REASON_MAX_LENGTH} characters or fewer.`);
    }

    const updatedEvent = await this.prisma.$transaction(async (transaction) => {
      if (ticketTypes) {
        await this.syncTicketTypes(transaction, eventId, event.ticketTypes, ticketTypes);
      }

      await transaction.event.update({
        where: { id: eventId },
        data: {
          ...(dto.title !== undefined ? { title: this.cleanText(dto.title) } : {}),
          ...(dto.description !== undefined ? { description: this.cleanOptionalText(dto.description) } : {}),
          ...(dto.coverImage !== undefined ? { coverImage: this.cleanCoverImage(dto.coverImage) } : {}),
          ...(dto.category !== undefined ? { category: this.cleanEventCategory(dto.category) } : {}),
          ...(dto.venue !== undefined ? { venue: this.cleanText(dto.venue) } : {}),
          ...(dto.state !== undefined ? { state: this.cleanText(dto.state) } : {}),
          ...(dto.city !== undefined ? { city: this.cleanText(dto.city) } : {}),
          ...(startsAt !== undefined ? { startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(isCancellingEvent ? { cancellationReason, cancelledAt: new Date() } : {})
        },
        include: {
          ticketTypes: { orderBy: { createdAt: "asc" } },
          tickets: {
            include: {
              ticketType: true
            }
          }
        }
      });

      if (isCancellingEvent) {
        await transaction.ticket.deleteMany({
          where: {
            eventId,
            status: TicketStatus.RESERVED
          }
        });
      }

      return transaction.event.findUniqueOrThrow({
        where: { id: eventId },
        include: {
          ticketTypes: { orderBy: { createdAt: "asc" } },
          tickets: {
            include: {
              ticketType: true
            }
          }
        }
      });
    });

    return this.formatEvent(updatedEvent, { includeAdminCounts: true });
  }

  async getPublicEvents() {
    const now = new Date();

    const events = await this.prisma.event.findMany({
      where: this.getBookableEventWhere(now),
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }]
    });

    const ticketTypeCounts = await this.getTicketTypeCounts(
      events.flatMap((event) => event.ticketTypes.map((ticketType) => ticketType.id))
    );

    return {
      events: await Promise.all(
        events.map((event) => this.formatEvent({ ...event, tickets: [] }, { includeUserTickets: false, ticketTypeCounts }))
      )
    };
  }

  async getPublicEvent(eventId: string) {
    const event = await this.findPublishedEvent(eventId);

    return this.formatEvent(event, { includeUserTickets: false });
  }

  async getPublishedEvents(userId: string) {
    await this.ensureMemberOrAdmin(userId);
    const now = new Date();

    const events = await this.prisma.event.findMany({
      where: this.getBookableEventWhere(now),
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: CONFIRMED_TICKET_STATUSES }
          },
          include: {
            ticketType: true
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }]
    });

    return {
      events: await Promise.all(events.map((event) => this.formatEvent(event, { includeUserTickets: true })))
    };
  }

  async getEventHistory(userId: string) {
    await this.ensureMemberOrAdmin(userId);
    const now = new Date();

    const events = await this.prisma.event.findMany({
      where: this.getHistoricalMemberEventWhere(userId, now),
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: CONFIRMED_TICKET_STATUSES }
          },
          include: {
            ticketType: true
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
    });

    return {
      events: await Promise.all(events.map((event) => this.formatEvent(event, { includeUserTickets: true })))
    };
  }

  async getEventTickets(userId: string, eventId: string) {
    await this.ensureMemberOrAdmin(userId);
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...this.getVisibleMemberEventWhere(userId, now)
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: CONFIRMED_TICKET_STATUSES }
          },
          include: {
            ticketType: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    return this.formatEvent(event, { includeUserTickets: true });
  }

  async bookFreeEvent(userId: string, eventId: string, dto: BookEventDto = {}) {
    const user = await this.ensureMemberOrAdmin(userId);

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("Admins manage events but cannot book tickets.");
    }

    const event = await this.findPublishedEvent(eventId);
    const ticketType = this.getRequestedTicketType(event.ticketTypes, dto.ticketTypeId);

    if (ticketType.priceKobo > 0) {
      throw new BadRequestException("This event requires a paid ticket.");
    }

    const quantity = this.getTicketQuantity(dto.quantity);

    await this.prisma.$transaction(async (transaction) => {
      await this.lockTicketType(transaction, ticketType.id);

      const [activeTickets, userOwnedTickets] = await Promise.all([
        transaction.ticket.count({
          where: {
            ticketTypeId: ticketType.id,
            ...getActiveTicketWhere(new Date())
          }
        }),
        transaction.ticket.count({
          where: {
            userId,
            eventId,
            ticketTypeId: ticketType.id,
            status: { in: CONFIRMED_TICKET_STATUSES }
          }
        })
      ]);

      this.assertTicketPurchaseAvailability({
        quantity,
        activeTickets,
        capacity: ticketType.capacity,
        userOwnedTickets,
        maxTicketsPerUser: ticketType.maxTicketsPerUser
      });

      await Promise.all(
        Array.from({ length: quantity }, () =>
          transaction.ticket.create({
            data: {
              eventId,
              userId,
              ticketTypeId: ticketType.id,
              code: this.createTicketCode(),
              status: TicketStatus.PAID
            }
          })
        )
      );

      await transaction.ticketType.update({
        where: { id: ticketType.id },
        data: { soldCount: { increment: quantity } }
      });
    });

    return this.getPublishedEventForUser(userId, eventId);
  }

  private getTicketQuantity(quantity: number | undefined) {
    if (quantity === undefined) {
      return 1;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new BadRequestException("Ticket quantity must be between 1 and 20.");
    }

    return quantity;
  }

  private buildTicketTypeInputs(
    dto: Pick<CreateEventDto, "ticketTypes" | "priceKobo" | "capacity" | "maxTicketsPerUser">,
    currentTicketTypes: TicketTypeSource[] = []
  ): TicketTypeInput[] {
    const currentByName = new Map<TicketTierName, TicketTypeSource>();

    for (const ticketType of this.sortTicketTypes(currentTicketTypes)) {
      currentByName.set(this.normalizeTicketTypeName(ticketType.name), ticketType);
    }

    const submittedByName = new Map<TicketTierName, EventTicketTierDto>();

    for (const ticketType of dto.ticketTypes ?? []) {
      const name = this.normalizeTicketTypeName(ticketType.name);

      if (submittedByName.has(name)) {
        throw new BadRequestException(`Duplicate ticket tier: ${name}.`);
      }

      submittedByName.set(name, ticketType);
    }

    const candidates = EVENT_TICKET_TIER_NAMES.map((name) => {
      const submitted = submittedByName.get(name);
      const current = currentByName.get(name);
      const isRegular = name === REGULAR_TICKET_NAME;
      const priceKobo = submitted?.priceKobo ?? (dto.ticketTypes ? undefined : isRegular ? dto.priceKobo : undefined) ?? current?.priceKobo ?? 0;
      const capacity = submitted?.capacity ?? (dto.ticketTypes ? undefined : isRegular ? dto.capacity : undefined) ?? current?.capacity ?? DEFAULT_EVENT_CAPACITY;
      const maxTicketsPerUser =
        submitted?.maxTicketsPerUser ??
        (dto.ticketTypes ? undefined : isRegular ? dto.maxTicketsPerUser : undefined) ??
        current?.maxTicketsPerUser ??
        DEFAULT_MAX_TICKETS_PER_USER;

      this.assertTicketTypeValues({ name, priceKobo, capacity, maxTicketsPerUser });

      return {
        name,
        priceKobo,
        capacity,
        maxTicketsPerUser
      };
    });

    const paidTiers = candidates.filter((ticketType) => ticketType.priceKobo > 0);
    const ticketTypes = paidTiers.length > 0
      ? paidTiers
      : candidates.filter((ticketType) => ticketType.name === REGULAR_TICKET_NAME).map((ticketType) => ({ ...ticketType, priceKobo: 0 }));

    ticketTypes.forEach((ticketType) => this.assertTicketPurchaseLimit(ticketType.maxTicketsPerUser, ticketType.capacity));

    return ticketTypes;
  }

  private assertTicketTypeValues(ticketType: TicketTypeInput) {
    if (!Number.isInteger(ticketType.priceKobo) || ticketType.priceKobo < 0) {
      throw new BadRequestException(`${ticketType.name} price must be zero or more.`);
    }

    if (!Number.isInteger(ticketType.capacity) || ticketType.capacity < 1) {
      throw new BadRequestException(`${ticketType.name} capacity must be at least 1.`);
    }

    if (!Number.isInteger(ticketType.maxTicketsPerUser) || ticketType.maxTicketsPerUser < 1) {
      throw new BadRequestException(`${ticketType.name} max tickets per person must be at least 1.`);
    }
  }

  private async syncTicketTypes(
    client: Prisma.TransactionClient,
    eventId: string,
    existingTicketTypes: TicketTypeSource[],
    nextTicketTypes: TicketTypeInput[]
  ) {
    const existingByName = new Map<TicketTierName, TicketTypeSource>();
    const nextNames = new Set(nextTicketTypes.map((ticketType) => ticketType.name));

    for (const ticketType of existingTicketTypes) {
      existingByName.set(this.normalizeTicketTypeName(ticketType.name), ticketType);
    }

    for (const ticketType of nextTicketTypes) {
      const existing = existingByName.get(ticketType.name);

      if (!existing) {
        await client.ticketType.create({
          data: {
            eventId,
            name: ticketType.name,
            priceKobo: ticketType.priceKobo,
            capacity: ticketType.capacity,
            maxTicketsPerUser: ticketType.maxTicketsPerUser
          }
        });
        continue;
      }

      const activeTickets = await this.countActiveTickets(existing.id, client);

      if (ticketType.capacity < activeTickets) {
        throw new BadRequestException(`${ticketType.name} capacity cannot be lower than existing reservations.`);
      }

      await client.ticketType.update({
        where: { id: existing.id },
        data: {
          name: ticketType.name,
          priceKobo: ticketType.priceKobo,
          capacity: ticketType.capacity,
          maxTicketsPerUser: ticketType.maxTicketsPerUser
        }
      });
    }

    for (const existing of existingTicketTypes) {
      const name = this.normalizeTicketTypeName(existing.name);

      if (nextNames.has(name)) {
        continue;
      }

      const activeTickets = await this.countActiveTickets(existing.id, client);

      if (activeTickets > 0) {
        throw new BadRequestException(`${name} cannot be removed while it has active tickets.`);
      }

      const historicalTickets = await client.ticket.count({ where: { ticketTypeId: existing.id } });

      if (historicalTickets > 0) {
        throw new BadRequestException(`${name} cannot be removed because it has ticket history.`);
      }

      await client.ticketType.delete({ where: { id: existing.id } });
    }
  }

  private getRequestedTicketType(ticketTypes: TicketTypeSource[], ticketTypeId: string | undefined) {
    const sortedTicketTypes = this.sortTicketTypes(ticketTypes);

    if (ticketTypeId) {
      const ticketType = sortedTicketTypes.find((item) => item.id === ticketTypeId);

      if (!ticketType) {
        throw new BadRequestException("Ticket tier is not available for this event.");
      }

      return ticketType;
    }

    if (sortedTicketTypes.length > 1) {
      throw new BadRequestException("Choose a ticket tier.");
    }

    const ticketType = sortedTicketTypes[0];

    if (!ticketType) {
      throw new BadRequestException("Event ticket type is missing.");
    }

    return ticketType;
  }

  private assertTicketPurchaseLimit(maxTicketsPerUser: number, capacity: number) {
    if (!Number.isInteger(maxTicketsPerUser) || maxTicketsPerUser < 1) {
      throw new BadRequestException("Max tickets per person must be at least 1.");
    }

    if (maxTicketsPerUser > capacity) {
      throw new BadRequestException("Max tickets per person cannot be greater than event capacity.");
    }
  }

  private assertTicketPurchaseAvailability({
    quantity,
    activeTickets,
    capacity,
    userOwnedTickets,
    maxTicketsPerUser
  }: {
    quantity: number;
    activeTickets: number;
    capacity: number;
    userOwnedTickets: number;
    maxTicketsPerUser: number;
  }) {
    if (activeTickets + quantity > capacity) {
      throw new BadRequestException(quantity === 1 ? "This event is sold out." : "Not enough tickets are available.");
    }

    if (userOwnedTickets + quantity > maxTicketsPerUser) {
      const remaining = Math.max(0, maxTicketsPerUser - userOwnedTickets);

      throw new BadRequestException(
        remaining === 0
          ? `You already own the maximum of ${maxTicketsPerUser} ticket${maxTicketsPerUser === 1 ? "" : "s"} for this ticket tier.`
          : `You can only buy ${remaining} more ticket${remaining === 1 ? "" : "s"} for this ticket tier.`
      );
    }
  }

  private async lockTicketType(client: Prisma.TransactionClient, ticketTypeId: string) {
    await client.$queryRaw`SELECT id FROM "TicketType" WHERE id = ${ticketTypeId} FOR UPDATE`;
  }

  private async getPublishedEventForUser(userId: string, eventId: string) {
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...this.getBookableEventWhere(now)
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: CONFIRMED_TICKET_STATUSES }
          },
          include: {
            ticketType: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    return this.formatEvent(event, { includeUserTickets: true });
  }

  private async findPublishedEvent(eventId: string) {
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...this.getBookableEventWhere(now)
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    return { ...event, tickets: [] };
  }

  private getBookableEventWhere(now: Date): Prisma.EventWhereInput {
    return {
      kind: EventKind.STANDARD,
      status: EventStatus.PUBLISHED,
      OR: [
        { endsAt: { gt: now } },
        {
          endsAt: null,
          startsAt: { gt: now }
        }
      ]
    };
  }

  private getVisibleMemberEventWhere(userId: string, now: Date): Prisma.EventWhereInput {
    return {
      OR: [
        this.getBookableEventWhere(now),
        this.getHistoricalMemberEventWhere(userId, now)
      ]
    };
  }

  private getHistoricalMemberEventWhere(userId: string, now: Date): Prisma.EventWhereInput {
    return {
      kind: EventKind.STANDARD,
      status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      tickets: {
        some: {
          userId,
          status: { in: CONFIRMED_TICKET_STATUSES }
        }
      },
      OR: [
        { status: EventStatus.COMPLETED },
        {
          endsAt: { lte: now }
        },
        {
          endsAt: null,
          startsAt: { lte: now }
        }
      ]
    };
  }

  private async ensureMemberOrAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        accountStatus: true,
        suspendedUntil: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new ForbiddenException(accountBlock);
    }

    if (user.role === UserRole.ADMIN) {
      return user;
    }

    const subscriptionEndsAt = user.subscriptionEndsAt;

    if (
      user.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      subscriptionEndsAt === null ||
      subscriptionEndsAt <= new Date()
    ) {
      throw new ForbiddenException("Active crushclub membership required.");
    }

    return user;
  }

  private async countActiveTickets(ticketTypeId: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const now = new Date();

    return client.ticket.count({
      where: {
        ticketTypeId,
        ...getActiveTicketWhere(now)
      }
    });
  }

  private async countActiveTicketsForEvent(eventId: string) {
    return this.prisma.ticket.count({
      where: {
        eventId,
        ...getActiveTicketWhere(new Date())
      }
    });
  }

  private async getTicketTypeCounts(ticketTypeIds: string[]) {
    const uniqueTicketTypeIds = [...new Set(ticketTypeIds)];

    if (uniqueTicketTypeIds.length === 0) {
      return new Map<string, TicketTypeCounts>();
    }

    const now = new Date();
    const [confirmedCounts, reservationCounts] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ["ticketTypeId"],
        where: {
          ticketTypeId: { in: uniqueTicketTypeIds },
          status: { in: CONFIRMED_TICKET_STATUSES }
        },
        _count: { _all: true }
      }),
      this.prisma.ticket.groupBy({
        by: ["ticketTypeId"],
        where: {
          ticketTypeId: { in: uniqueTicketTypeIds },
          status: TicketStatus.RESERVED,
          reservedUntil: { gt: now }
        },
        _count: { _all: true }
      })
    ]);
    const counts = new Map<string, TicketTypeCounts>();

    for (const ticketTypeId of uniqueTicketTypeIds) {
      counts.set(ticketTypeId, { soldCount: 0, reservedCount: 0 });
    }

    for (const item of confirmedCounts) {
      counts.set(item.ticketTypeId, {
        soldCount: item._count._all,
        reservedCount: counts.get(item.ticketTypeId)?.reservedCount ?? 0
      });
    }

    for (const item of reservationCounts) {
      counts.set(item.ticketTypeId, {
        soldCount: counts.get(item.ticketTypeId)?.soldCount ?? 0,
        reservedCount: item._count._all
      });
    }

    return counts;
  }

  private async sumSuccessfulEventTicketPayments(eventId: string) {
    const [eventTicketPayments, membershipTicketPayments] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          purpose: PaymentPurpose.EVENT_TICKET,
          status: PaymentStatus.SUCCESS,
          providerMetadata: {
            path: ["eventId"],
            equals: eventId
          }
        },
        _sum: {
          amountKobo: true
        }
      }),
      this.prisma.payment.findMany({
        where: {
          purpose: PaymentPurpose.MEMBERSHIP_EVENT_TICKET,
          status: PaymentStatus.SUCCESS,
          providerMetadata: {
            path: ["eventId"],
            equals: eventId
          }
        },
        select: { providerMetadata: true }
      })
    ]);

    const combinedTicketTotal = membershipTicketPayments.reduce((total, payment) => {
      const metadata = payment.providerMetadata;

      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return total;
      }

      const ticketAmountKobo = metadata.ticketAmountKobo;

      return total + (typeof ticketAmountKobo === "number" ? ticketAmountKobo : 0);
    }, 0);

    return (eventTicketPayments._sum.amountKobo ?? 0) + combinedTicketTotal;
  }

  private sortTicketTypes<T extends { name: string }>(ticketTypes: T[]) {
    return [...ticketTypes].sort((a, b) => this.getTicketTierOrder(a.name) - this.getTicketTierOrder(b.name));
  }

  private getTicketTierOrder(name: string) {
    const normalizedName = this.normalizeTicketTypeName(name);

    return EVENT_TICKET_TIER_NAMES.indexOf(normalizedName);
  }

  private normalizeTicketTypeName(name: string): TicketTierName {
    const normalized = name.trim();

    if (normalized === "General Admission") {
      return REGULAR_TICKET_NAME;
    }

    if ((EVENT_TICKET_TIER_NAMES as readonly string[]).includes(normalized)) {
      return normalized as TicketTierName;
    }

    return REGULAR_TICKET_NAME;
  }

  private async formatEvent(
    event: EventSource,
    options: { includeAdminCounts?: boolean; includeUserTickets?: boolean; ticketTypeCounts?: Map<string, TicketTypeCounts> }
  ) {
    const ticketTypeCounts = options.ticketTypeCounts ??
      (await this.getTicketTypeCounts(event.ticketTypes.map((ticketType) => ticketType.id)));
    const formattedTicketTypes = this.sortTicketTypes(event.ticketTypes).map((ticketType) => {
      const counts = ticketTypeCounts.get(ticketType.id) ?? { soldCount: 0, reservedCount: 0 };
      const activeCount = counts.soldCount + counts.reservedCount;

      return {
        id: ticketType.id,
        name: this.normalizeTicketTypeName(ticketType.name),
        priceKobo: ticketType.priceKobo,
        capacity: ticketType.capacity,
        maxTicketsPerUser: ticketType.maxTicketsPerUser,
        soldCount: counts.soldCount,
        reservedCount: counts.reservedCount,
        availableCount: Math.max(0, ticketType.capacity - activeCount)
      };
    });
    const ticketType = formattedTicketTypes[0] ?? null;
    const confirmedCount = formattedTicketTypes.reduce((total, item) => total + item.soldCount, 0);
    const activeReservationCount = formattedTicketTypes.reduce((total, item) => total + item.reservedCount, 0);
    const userTickets = options.includeUserTickets ? event.tickets : [];
    const userTicket = userTickets[0] ?? null;
    const totalPaidAmountKobo = options.includeAdminCounts ? await this.sumSuccessfulEventTicketPayments(event.id) : 0;

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      coverImage: event.coverImage,
      category: event.category,
      venue: event.venue,
      state: event.state,
      city: event.city,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
      cancellationReason: event.cancellationReason,
      cancelledAt: event.cancelledAt,
      ticketType,
      ticketTypes: formattedTicketTypes,
      ...(options.includeAdminCounts
        ? {
            attendeeCount: confirmedCount,
            reservationCount: activeReservationCount,
            totalPaidAmountKobo
          }
        : {}),
      ...(options.includeUserTickets
        ? {
            userTickets: userTickets.map((ticket) => this.formatTicket(ticket)),
            userTicket: userTicket
              ? this.formatTicket(userTicket)
              : null
          }
        : {}),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    };
  }

  private formatTicket(ticket: {
    id: string;
    code: string;
    status: TicketStatus;
    checkedInAt: Date | null;
    createdAt: Date;
    ticketType?: { id: string; name: string; priceKobo: number } | null;
  }) {
    return {
      id: ticket.id,
      code: ticket.code,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      ticketType: ticket.ticketType
        ? {
            id: ticket.ticketType.id,
            name: this.normalizeTicketTypeName(ticket.ticketType.name),
            priceKobo: ticket.ticketType.priceKobo
          }
        : null,
      createdAt: ticket.createdAt
    };
  }

  private parseDate(value: string, errorMessage: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }

  private parseOptionalDate(value: string | undefined, errorMessage: string) {
    if (!value) {
      return null;
    }

    return this.parseDate(value, errorMessage);
  }

  private assertDateOrder(startsAt: Date, endsAt: Date | null) {
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException("Event end date must be after the start date.");
    }
  }

  private assertCreatableEventStatus(status: EventStatus) {
    if (status !== EventStatus.DRAFT && status !== EventStatus.PUBLISHED) {
      throw new BadRequestException("New events can only start as draft or published.");
    }
  }

  private async assertEventStatusTransition(event: EventSource, nextStatus: EventStatus) {
    if (event.status === nextStatus) {
      return;
    }

    if (event.status === EventStatus.DRAFT) {
      if (nextStatus === EventStatus.PUBLISHED || nextStatus === EventStatus.CANCELLED) {
        return;
      }

      throw new BadRequestException("Draft events can only be published or cancelled.");
    }

    if (event.status === EventStatus.PUBLISHED) {
      if (nextStatus === EventStatus.CANCELLED) {
        return;
      }

      if (nextStatus === EventStatus.DRAFT) {
        const activeTickets = await this.countActiveTicketsForEvent(event.id);

        if (activeTickets > 0) {
          throw new BadRequestException("Published events with active tickets cannot be moved back to draft.");
        }

        if (event.startsAt <= new Date()) {
          throw new BadRequestException("Events that have already started cannot be moved back to draft.");
        }

        return;
      }
    }

    if (nextStatus === EventStatus.COMPLETED) {
      throw new BadRequestException("Events are completed automatically after they end.");
    }

    throw new BadRequestException("Cancelled or completed events cannot move to another status.");
  }

  private cleanText(value: string) {
    return value.trim();
  }

  private cleanOptionalText(value: string | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }

  private cleanCoverImage(value: string | undefined) {
    const coverImage = this.cleanOptionalText(value);

    if (!coverImage) {
      return null;
    }

    if (!this.storage.isManagedPublicUrl(coverImage, "events/")) {
      throw new BadRequestException("Event cover image must be uploaded through crushclub.");
    }

    return coverImage;
  }

  private cleanEventCategory(value: string | undefined) {
    const category = value?.trim();

    if (!category) {
      throw new BadRequestException("Choose a valid event category.");
    }

    if (!(EVENT_CATEGORY_NAMES as readonly string[]).includes(category)) {
      throw new BadRequestException("Choose a valid event category.");
    }

    return category;
  }

  private async createUniqueSlug(title: string) {
    const base = this.slugify(title);
    let slug = base;
    let suffix = 2;

    while (await this.prisma.event.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private slugify(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || `event-${Date.now()}`;
  }

  private createTicketCode() {
    return `STZTIX-${randomBytes(5).toString("hex").toUpperCase()}`;
  }
}
