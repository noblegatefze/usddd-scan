export const EXPLORER_FUND_ANNUAL_RATE = 0.10;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function isNativeFundPosition(reference: string) {
  return /^FN-[0-9a-f]{24}$/i.test(reference);
}

export function nativeFundAccrued(principal: number, startedAt: string | null, now = Date.now()) {
  if (!Number.isFinite(principal) || principal <= 0 || !startedAt) return 0;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) throw new Error("Invalid Fund accrual start time");
  return Number((principal * EXPLORER_FUND_ANNUAL_RATE * Math.max(0, now - start) / YEAR_MS).toFixed(6));
}
