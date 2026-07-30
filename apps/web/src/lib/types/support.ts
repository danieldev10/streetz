export type SupportRequestStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_ON_USER"
  | "RESOLVED"
  | "CLOSED";

export type SupportRequestCategory =
  | "ACCOUNT_LOGIN"
  | "MEMBERSHIP_PAYMENT"
  | "EVENTS_TICKETS"
  | "GUEST_TICKETS"
  | "RAFFLES"
  | "PROFILE_VERIFICATION"
  | "DISCOVERY_PRIVACY"
  | "ROOMS_MESSAGES"
  | "SAFETY_REPORT"
  | "TECHNICAL"
  | "OTHER";

export type SupportPriority = "NORMAL" | "HIGH" | "URGENT";
export type SupportMessageAuthorType = "USER" | "GUEST" | "ADMIN" | "SYSTEM";

export type SupportMessage = {
  id: string;
  authorType: SupportMessageAuthorType;
  authorName: string;
  body: string;
  createdAt: string;
};

export type SupportRequestSummary = {
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
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  latestMessage: {
    body: string;
    createdAt: string;
    authorType: SupportMessageAuthorType;
  } | null;
};

export type SupportRequest = Omit<SupportRequestSummary, "latestMessage"> & {
  userAgent: string | null;
  appVersion: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: SupportMessage[];
};

export type CreateSupportResponse = {
  request: SupportRequest;
  emailSent: boolean;
};
