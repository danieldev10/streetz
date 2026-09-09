export type PaymentPurpose =
  | "SUBSCRIPTION"
  | "EVENT_TICKET"
  | "MEMBERSHIP_EVENT_TICKET";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED" | "REVERSED";
