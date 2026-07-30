import type { SupportRequestCategory, SupportRequestStatus } from "@/lib/types";

export const supportCategories: Array<{
  id: SupportRequestCategory;
  label: string;
  description: string;
}> = [
  { id: "ACCOUNT_LOGIN", label: "Account & login", description: "Login, password, account status or access." },
  { id: "MEMBERSHIP_PAYMENT", label: "Membership & payment", description: "Subscriptions, charges or payment verification." },
  { id: "EVENTS_TICKETS", label: "Events & tickets", description: "Bookings, ticket codes, check-in or event changes." },
  { id: "GUEST_TICKETS", label: "Guest tickets", description: "Free guest bookings and private ticket links." },
  { id: "RAFFLES", label: "Raffles", description: "Entries, payments, draws or prizes." },
  { id: "PROFILE_VERIFICATION", label: "Profile & verification", description: "Profile details, photos or face verification." },
  { id: "DISCOVERY_PRIVACY", label: "Discovery & privacy", description: "Who you see, preferences, blocks or privacy." },
  { id: "ROOMS_MESSAGES", label: "Rooms & messages", description: "Rooms, matches, chat delivery, GIFs or moderation." },
  { id: "SAFETY_REPORT", label: "Safety concern", description: "Harassment, threats, impersonation or urgent safety issues." },
  { id: "TECHNICAL", label: "Technical problem", description: "Errors, loading problems or unexpected behaviour." },
  { id: "OTHER", label: "Something else", description: "Anything that does not fit the categories above." },
];

export const supportFaqs = [
  {
    question: "Where can I find my event tickets?",
    answer: "Open Events, then Tickets. Guest tickets are available through the private link sent to the booking email."
  },
  {
    question: "Why is my payment still pending?",
    answer: "Payment confirmation can take a short moment. Do not pay twice. Refresh once, then send us the Paystack reference if it remains pending."
  },
  {
    question: "How do I change who appears in Discovery?",
    answer: "Open Profile, then Discovery preferences. Your age range and who you would like to meet are applied mutually."
  },
  {
    question: "How do I block or report someone?",
    answer: "Open the person’s profile or chat menu and choose Block or Report. Blocking immediately removes direct interaction."
  },
  {
    question: "Can I recover a guest ticket link?",
    answer: "Yes. Send a support request from the same email used for the booking and include the event name."
  },
  {
    question: "How do I delete or deactivate my account?",
    answer: "Open Profile and use the account controls. Deactivation is reversible; deletion permanently removes the account."
  }
] as const;

export const supportStatusLabels: Record<SupportRequestStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_ON_USER: "Waiting on you",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

export function getSupportCategoryLabel(category: SupportRequestCategory) {
  return supportCategories.find((item) => item.id === category)?.label ?? category;
}
