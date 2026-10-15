/** Accept admission codes only. Never follow URLs or execute arbitrary QR data. */
export function ticketCodeFromScan(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{5,99}$/.test(code) ? code : null;
}
