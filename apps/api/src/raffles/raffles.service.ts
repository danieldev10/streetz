import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventKind, EventStatus, Prisma, RaffleEntryStatus, RaffleStatus } from "@prisma/client";
import { randomBytes, randomInt } from "crypto";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateRaffleDto } from "./dto/create-raffle.dto";
import { UpdateRaffleDto } from "./dto/update-raffle.dto";

const RAFFLE_CANCELLATION_REASON_MAX_LENGTH = 500;

type RaffleEventSource = Prisma.EventGetPayload<{
  include: {
    raffleDraw: {
      include: {
        winnerEntry: {
          include: {
            user: { select: { id: true; displayName: true } };
          };
        };
      };
    };
  };
}>;

type RaffleDrawSource = NonNullable<RaffleEventSource["raffleDraw"]>;

type RaffleCounts = {
  ticketsSold: number;
  participantsCount: number;
  totalRevenueKobo: number;
};

type FormatRaffleOptions = {
  includeAdminCounts?: boolean;
  counts?: RaffleCounts;
  yourEntryCount?: number;
};

const raffleEventInclude = {
  raffleDraw: {
    include: {
      winnerEntry: {
        include: {
          user: { select: { id: true, displayName: true } }
        }
      }
    }
  }
} satisfies Prisma.EventInclude;

