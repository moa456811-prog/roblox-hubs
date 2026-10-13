/** Honor a provider's Retry-After within the original stage deadline. */
export function capacityRetryDelay(retryAfter: string | null, nowMs: number, deadlineMs: number, dailyLimit: boolean): number | null {
  if (dailyLimit || !retryAfter) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - nowMs;
  if (!Number.isFinite(requested) || requested < 0 || requested > 60_000) return null;
  const delay = Math.max(250, requested + 250);
  return deadlineMs - nowMs > delay + 1000 ? delay : null;
}

/** Parse an explicit reset instant, never infer a daily reset or treat a duration as one. */
export function parseProviderResetAt(value: string | null, nowMs: number): number | undefined {
  if (!value || !Number.isFinite(nowMs)) return undefined;
  const header = value.trim();
  let resetAtMs: number;
  if (/^\d+(?:\.\d+)?$/.test(header)) {
    const epoch = Number(header);
    resetAtMs = epoch >= 1e12 ? epoch : epoch * 1000;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(header)) {
    // Date.parse normalizes dates such as February 30 instead of rejecting them.
    const [year, month, day] = header.slice(0, 10).split("-").map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!daysInMonth || day < 1 || day > daysInMonth) return undefined;
    resetAtMs = Date.parse(header);
  } else {
    return undefined;
  }
  return Number.isFinite(resetAtMs) && resetAtMs > nowMs ? resetAtMs : undefined;
}
