import { SupabaseClient } from '@supabase/supabase-js';
import { KEYS, load, save } from './storage';
import { supabase } from './cloud';

/**
 * Cloud-primary sync with an offline queue.
 *
 * The shape of the deal:
 *  - Reads come from the cloud when it answers, and from the local cache when
 *    it does not, so a plane or a dead lift still shows your numbers.
 *  - Writes go to the local cache first (instant UI), then to the cloud. A
 *    write made offline sits in a queue and is replayed on reconnect.
 *  - Nothing here merges counters, because there are none left to merge:
 *    payments and repayments are rows, so replaying a queue appends rather
 *    than overwrites. The worst case is a duplicate entry you can see and
 *    delete, never a silently wrong total.
 */

export type Collection =
  | 'transactions'
  | 'subscriptions'
  | 'investments'
  | 'income_sources'
  | 'income_dues'
  | 'loans';

interface QueuedWrite {
  id: string;
  collection: Collection;
  op: 'upsert' | 'delete';
  /** Row id for a delete, whole row for an upsert. */
  payload: Record<string, unknown> | { id: string };
  queuedAt: number;
}

const QUEUE_LIMIT = 2000;

export function pendingCount(): number {
  return load<QueuedWrite[]>(KEYS.pendingWrites, []).length;
}

function enqueue(write: Omit<QueuedWrite, 'id' | 'queuedAt'>): void {
  const queue = load<QueuedWrite[]>(KEYS.pendingWrites, []);
  queue.push({ ...write, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: Date.now() });
  // A queue this long means something is badly wrong; drop the oldest rather
  // than filling the browser's storage quota and losing everything.
  save(KEYS.pendingWrites, queue.slice(-QUEUE_LIMIT));
}

function clearQueue(): void {
  save(KEYS.pendingWrites, []);
}

/** True when we have a client, an account, and the browser thinks it is online. */
export function canReachCloud(userId: string | null): boolean {
  return Boolean(supabase && userId && navigator.onLine);
}

async function push(
  client: SupabaseClient,
  userId: string,
  write: QueuedWrite
): Promise<{ ok: boolean; error?: string }> {
  if (write.op === 'delete') {
    const { error } = await client
      .from(write.collection)
      .delete()
      .eq('user_id', userId)
      .eq('id', (write.payload as { id: string }).id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await client
    .from(write.collection)
    .upsert({ ...write.payload, user_id: userId, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Writes one row. Offline, it is queued and the caller carries on — the local
 * cache is already updated by the time this is called.
 */
export async function writeRow(
  userId: string | null,
  collection: Collection,
  row: Record<string, unknown>
): Promise<void> {
  const write: QueuedWrite = {
    id: `${Date.now()}`,
    collection,
    op: 'upsert',
    payload: row,
    queuedAt: Date.now(),
  };

  if (!supabase || !userId || !navigator.onLine) {
    enqueue(write);
    return;
  }

  const result = await push(supabase, userId, write);
  if (!result.ok) enqueue(write);
}

export async function deleteRow(
  userId: string | null,
  collection: Collection,
  id: string
): Promise<void> {
  const write: QueuedWrite = {
    id: `${Date.now()}`,
    collection,
    op: 'delete',
    payload: { id },
    queuedAt: Date.now(),
  };

  if (!supabase || !userId || !navigator.onLine) {
    enqueue(write);
    return;
  }

  const result = await push(supabase, userId, write);
  if (!result.ok) enqueue(write);
}

/**
 * Replays everything written while offline, oldest first. Anything that fails
 * again stays queued for the next attempt.
 */
export async function flushQueue(userId: string | null): Promise<{ sent: number; failed: number }> {
  if (!supabase || !userId || !navigator.onLine) return { sent: 0, failed: 0 };

  const queue = load<QueuedWrite[]>(KEYS.pendingWrites, []);
  if (queue.length === 0) return { sent: 0, failed: 0 };

  const stillPending: QueuedWrite[] = [];
  let sent = 0;

  for (const write of [...queue].sort((a, b) => a.queuedAt - b.queuedAt)) {
    const result = await push(supabase, userId, write);
    if (result.ok) sent += 1;
    else stillPending.push(write);
  }

  save(KEYS.pendingWrites, stillPending);
  return { sent, failed: stillPending.length };
}

/** Pulls a whole collection for this account. Returns null when unreachable. */
export async function pull<T>(userId: string | null, collection: Collection): Promise<T[] | null> {
  if (!canReachCloud(userId)) return null;
  const { data, error } = await supabase!.from(collection).select('*').eq('user_id', userId);
  if (error) return null;
  return (data ?? []) as T[];
}

/**
 * Moves everything in this browser into a freshly signed-in account. Used once,
 * when someone who has been running local-only decides to make an account.
 */
export async function uploadLocalData(
  userId: string,
  rows: Partial<Record<Collection, Record<string, unknown>[]>>
): Promise<{ uploaded: number; failed: number }> {
  if (!supabase) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;

  for (const [collection, list] of Object.entries(rows) as [Collection, Record<string, unknown>[]][]) {
    if (!list || list.length === 0) continue;
    const stamped = list.map((row) => ({ ...row, user_id: userId, updated_at: new Date().toISOString() }));
    // Chunked so a large ledger does not exceed the request size limit.
    for (let i = 0; i < stamped.length; i += 200) {
      const { error } = await supabase.from(collection).upsert(stamped.slice(i, i + 200));
      if (error) failed += 1;
      else uploaded += Math.min(200, stamped.length - i);
    }
  }

  return { uploaded, failed };
}

/** Fires the callback whenever the browser comes back online. */
export function onReconnect(handler: () => void): () => void {
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

export { clearQueue };
