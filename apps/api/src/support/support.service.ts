import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  SupportMessageAuthorType,
  SupportPriority,
  SupportRequestCategory,
  SupportRequestStatus
} from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminReplySupportRequestDto, AdminSupportListDto, UpdateSupportRequestDto } from "./dto/admin-support.dto";
import { CreateGuestSupportRequestDto, CreateSupportRequestDto } from "./dto/create-support-request.dto";
import { getInitialSupportPriority } from "./support-policy";

const MANAGE_LINK_DAYS = 180;
const requestInclude = {
  user: {
    select: {
      id: true,
      displayName: true,
      email: true
    }
  },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: {
      authorUser: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  }
} satisfies Prisma.SupportRequestInclude;

type SupportRequestWithMessages = Prisma.SupportRequestGetPayload<{ include: typeof requestInclude }>;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService
  ) {}

  async createGuestRequest(dto: CreateGuestSupportRequestDto) {
    return this.createRequest({
      dto,
      email: dto.email,
      displayName: dto.displayName,
      userId: null,
      authorType: SupportMessageAuthorType.GUEST
    });
  }

  async createMemberRequest(userId: string, dto: CreateSupportRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true }
    });

    if (!user) {
      throw new NotFoundException("Account not found.");
    }

    return this.createRequest({
      dto,
      email: user.email,
      displayName: user.displayName,
      userId: user.id,
      authorType: SupportMessageAuthorType.USER
    });
  }

  async listMemberRequests(userId: string) {
    const requests = await this.prisma.supportRequest.findMany({
      where: { userId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true, authorType: true }
        }
      }
    });

    return requests.map((request) => this.formatSummary(request));
  }

  async getMemberRequest(userId: string, requestId: string) {
    const request = await this.prisma.supportRequest.findFirst({
      where: { id: requestId, userId },
      include: requestInclude
    });

    if (!request) {
      throw new NotFoundException("Support request not found.");
    }

    return this.formatRequest(request);
  }

  async replyAsMember(userId: string, requestId: string, body: string) {
    const request = await this.prisma.supportRequest.findFirst({
      where: { id: requestId, userId },
      select: { id: true, status: true }
    });

    if (!request) {
      throw new NotFoundException("Support request not found.");
    }

    await this.assertCanReply(request.status);

    const updated = await this.prisma.supportRequest.update({
      where: { id: request.id },
      data: {
        status: SupportRequestStatus.OPEN,
        resolvedAt: null,
        closedAt: null,
        lastMessageAt: new Date(),
        messages: {
          create: {
            authorType: SupportMessageAuthorType.USER,
            authorUserId: userId,
            body: body.trim()
          }
        }
      },
      include: requestInclude
    });

    return this.formatRequest(updated);
  }

  async getGuestRequest(requestId: string, token: string | undefined) {
    const request = await this.findManagedGuestRequest(requestId, token);
    return this.formatRequest(request);
  }

  async replyAsGuest(requestId: string, token: string | undefined, body: string) {
    const request = await this.findManagedGuestRequest(requestId, token);
    await this.assertCanReply(request.status);

    const updated = await this.prisma.supportRequest.update({
      where: { id: request.id },
      data: {
        status: SupportRequestStatus.OPEN,
        resolvedAt: null,
        closedAt: null,
        lastMessageAt: new Date(),
        messages: {
          create: {
            authorType: SupportMessageAuthorType.GUEST,
            body: body.trim()
          }
        }
      },
      include: requestInclude
    });

    return this.formatRequest(updated);
  }

  async listAdminRequests(filters: AdminSupportListDto) {
    const requests = await this.prisma.supportRequest.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.priority ? { priority: filters.priority } : {})
      },
      orderBy: [
        { priority: "desc" },
        { lastMessageAt: "desc" }
      ],
      take: 200,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true, authorType: true }
        }
      }
    });

    return requests.map((request) => this.formatSummary(request));
  }

  async getAdminRequest(requestId: string) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      include: requestInclude
    });

    if (!request) {
      throw new NotFoundException("Support request not found.");
    }

    return this.formatRequest(request);
  }

  async replyAsAdmin(adminId: string, requestId: string, dto: AdminReplySupportRequestDto) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        email: true,
        displayName: true,
        reference: true,
        subject: true,
        status: true
      }
    });

    if (!request) {
      throw new NotFoundException("Support request not found.");
    }

    if (request.status === SupportRequestStatus.CLOSED) {
      throw new ConflictException("Reopen this request before replying.");
    }

    const status = dto.status ?? SupportRequestStatus.WAITING_ON_USER;
    const now = new Date();
    const updated = await this.prisma.supportRequest.update({
      where: { id: request.id },
      data: {
        status,
        resolvedAt: status === SupportRequestStatus.RESOLVED ? now : null,
        closedAt: status === SupportRequestStatus.CLOSED ? now : null,
        lastMessageAt: now,
        messages: {
          create: {
            authorType: SupportMessageAuthorType.ADMIN,
            authorUserId: adminId,
            body: dto.message.trim()
          }
        }
      },
      include: requestInclude
    });

    const supportUrl = request.userId ? `${this.getWebAppUrl()}/support` : null;

    await this.mail.sendSupportReplyEmail({
      to: request.email,
      displayName: request.displayName,
      reference: request.reference,
      subject: request.subject,
      message: dto.message.trim(),
      supportUrl
    }).catch(() => false);

    return this.formatRequest(updated);
  }

  async updateAdminRequest(requestId: string, dto: UpdateSupportRequestDto) {
    if (!dto.status && !dto.priority) {
      throw new BadRequestException("Choose a status or priority to update.");
    }

    const existing = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      select: { id: true }
    });

    if (!existing) {
      throw new NotFoundException("Support request not found.");
    }

    const now = new Date();
    const request = await this.prisma.supportRequest.update({
      where: { id: requestId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.status
          ? {
              resolvedAt: dto.status === SupportRequestStatus.RESOLVED ? now : null,
              closedAt: dto.status === SupportRequestStatus.CLOSED ? now : null
            }
          : {})
      },
      include: requestInclude
    });

    return this.formatRequest(request);
  }

  private async createRequest(input: {
    dto: CreateSupportRequestDto;
    email: string;
    displayName: string;
    userId: string | null;
    authorType: SupportMessageAuthorType;
  }) {
    const manageToken = randomBytes(48).toString("base64url");
    const now = new Date();
    const request = await this.prisma.supportRequest.create({
      data: {
        reference: this.createReference(),
        userId: input.userId,
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        category: input.dto.category,
        subject: input.dto.subject.trim(),
        priority: getInitialSupportPriority(input.dto.category),
        manageTokenHash: this.hashManageToken(manageToken),
        manageTokenExpiresAt: this.createManageTokenExpiry(now),
        currentPage: input.dto.currentPage?.trim() || null,
        userAgent: input.dto.userAgent?.trim() || null,
        appVersion: input.dto.appVersion?.trim() || null,
        lastMessageAt: now,
        messages: {
          create: {
            authorType: input.authorType,
            authorUserId: input.userId,
            body: input.dto.message.trim()
          }
        }
      },
      include: requestInclude
    });

    const supportUrl = input.userId
      ? `${this.getWebAppUrl()}/support`
      : this.createManageUrl(request.id, manageToken);
    const emailSent = await this.mail.sendSupportRequestReceivedEmail({
      to: request.email,
      displayName: request.displayName,
      reference: request.reference,
      subject: request.subject,
      supportUrl
    }).catch(() => false);

    return {
      request: this.formatRequest(request),
      emailSent
    };
  }

  private async findManagedGuestRequest(requestId: string, token: string | undefined) {
    if (!token?.trim()) {
      throw new NotFoundException("Support request not found.");
    }

    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      include: requestInclude
    });

    if (
      !request ||
      request.userId ||
      request.manageTokenExpiresAt <= new Date() ||
      !this.matchesManageToken(token, request.manageTokenHash)
    ) {
      throw new NotFoundException("Support request not found.");
    }

    return request;
  }

  private formatSummary(request: {
    id: string;
    reference: string;
    category: SupportRequestCategory;
    subject: string;
    status: SupportRequestStatus;
    priority: SupportPriority;
    email: string;
    displayName: string;
    userId: string | null;
    currentPage: string | null;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{ body: string; createdAt: Date; authorType: SupportMessageAuthorType }>;
  }) {
    return {
      id: request.id,
      reference: request.reference,
      category: request.category,
      subject: request.subject,
      status: request.status,
      priority: request.priority,
      email: request.email,
      displayName: request.displayName,
      userId: request.userId,
      currentPage: request.currentPage,
      lastMessageAt: request.lastMessageAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      latestMessage: request.messages[0] ?? null
    };
  }

  private formatRequest(request: SupportRequestWithMessages) {
    return {
      id: request.id,
      reference: request.reference,
      category: request.category,
      subject: request.subject,
      status: request.status,
      priority: request.priority,
      email: request.email,
      displayName: request.displayName,
      userId: request.userId,
      currentPage: request.currentPage,
      userAgent: request.userAgent,
      appVersion: request.appVersion,
      lastMessageAt: request.lastMessageAt,
      resolvedAt: request.resolvedAt,
      closedAt: request.closedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      messages: request.messages.map((message) => ({
        id: message.id,
        authorType: message.authorType,
        authorName: message.authorType === SupportMessageAuthorType.ADMIN
          ? "Crushclub Support"
          : message.authorUser?.displayName ?? request.displayName,
        body: message.body,
        createdAt: message.createdAt
      }))
    };
  }

  private async assertCanReply(status: SupportRequestStatus) {
    if (status === SupportRequestStatus.CLOSED) {
      throw new ConflictException("This support request is closed.");
    }
  }

  private createReference() {
    return `CC-${randomBytes(5).toString("hex").toUpperCase()}`;
  }

  private createManageTokenExpiry(from: Date) {
    return new Date(from.getTime() + MANAGE_LINK_DAYS * 24 * 60 * 60 * 1_000);
  }

  private hashManageToken(token: string) {
    return createHmac("sha256", this.getSecret()).update(`support:${token.trim()}`).digest("hex");
  }

  private matchesManageToken(token: string, storedHash: string) {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(this.hashManageToken(token), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private createManageUrl(requestId: string, token: string) {
    return `${this.getWebAppUrl()}/support/requests/${encodeURIComponent(requestId)}?token=${encodeURIComponent(token)}`;
  }

  private getWebAppUrl() {
    return this.config.getOrThrow<string>("WEB_APP_URL").replace(/\/+$/, "");
  }

  private getSecret() {
    return this.config.get<string>("GUEST_TICKET_SECRET") ??
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }
}