@Injectable()
export class RafflesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsGateway
  ) { }

  async getAdminRaffles() {
    const events = await this.prisma.event.findMany({
      where: { kind: EventKind.RAFFLE },
      include: raffleEventInclude,
      orderBy: { createdAt: "desc" }
    });

    const countsByDraw = await this.getRaffleCountsByDraw(
      events.map((event) => event.raffleDraw?.id).filter((id): id is string => Boolean(id))
    );

    return {
      raffles: events.map((event) =>
        this.formatRaffle(event, {
          includeAdminCounts: true,
          counts: event.raffleDraw ? countsByDraw.get(event.raffleDraw.id) : undefined
        })
      )
    };
  }

  async getAdminRaffle(eventId: string) {
    const event = await this.requireRaffleEvent(eventId);
    const counts = await this.getRaffleCounts(event.raffleDraw.id);

    return this.formatRaffle(event, { includeAdminCounts: true, counts });
  }

  async createRaffle(dto: CreateRaffleDto) {
    const status = dto.status ?? EventStatus.DRAFT;
    this.assertCreatableStatus(status);

    const salesStartsAt = this.parseDate(dto.salesStartsAt, "Raffle sales start date is invalid.");
    const salesEndsAt = this.parseDate(dto.salesEndsAt, "Raffle sales end date is invalid.");
    const drawsAt = this.parseDate(dto.drawsAt, "Raffle draw date is invalid.");
    this.assertRaffleDates(salesStartsAt, salesEndsAt, drawsAt);

    const event = await this.prisma.event.create({
      data: {
        title: this.cleanText(dto.title),
        slug: await this.createUniqueSlug(dto.title),
        description: this.cleanOptionalText(dto.description),
        coverImage: this.cleanImage(dto.coverImage),
        category: dto.prizeCategory?.trim() || "Raffle",
        kind: EventKind.RAFFLE,
        // Raffles are not venue-based; the columns should be satisfied with neutral values.
        venue: "Online raffle",
        state: null,
        city: "Online",
        startsAt: salesStartsAt,
        endsAt: drawsAt,
        status,
        raffleDraw: {
          create: {
            ticketPriceKobo: dto.ticketPriceKobo,
            salesStartsAt,
            salesEndsAt,
            drawsAt,
            prizeTitle: this.cleanText(dto.prizeTitle),
            prizeDescription: this.cleanOptionalText(dto.prizeDescription),
            prizeImage: this.cleanImage(dto.prizeImage),
            prizeCategory: this.cleanOptionalText(dto.prizeCategory),
            prizeEstimatedValueKobo: dto.prizeEstimatedValueKobo ?? null,
            status: RaffleStatus.SCHEDULED
          }
        }
      },
      include: raffleEventInclude
    });

    return this.formatRaffle(event, { includeAdminCounts: true });
  }

  // CRUD for Raffles. NB: Raffles are only editable while they are in draft or published state, and only if no entries have been sold yet.
  async updateRaffle(eventId: string, dto: UpdateRaffleDto) {
    const event = await this.requireRaffleEvent(eventId);
    const draw = event.raffleDraw;
    const paidEntryCount = await this.prisma.raffleEntry.count({
      where: { raffleDrawId: draw.id, status: RaffleEntryStatus.PAID }
    });
    const hasEntries = paidEntryCount > 0;

    if (draw.status === RaffleStatus.DRAWN) {
      throw new BadRequestException("A completed raffle can no longer be edited.");
    }

    const salesStartsAt = dto.salesStartsAt
      ? this.parseDate(dto.salesStartsAt, "Raffle sales start date is invalid.")
      : draw.salesStartsAt;
    const salesEndsAt = dto.salesEndsAt
      ? this.parseDate(dto.salesEndsAt, "Raffle sales end date is invalid.")
      : draw.salesEndsAt;
    const drawsAt = dto.drawsAt ? this.parseDate(dto.drawsAt, "Raffle draw date is invalid.") : draw.drawsAt;
    this.assertRaffleDates(salesStartsAt, salesEndsAt, drawsAt);

    // Once members have paid in, the price and the start of sales are locked, and
    // sales can only be extended (never shortened) to keep the draw fair.
    if (hasEntries) {
      if (dto.ticketPriceKobo !== undefined && dto.ticketPriceKobo !== draw.ticketPriceKobo) {
        throw new BadRequestException("Ticket price cannot change after entries have been sold.");
      }

      if (salesStartsAt.getTime() !== draw.salesStartsAt.getTime()) {
        throw new BadRequestException("Sales start cannot change after entries have been sold.");
      }

      if (salesEndsAt.getTime() < draw.salesEndsAt.getTime()) {
        throw new BadRequestException("Sales close can only be extended after entries have been sold.");
      }
    }

    const nextStatus = dto.status;
    if (nextStatus !== undefined) {
      this.assertStatusTransition(event.status, nextStatus, { hasEntries, salesStartsAt });
    }

    const isCancelling = nextStatus === EventStatus.CANCELLED && event.status !== EventStatus.CANCELLED;
    const cancellationReason = dto.cancellationReason !== undefined ? this.cleanOptionalText(dto.cancellationReason) : undefined;

    if (isCancelling && !cancellationReason) {
      throw new BadRequestException("A cancellation reason is required to cancel a raffle.");
    }

    if (cancellationReason && cancellationReason.length > RAFFLE_CANCELLATION_REASON_MAX_LENGTH) {
      throw new BadRequestException(`Cancellation reason must be ${RAFFLE_CANCELLATION_REASON_MAX_LENGTH} characters or fewer.`);
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: this.cleanText(dto.title) } : {}),
        ...(dto.description !== undefined ? { description: this.cleanOptionalText(dto.description) } : {}),
        ...(dto.coverImage !== undefined ? { coverImage: this.cleanImage(dto.coverImage) } : {}),
        ...(dto.prizeCategory !== undefined ? { category: dto.prizeCategory.trim() || "Raffle" } : {}),
        ...(dto.salesStartsAt !== undefined ? { startsAt: salesStartsAt } : {}),
        ...(dto.drawsAt !== undefined ? { endsAt: drawsAt } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(isCancelling ? { cancelledAt: new Date() } : {}),
        ...(cancellationReason !== undefined ? { cancellationReason } : {}),
        raffleDraw: {
          update: {
            ...(dto.ticketPriceKobo !== undefined ? { ticketPriceKobo: dto.ticketPriceKobo } : {}),
            ...(dto.salesStartsAt !== undefined ? { salesStartsAt } : {}),
            ...(dto.salesEndsAt !== undefined ? { salesEndsAt } : {}),
            ...(dto.drawsAt !== undefined ? { drawsAt } : {}),
            ...(dto.prizeTitle !== undefined ? { prizeTitle: this.cleanText(dto.prizeTitle) } : {}),
            ...(dto.prizeDescription !== undefined ? { prizeDescription: this.cleanOptionalText(dto.prizeDescription) } : {}),
            ...(dto.prizeImage !== undefined ? { prizeImage: this.cleanImage(dto.prizeImage) } : {}),
            ...(dto.prizeCategory !== undefined ? { prizeCategory: this.cleanOptionalText(dto.prizeCategory) } : {}),
            ...(dto.prizeEstimatedValueKobo !== undefined ? { prizeEstimatedValueKobo: dto.prizeEstimatedValueKobo } : {}),
            ...(isCancelling ? { status: RaffleStatus.CANCELLED } : {})
          }
        }
      },
      include: raffleEventInclude
    });

    const counts = await this.getRaffleCounts(draw.id);
    return this.formatRaffle(updated, { includeAdminCounts: true, counts });
  }

  async runDraw(adminUserId: string, eventId: string) {
    const event = await this.requireRaffleEvent(eventId);
    const draw = event.raffleDraw;
    const now = new Date();

    if (event.status === EventStatus.CANCELLED || draw.status === RaffleStatus.CANCELLED) {
      throw new BadRequestException("A cancelled raffle cannot be drawn.");
    }

    if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.COMPLETED) {
      throw new BadRequestException("Only a published raffle can be drawn.");
    }

    if (draw.status !== RaffleStatus.DRAWN && !draw.winnerEntryId && now < draw.salesEndsAt) {
      throw new BadRequestException("The draw can only run after raffle ticket sales have closed.");
    }

    const winner = await this.prisma.$transaction(async (transaction) => {
      // Serialize so two admins can't draw the same raffle twice.
      await transaction.$queryRaw`SELECT id FROM "RaffleDraw" WHERE id = ${draw.id} FOR UPDATE`;
      const fresh = await transaction.raffleDraw.findUniqueOrThrow({ where: { id: draw.id } });

      if (fresh.status === RaffleStatus.DRAWN || fresh.winnerEntryId) {
        return null; // already drawn (idempotent)
      }

      const entryCount = await transaction.raffleEntry.count({
        where: { raffleDrawId: draw.id, status: RaffleEntryStatus.PAID }
      });

      if (entryCount === 0) {
        throw new BadRequestException("This raffle has no paid entries to draw from.");
      }

      const winnerIndex = randomInt(0, entryCount);
      const winnerEntry = await transaction.raffleEntry.findFirstOrThrow({
        where: { raffleDrawId: draw.id, status: RaffleEntryStatus.PAID },
        orderBy: { number: "asc" },
        skip: winnerIndex
      });

      const drawSeed = JSON.stringify({
        method: "crypto.randomInt",
        entryCount,
        winnerIndex,
        winnerNumber: winnerEntry.number,
        token: randomBytes(8).toString("hex"),
        drawnAt: now.toISOString()
      });

      await transaction.raffleDraw.update({
        where: { id: draw.id },
        data: {
          status: RaffleStatus.DRAWN,
          winnerEntryId: winnerEntry.id,
          winnerUserId: winnerEntry.userId,
          drawnAt: now,
          drawnByAdminId: adminUserId,
          drawSeed
        }
      });

      await transaction.event.update({
        where: { id: eventId },
        data: { status: EventStatus.COMPLETED }
      });

      return winnerEntry;
    });

    if (winner) {
      // Push a live alert to the winner; non-winners learn via the normal feed.
      this.notifications.emitUserChanged(winner.userId, { source: "raffle", raffleId: eventId });
    }

    const settled = await this.requireRaffleEvent(eventId);
    return this.formatRaffle(settled, { includeAdminCounts: true, counts: await this.getRaffleCounts(draw.id) });
  }

  async getPublishedRaffles(userId: string) {
    const events = await this.prisma.event.findMany({
      where: {
        kind: EventKind.RAFFLE,
        status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] }
      },
      include: raffleEventInclude,
      orderBy: { createdAt: "desc" }
    });

    const drawIds = events.map((event) => event.raffleDraw?.id).filter((id): id is string => Boolean(id));
    const countsByDraw = await this.getRaffleCountsByDraw(drawIds);
    const yourEntryCounts = await this.getUserEntryCountsByDraw(userId, drawIds);

    return {
      raffles: events.map((event) =>
        this.formatRaffle(event, {
          counts: event.raffleDraw ? countsByDraw.get(event.raffleDraw.id) : undefined,
          yourEntryCount: event.raffleDraw ? yourEntryCounts.get(event.raffleDraw.id) ?? 0 : 0
        })
      )
    };
  }

  async getRaffle(userId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        kind: EventKind.RAFFLE,
        status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] }
      },
      include: raffleEventInclude
    });

    if (!event || !event.raffleDraw) {
      throw new NotFoundException("Raffle not found.");
    }

    const counts = await this.getRaffleCounts(event.raffleDraw.id);
    const yourEntryCount = await this.prisma.raffleEntry.count({
      where: { raffleDrawId: event.raffleDraw.id, userId, status: RaffleEntryStatus.PAID }
    });

    return this.formatRaffle(event, { counts, yourEntryCount });
  }

  async getMyEntries(userId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, kind: EventKind.RAFFLE },
      include: raffleEventInclude
    });

    if (!event || !event.raffleDraw) {
      throw new NotFoundException("Raffle not found.");
    }

    const entries = await this.prisma.raffleEntry.findMany({
      where: { raffleDrawId: event.raffleDraw.id, userId, status: RaffleEntryStatus.PAID },
      orderBy: { number: "asc" },
      select: { id: true, number: true, createdAt: true }
    });

    const isWinner = Boolean(event.raffleDraw.winnerUserId && event.raffleDraw.winnerUserId === userId);

    return {
      raffleId: event.id,
      title: event.title,
      prizeTitle: event.raffleDraw.prizeTitle,
      drawsAt: event.raffleDraw.drawsAt,
      status: this.computeEffectiveStatus(event, event.raffleDraw, new Date()),
      count: entries.length,
      isWinner,
      winningNumber: isWinner && event.raffleDraw.winnerEntry ? event.raffleDraw.winnerEntry.number : null,
      entries
    };
  }

  async getPublicRaffles() {
    const events = await this.prisma.event.findMany({
      where: { kind: EventKind.RAFFLE, status: EventStatus.PUBLISHED },
      include: raffleEventInclude,
      orderBy: { createdAt: "desc" }
    });

    const countsByDraw = await this.getRaffleCountsByDraw(
      events.map((event) => event.raffleDraw?.id).filter((id): id is string => Boolean(id))
    );

    return {
      raffles: events.map((event) =>
        this.formatRaffle(event, { counts: event.raffleDraw ? countsByDraw.get(event.raffleDraw.id) : undefined })
      )
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async requireRaffleEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: raffleEventInclude
    });

    if (!event || event.kind !== EventKind.RAFFLE || !event.raffleDraw) {
      throw new NotFoundException("Raffle not found.");
    }

    return event as RaffleEventSource & { raffleDraw: RaffleDrawSource };
  }

  private formatRaffle(event: RaffleEventSource, options: FormatRaffleOptions = {}) {
    const draw = event.raffleDraw;

    if (!draw) {
      throw new NotFoundException("Raffle configuration is missing.");
    }

    const effectiveStatus = this.computeEffectiveStatus(event, draw, new Date());
    const counts = options.counts;
    const winner =
      draw.winnerEntry && draw.winnerEntryId
        ? {
          entryId: draw.winnerEntry.id,
          number: draw.winnerEntry.number,
          userId: draw.winnerEntry.user.id,
          displayName: draw.winnerEntry.user.displayName,
          drawnAt: draw.drawnAt
        }
        : null;

    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      coverImage: event.coverImage,
      kind: event.kind,
      status: event.status,
      cancellationReason: event.cancellationReason,
      cancelledAt: event.cancelledAt,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      raffle: {
        status: effectiveStatus,
        ticketPriceKobo: draw.ticketPriceKobo,
        salesStartsAt: draw.salesStartsAt,
        salesEndsAt: draw.salesEndsAt,
        drawsAt: draw.drawsAt,
        prize: {
          title: draw.prizeTitle,
          description: draw.prizeDescription,
          image: draw.prizeImage,
          category: draw.prizeCategory,
          estimatedValueKobo: draw.prizeEstimatedValueKobo
        },
        ticketsSold: counts?.ticketsSold ?? 0,
        yourEntryCount: options.yourEntryCount ?? 0,
        winner,
        ...(options.includeAdminCounts
          ? {
            participantsCount: counts?.participantsCount ?? 0,
            totalRevenueKobo: counts?.totalRevenueKobo ?? 0,
            drawnByAdminId: draw.drawnByAdminId,
            storedStatus: draw.status
          }
          : {})
      }
    };
  }

  private computeEffectiveStatus(event: RaffleEventSource, draw: RaffleDrawSource, now: Date): RaffleStatus {
    if (event.status === EventStatus.CANCELLED || draw.status === RaffleStatus.CANCELLED) {
      return RaffleStatus.CANCELLED;
    }

    if (draw.status === RaffleStatus.DRAWN || draw.winnerEntryId) {
      return RaffleStatus.DRAWN;
    }

    if (event.status !== EventStatus.PUBLISHED) {
      return RaffleStatus.SCHEDULED;
    }

    if (now < draw.salesStartsAt) {
      return RaffleStatus.SCHEDULED;
    }

    if (now <= draw.salesEndsAt) {
      return RaffleStatus.SELLING;
    }

    return RaffleStatus.SALES_CLOSED;
  }

  private async getRaffleCounts(raffleDrawId: string): Promise<RaffleCounts> {
    return (await this.getRaffleCountsByDraw([raffleDrawId])).get(raffleDrawId) ?? {
      ticketsSold: 0,
      participantsCount: 0,
      totalRevenueKobo: 0
    };
  }

  private async getRaffleCountsByDraw(raffleDrawIds: string[]): Promise<Map<string, RaffleCounts>> {
    const result = new Map<string, RaffleCounts>();

    if (raffleDrawIds.length === 0) {
      return result;
    }

    const draws = await this.prisma.raffleDraw.findMany({
      where: { id: { in: raffleDrawIds } },
      select: { id: true, ticketPriceKobo: true }
    });
    const priceByDraw = new Map(draws.map((draw) => [draw.id, draw.ticketPriceKobo]));

    const soldGroups = await this.prisma.raffleEntry.groupBy({
      by: ["raffleDrawId"],
      where: { raffleDrawId: { in: raffleDrawIds }, status: RaffleEntryStatus.PAID },
      _count: { _all: true }
    });

    const participantGroups = await this.prisma.raffleEntry.groupBy({
      by: ["raffleDrawId", "userId"],
      where: { raffleDrawId: { in: raffleDrawIds }, status: RaffleEntryStatus.PAID }
    });
    const participantsByDraw = new Map<string, number>();
    for (const group of participantGroups) {
      participantsByDraw.set(group.raffleDrawId, (participantsByDraw.get(group.raffleDrawId) ?? 0) + 1);
    }

    for (const id of raffleDrawIds) {
      const ticketsSold = soldGroups.find((group) => group.raffleDrawId === id)?._count._all ?? 0;
      result.set(id, {
        ticketsSold,
        participantsCount: participantsByDraw.get(id) ?? 0,
        totalRevenueKobo: ticketsSold * (priceByDraw.get(id) ?? 0)
      });
    }

    return result;
  }

  private async getUserEntryCountsByDraw(userId: string, raffleDrawIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (raffleDrawIds.length === 0) {
      return result;
    }

    const groups = await this.prisma.raffleEntry.groupBy({
      by: ["raffleDrawId"],
      where: { raffleDrawId: { in: raffleDrawIds }, userId, status: RaffleEntryStatus.PAID },
      _count: { _all: true }
    });

    for (const group of groups) {
      result.set(group.raffleDrawId, group._count._all);
    }

    return result;
  }

  private assertCreatableStatus(status: EventStatus) {
    if (status !== EventStatus.DRAFT && status !== EventStatus.PUBLISHED) {
      throw new BadRequestException("New raffles can only start as draft or published.");
    }
  }

  private assertStatusTransition(
    current: EventStatus,
    next: EventStatus,
    context: { hasEntries: boolean; salesStartsAt: Date }
  ) {
    if (current === next) {
      return;
    }

    if (current === EventStatus.DRAFT) {
      if (next === EventStatus.PUBLISHED || next === EventStatus.CANCELLED) {
        return;
      }

      throw new BadRequestException("Draft raffles can only be published or cancelled.");
    }

    if (current === EventStatus.PUBLISHED) {
      if (next === EventStatus.CANCELLED) {
        return;
      }

      if (next === EventStatus.DRAFT) {
        if (context.hasEntries) {
          throw new BadRequestException("Published raffles with entries cannot move back to draft.");
        }

        if (context.salesStartsAt <= new Date()) {
          throw new BadRequestException("Raffles whose sales have started cannot move back to draft.");
        }

        return;
      }
    }

    throw new BadRequestException("This raffle status change is not allowed.");
  }

  private assertRaffleDates(salesStartsAt: Date, salesEndsAt: Date, drawsAt: Date) {
    if (salesEndsAt <= salesStartsAt) {
      throw new BadRequestException("Raffle sales must close after they open.");
    }

    if (drawsAt < salesEndsAt) {
      throw new BadRequestException("The draw must happen at or after sales close.");
    }
  }

  private parseDate(value: string, errorMessage: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }

  private cleanText(value: string) {
    return value.trim();
  }

  private cleanOptionalText(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private cleanImage(value: string | undefined) {
    const image = this.cleanOptionalText(value);

    if (!image) {
      return null;
    }

    if (!this.storage.isManagedPublicUrl(image, "events/")) {
      throw new BadRequestException("Raffle images must be uploaded through crushclub.");
    }

    return image;
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

    return slug || `raffle-${Date.now()}`;
  }
}
