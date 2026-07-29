export type PaymentPurpose =
  | "SUBSCRIPTION"
  | "EVENT_TICKET"
  | "MEMBERSHIP_EVENT_TICKET"
  | "RAFFLE_TICKET"
  | "MEMBERSHIP_RAFFLE_TICKET";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED" | "REVERSED";
