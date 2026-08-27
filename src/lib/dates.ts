/** All helpers work on plain ISO `YYYY-MM-DD` strings in local time. */

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = fromISO(iso);
  const targetMonth = d.getMonth() + months;
  const anchor = new Date(d.getFullYear(), targetMonth, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(d.getDate(), lastDay));
  return toISO(anchor);
}

/** Whole days from today to `iso`. Negative once the date is past. */
export function daysUntil(iso: string): number {
  const ms = fromISO(iso).getTime() - fromISO(todayISO()).getTime();
  return Math.round(ms / 86_400_000);
}

export function daysBetween(startISO: string, endISO: string): number {
  return Math.round((fromISO(endISO).getTime() - fromISO(startISO).getTime()) / 86_400_000);
}

/** "Today" / "Yesterday" / "12 Aug" / "12 Aug 2024" for older years. */
export function displayDate(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const d = fromISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Heading used to bucket the ledger: TODAY / YESTERDAY / THIS WEEK / 12 AUG. */
export function groupLabel(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return 'TODAY';
  if (diff === -1) return 'YESTERDAY';
  if (diff < -1 && diff >= -7) return 'EARLIER THIS WEEK';
  return displayDate(iso).toUpperCase();
}

/** `YYYY-MM` key used for every monthly rollup. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Rolls a renewal date forward past today, one billing period at a time.
 * Returns the new cycle window so a subscription left untouched for months
 * still shows a correct countdown.
 */
export function rollRenewal(
  cycleStart: string,
  nextRenewal: string,
  period: 'mo' | 'yr'
): { cycleStart: string; nextRenewal: string; cyclesPassed: number } {
  let start = cycleStart;
  let next = nextRenewal;
  let cyclesPassed = 0;
  const step = period === 'mo' ? 1 : 12;
  // Guard against a pathological loop on corrupt data.
  while (daysUntil(next) < 0 && cyclesPassed < 240) {
    start = next;
    next = addMonths(next, step);
    cyclesPassed++;
  }
  return { cycleStart: start, nextRenewal: next, cyclesPassed };
}

/** 0-100 progress through the current billing cycle. */
export function cycleProgress(cycleStart: string, nextRenewal: string): number {
  const total = daysBetween(cycleStart, nextRenewal);
  if (total <= 0) return 100;
  const elapsed = daysBetween(cycleStart, todayISO());
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}
