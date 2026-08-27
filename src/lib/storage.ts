/**
 * Versioned local persistence. The v1 demo shipped a different transaction
 * shape (hardcoded `dateGroup` strings), so v2 uses its own key namespace
 * rather than trying to migrate showcase data.
 */
const PREFIX = 'liquid_v2_';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failure: the app keeps working in memory.
  }
}

export function clearAll(keys: string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

export const KEYS = {
  transactions: 'transactions',
  subscriptions: 'subscriptions',
  investments: 'investments',
  settings: 'settings',
  seeded: 'seeded',
  dismissedSignals: 'dismissed_signals',
  incomeSources: 'income_sources',
  incomeDues: 'income_dues',
  loans: 'loans',
  chat: 'agent_chat',
  countersMigrated: 'counters_migrated',
  localOnly: 'local_only',
  pendingWrites: 'pending_writes',
} as const;

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
