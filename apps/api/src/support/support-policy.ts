import { SupportPriority, SupportRequestCategory } from "@prisma/client";

export function getInitialSupportPriority(category: SupportRequestCategory) {
  if (category === SupportRequestCategory.SAFETY_REPORT) {
    return SupportPriority.URGENT;
  }

  if (
    category === SupportRequestCategory.MEMBERSHIP_PAYMENT ||
    category === SupportRequestCategory.EVENTS_TICKETS ||
    category === SupportRequestCategory.GUEST_TICKETS
  ) {
    return SupportPriority.HIGH;
  }

  return SupportPriority.NORMAL;
}
