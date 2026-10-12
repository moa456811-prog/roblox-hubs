/** Honor a provider's Retry-After within the original stage deadline. */
export function capacityRetryDelay(retryAfter: string | null, nowMs: number, deadlineMs: number, dailyLimit: boolean): number | null {
  if (dailyLimit || !retryAfter) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - nowMs;
  if (!Number.isFinite(requested) || requested < 0 || requested > 60_000) return null;
  const delay = Math.max(250, requested + 250);
  return deadlineMs - nowMs > delay + 1000 ? delay : null;
}
