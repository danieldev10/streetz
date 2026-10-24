export const INDIVIDUAL_TICKET_TIER_NAMES = ["Early Bird", "Regular", "VIP"] as const;
export const TABLE_TICKET_TIER_NAMES = ["Table of 4", "Table of 5", "Table of 6", "Table of 8", "Table of 10"] as const;
// Keep historical generic Tables tickets intact; new events use explicit sizes.
export const EVENT_TICKET_TIER_NAMES = [...INDIVIDUAL_TICKET_TIER_NAMES, ...TABLE_TICKET_TIER_NAMES, "Tables"] as const;
export type EventTicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];

export function getTableSize(name: string): number | null {
  return (TABLE_TICKET_TIER_NAMES as readonly string[]).includes(name) ? Number(name.slice("Table of ".length)) : null;
}

export function isTableTicketTier(name: string) {
  return name === "Tables" || getTableSize(name) !== null;
}
