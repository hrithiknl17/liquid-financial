import { useCallback, useEffect, useRef, useState } from 'react';
import { IncomeDue, IncomeSource, Investment, Loan, Settings, Subscription, Transaction } from '../types';
import { supabase } from './cloud';
import {
  dueToRow,
  invToRow,
  loanToRow,
  rowToDue,
  rowToInv,
  rowToLoan,
  rowToSource,
  rowToSub,
  rowToTx,
  sourceToRow,
  subToRow,
  txToRow,
} from './rowmap';
import { Collection, deleteRow, flushQueue, onReconnect, pendingCount, writeRow } from './sync';

export interface CloudData {
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  incomeDues: IncomeDue[];
  loans: Loan[];
  settings?: Partial<Settings>;
}

export type SyncState = 'off' | 'loading' | 'synced' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  message?: string;
}

/** Everything the app keeps, in the order rows must be written. */
interface Snapshot {
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  incomeDues: IncomeDue[];
  loans: Loan[];
}

const MAPPERS: {
  [K in keyof Snapshot]: { table: Collection; toRow: (item: Snapshot[K][number]) => Record<string, unknown> };
} = {
  transactions: { table: 'transactions', toRow: (tx) => txToRow(tx as Transaction) },
  subscriptions: { table: 'subscriptions', toRow: (sub) => subToRow(sub as Subscription) },
  investments: { table: 'investments', toRow: (inv) => invToRow(inv as Investment) },
  incomeSources: { table: 'income_sources', toRow: (src) => sourceToRow(src as IncomeSource) },
  incomeDues: { table: 'income_dues', toRow: (due) => dueToRow(due as IncomeDue) },
  loans: { table: 'loans', toRow: (loan) => loanToRow(loan as Loan) },
};

/** Rows keyed by id, so a diff is a map comparison rather than a deep scan. */
function index(items: { id: string }[], toRow: (item: never) => Record<string, unknown>) {
  const map = new Map<string, string>();
  for (const item of items) map.set(item.id, JSON.stringify(toRow(item as never)));
  return map;
}

/**
 * Keeps an account's rows in step with the cloud.
 *
 * Pulls once on sign-in, then pushes only what actually changed, debounced so
 * a burst of edits is one round of writes. Offline, writes queue and replay on
 * reconnect — no counter merging is needed because the app stores events, not
 * totals.
 */
export function useCloudSync(userId: string | null, snapshot: Snapshot, onPulled: (data: CloudData) => void) {
  const [status, setStatus] = useState<SyncStatus>({ state: userId ? 'loading' : 'off', pending: 0 });
  /** What the cloud is believed to hold, so we can diff against it. */
  const mirrors = useRef<Partial<Record<keyof Snapshot, Map<string, string>>>>({});
  const pulled = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const pullAll = useCallback(async () => {
    if (!supabase || !userId) return;
    setStatus({ state: 'loading', pending: pendingCount() });

    try {
      const [txs, subs, invs, sources, dues, loans] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('subscriptions').select('*').eq('user_id', userId),
        supabase.from('investments').select('*').eq('user_id', userId),
        supabase.from('income_sources').select('*').eq('user_id', userId),
        supabase.from('income_dues').select('*').eq('user_id', userId),
        supabase.from('loans').select('*').eq('user_id', userId),
      ]);

      const firstError = [txs, subs, invs, sources, dues, loans].find((r) => r.error)?.error;
      if (firstError) {
        setStatus({ state: 'error', pending: pendingCount(), message: firstError.message });
        return;
      }

      const data: CloudData = {
        transactions: (txs.data ?? []).map(rowToTx).sort((a, b) => b.date.localeCompare(a.date)),
        subscriptions: (subs.data ?? []).map(rowToSub),
        investments: (invs.data ?? []).map(rowToInv),
        incomeSources: (sources.data ?? []).map(rowToSource),
        incomeDues: (dues.data ?? []).map(rowToDue),
        loans: (loans.data ?? []).map(rowToLoan),
      };

      const cloudIsEmpty =
        data.transactions.length === 0 &&
        data.subscriptions.length === 0 &&
        data.investments.length === 0 &&
        data.incomeSources.length === 0 &&
        data.loans.length === 0;

      const localHasData =
        snapshot.transactions.length > 0 ||
        snapshot.subscriptions.length > 0 ||
        snapshot.investments.length > 0 ||
        snapshot.incomeSources.length > 0 ||
        snapshot.loans.length > 0;

      // First sign-in on a browser that already had data: keep what is here and
      // let the push below upload it, rather than wiping it with an empty cloud.
      if (!(cloudIsEmpty && localHasData)) {
        onPulled(data);
        // Mirror what we just read so the first push only sends real changes.
        for (const key of Object.keys(MAPPERS) as (keyof Snapshot)[]) {
          mirrors.current[key] = index(data[key] as { id: string }[], MAPPERS[key].toRow as never);
        }
      }

      pulled.current = true;
      setStatus({ state: 'synced', pending: pendingCount() });
    } catch (error) {
      setStatus({
        state: navigator.onLine ? 'error' : 'offline',
        pending: pendingCount(),
        message: error instanceof Error ? error.message : 'Sync failed',
      });
    }
  }, [userId, onPulled, snapshot]);

  // Pull once per account.
  useEffect(() => {
    if (!userId) {
      setStatus({ state: 'off', pending: 0 });
      pulled.current = false;
      mirrors.current = {};
      return;
    }
    void pullAll();
    // pullAll changes with every snapshot; the pull is intentionally once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Push whatever changed, debounced.
  useEffect(() => {
    if (!userId || !pulled.current) return;

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void (async () => {
        let wrote = 0;

        for (const key of Object.keys(MAPPERS) as (keyof Snapshot)[]) {
          const { table, toRow } = MAPPERS[key];
          const next = index(snapshot[key] as { id: string }[], toRow as never);
          const previous = mirrors.current[key] ?? new Map<string, string>();

          for (const [id, serialised] of next) {
            if (previous.get(id) === serialised) continue;
            await writeRow(userId, table, JSON.parse(serialised) as Record<string, unknown>);
            wrote += 1;
          }
          for (const id of previous.keys()) {
            if (next.has(id)) continue;
            await deleteRow(userId, table, id);
            wrote += 1;
          }

          mirrors.current[key] = next;
        }

        if (wrote > 0) {
          setStatus({
            state: navigator.onLine ? 'synced' : 'offline',
            pending: pendingCount(),
          });
        }
      })();
    }, 900);

    return () => window.clearTimeout(timer.current);
  }, [userId, snapshot]);

  // Replay anything written while offline.
  useEffect(() => {
    if (!userId) return;
    const replay = () => {
      void flushQueue(userId).then(({ sent }) => {
        if (sent > 0) setStatus({ state: 'synced', pending: pendingCount() });
      });
    };
    replay();
    return onReconnect(replay);
  }, [userId]);

  return { status, resync: pullAll };
}
