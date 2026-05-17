import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, Prisma, SubscriptionStatus, TicketStatus, UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { PresignEventImageDto } from "./dto/presign-event-image.dto";
import { UpdateEventDto } from "./dto/update-event.dto";

const ACTIVE_TICKET_STATUSES = [TicketStatus.RESERVED, TicketStatus.PAID, TicketStatus.CHECKED_IN];
const CONFIRMED_TICKET_STATUSES = [TicketStatus.PAID, TicketStatus.CHECKED_IN];
const EVENT_IMAGE_UPLOAD_EXPIRES_SECONDS = 300;
const GENERAL_ADMISSION_TICKET_NAME = "General Admission";

const contentTypeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

type EventSource = Prisma.EventGetPayload<{
  include: {
    ticketTypes: true;
    tickets: true;
  };
}>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getAdminEvents() {
    const events = await this.prisma.event.findMany({
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: true
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

    const priceKobo = dto.priceKobo ?? 0;

    const event = await this.prisma.event.create({
      data: {
        title: this.cleanText(dto.title),
        slug: await this.createUniqueSlug(dto.title),
        description: this.cleanOptionalText(dto.description),
        coverImage: this.cleanOptionalText(dto.coverImage),
        venue: this.cleanText(dto.venue),
        city: this.cleanText(dto.city),
        startsAt,
        endsAt,
        status: dto.status ?? EventStatus.DRAFT,
        ticketTypes: {
          create: {
            name: GENERAL_ADMISSION_TICKET_NAME,
            priceKobo,
            capacity: dto.capacity
          }
        }
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: true
      }
    });

    return this.formatEvent(event, { includeAdminCounts: true });
  }

  async createEventImageUpload(adminUserId: string, dto: PresignEventImageDto) {
    const extension = contentTypeExtensions[dto.contentType];

    if (!extension) {
      throw new BadRequestException("Only JPG, PNG, and WebP event images are supported.");
    }

    const objectKey = `events/${adminUserId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;

    return {
      uploadUrl: await this.storage.createUploadUrl(objectKey, dto.contentType, EVENT_IMAGE_UPLOAD_EXPIRES_SECONDS),
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
        tickets: true
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    const startsAt = dto.startsAt ? this.parseDate(dto.startsAt, "Event start date is invalid.") : undefined;
    const endsAt = dto.endsAt !== undefined ? this.parseOptionalDate(dto.endsAt, "Event end date is invalid.") : undefined;
    this.assertDateOrder(startsAt ?? event.startsAt, endsAt === undefined ? event.endsAt : endsAt);

    const ticketType = event.ticketTypes[0];

    if (!ticketType) {
      throw new BadRequestException("Event ticket type is missing.");
    }

    if (dto.capacity !== undefined) {
      const activeTickets = await this.countActiveTickets(ticketType.id);

      if (dto.capacity < activeTickets) {
        throw new BadRequestException("Capacity cannot be lower than existing reservations.");
      }
    }

    const updatedEvent = await this.prisma.$transaction(async (transaction) => {
      await transaction.ticketType.update({
        where: { id: ticketType.id },
        data: {
          name: GENERAL_ADMISSION_TICKET_NAME,
          ...(dto.priceKobo !== undefined ? { priceKobo: dto.priceKobo } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {})
        }
      });

      return transaction.event.update({
        where: { id: eventId },
        data: {
          ...(dto.title !== undefined ? { title: this.cleanText(dto.title) } : {}),
          ...(dto.description !== undefined ? { description: this.cleanOptionalText(dto.description) } : {}),
          ...(dto.coverImage !== undefined ? { coverImage: this.cleanOptionalText(dto.coverImage) } : {}),
          ...(dto.venue !== undefined ? { venue: this.cleanText(dto.venue) } : {}),
          ...(dto.city !== undefined ? { city: this.cleanText(dto.city) } : {}),
          ...(startsAt !== undefined ? { startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {})
        },
        include: {
          ticketTypes: { orderBy: { createdAt: "asc" } },
          tickets: true
        }
      });
    });

    return this.formatEvent(updatedEvent, { includeAdminCounts: true });
  }

  async getPublishedEvents(userId: string) {
    await this.ensureMemberOrAdmin(userId);

    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: ACTIVE_TICKET_STATUSES }
          },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }]
    });

    return {
      events: await Promise.all(events.map((event) => this.formatEvent(event, { includeUserTicket: true })))
    };
  }

  async bookFreeEvent(userId: string, eventId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("Admins manage events but cannot book tickets.");
    }

    const event = await this.findPublishedEvent(eventId);
    const ticketType = event.ticketTypes[0];

    if (!ticketType) {
      throw new BadRequestException("Event ticket type is missing.");
    }

    if (ticketType.priceKobo > 0) {
      throw new BadRequestException("This event requires a paid ticket.");
    }

    const existingTicket = await this.findUserActiveTicket(userId, eventId);

    if (existingTicket) {
      return this.getPublishedEventForUser(userId, eventId);
    }

    const activeTickets = await this.countActiveTickets(ticketType.id);

    if (activeTickets >= ticketType.capacity) {
      throw new BadRequestException("This event is sold out.");
    }

    await this.prisma.$transaction([
      this.prisma.ticket.create({
        data: {
          eventId,
          userId,
          ticketTypeId: ticketType.id,
          code: this.createTicketCode(),
          status: TicketStatus.PAID
        }
      }),
      this.prisma.ticketType.update({
        where: { id: ticketType.id },
        data: { soldCount: { increment: 1 } }
      })
    ]);

    return this.getPublishedEventForUser(userId, eventId);
  }

  private async getPublishedEventForUser(userId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: EventStatus.PUBLISHED
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: {
          where: {
            userId,
            status: { in: ACTIVE_TICKET_STATUSES }
          },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    return this.formatEvent(event, { includeUserTicket: true });
  }

  private async findPublishedEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: EventStatus.PUBLISHED
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } },
        tickets: true
      }
    });

    if (!event) {
      throw new NotFoundException("Event not found.");
    }

    return event;
  }

  private async ensureMemberOrAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
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

  private async findUserActiveTicket(userId: string, eventId: string) {
    return this.prisma.ticket.findFirst({
      where: {
        userId,
        eventId,
        status: { in: ACTIVE_TICKET_STATUSES }
      }
    });
  }

  private async countActiveTickets(ticketTypeId: string) {
    return this.prisma.ticket.count({
      where: {
        ticketTypeId,
        status: { in: ACTIVE_TICKET_STATUSES }
      }
    });
  }

  private async countConfirmedTickets(ticketTypeId: string) {
    return this.prisma.ticket.count({
      where: {
        ticketTypeId,
        status: { in: CONFIRMED_TICKET_STATUSES }
      }
    });
  }

  private async formatEvent(event: EventSource, options: { includeAdminCounts?: boolean; includeUserTicket?: boolean }) {
    const ticketType = event.ticketTypes[0] ?? null;
    const activeCount = ticketType ? await this.countActiveTickets(ticketType.id) : 0;
    const confirmedCount = ticketType ? await this.countConfirmedTickets(ticketType.id) : 0;
    const userTicket = options.includeUserTicket ? event.tickets[0] ?? null : null;

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      coverImage: event.coverImage,
      venue: event.venue,
      city: event.city,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
      ticketType: ticketType
        ? {
            id: ticketType.id,
            name: ticketType.name,
            priceKobo: ticketType.priceKobo,
            capacity: ticketType.capacity,
            soldCount: confirmedCount,
            reservedCount: activeCount,
            availableCount: Math.max(0, ticketType.capacity - activeCount)
          }
        : null,
      ...(options.includeAdminCounts
        ? {
            attendeeCount: confirmedCount,
            reservationCount: activeCount
          }
        : {}),
      ...(options.includeUserTicket
        ? {
            userTicket: userTicket
              ? {
                  id: userTicket.id,
                  code: userTicket.code,
                  status: userTicket.status,
                  createdAt: userTicket.createdAt
                }
              : null
          }
        : {}),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
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

  private cleanText(value: string) {
    return value.trim();
  }

  private cleanOptionalText(value: string | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
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
