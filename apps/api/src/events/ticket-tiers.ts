export const TABLE_TICKET_TIER_NAMES = ["Table of 4", "Table of 5", "Table of 6", "Table of 8", "Table of 10"] as const;
export const EVENT_TICKET_TIER_NAMES = ["Early Bird", "Regular", "VIP", ...TABLE_TICKET_TIER_NAMES, "Tables"] as const;

export function getTableSize(name: string): number | null {
  return (TABLE_TICKET_TIER_NAMES as readonly string[]).includes(name) ? Number(name.slice("Table of ".length)) : null;
}
