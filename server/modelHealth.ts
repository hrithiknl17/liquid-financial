/**
 * A small circuit breaker for Gemini models.
 *
 * Without it, every request walked the same fallback chain from the top: a
 * default model that was overloaded (503, or a 10s+ hang) and two whose quota
 * was spent (429) each cost a round trip, and a hang could eat the whole time
 * budget before the healthy model was ever tried.
 *
 * Now a model that just failed is benched for a while — briefly for overload,
 * longer for an exhausted quota or a retired model — and healthy models are
 * tried first. Benched models are still tried last, never dropped, so a total
 * outage degrades to the old behaviour rather than to no answer.
 */

/** How long a failure benches a model, by upstream status (0 = timeout or network). */
const BENCH_MS: Record<number, number> = {
  429: 10 * 60_000, // quota spent: per-minute quotas recover, daily ones will not soon
  404: 60 * 60_000, // retired or unknown model
};
const DEFAULT_BENCH_MS = 60_000; // overload, 5xx, timeouts

const benchedUntil = new Map<string, number>();

export function recordFailure(model: string, status: number, now = Date.now()): void {
  benchedUntil.set(model, now + (BENCH_MS[status] ?? DEFAULT_BENCH_MS));
}

export function recordSuccess(model: string): void {
  benchedUntil.delete(model);
}

export function isBenched(model: string, now = Date.now()): boolean {
  return (benchedUntil.get(model) ?? 0) > now;
}

/**
 * The order to try models in: the requested one and the fallbacks, healthy
 * first (keeping their preference order), then benched ones, soonest back first.
 */
export function orderModels(requested: string, fallbacks: string[], now = Date.now()): string[] {
  const chain = [requested, ...fallbacks.filter((m) => m !== requested)];
  const healthy = chain.filter((m) => !isBenched(m, now));
  const benched = chain
    .filter((m) => isBenched(m, now))
    .sort((a, b) => (benchedUntil.get(a) ?? 0) - (benchedUntil.get(b) ?? 0));
  return [...healthy, ...benched];
}

/** For tests. */
export function resetModelHealth(): void {
  benchedUntil.clear();
}
