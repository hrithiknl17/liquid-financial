import { serverSearchAvailable } from './ai';
import { buildChunks, ChunkSource } from './chunks';
import { accessToken } from './cloud';
import { keywordSearch, LedgerHit, SearchArgs, SearchOutcome } from './ledgerTools';

let reindexTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Tells the server this account's rows changed, so it can bring the search
 * index in line. Debounced: a burst of edits is one request. Carries no data —
 * the server reads the rows itself — and failure is harmless, because the
 * next sync asks again and the reconcile catches up.
 */
export function requestReindex(delayMs = 3_000): void {
  clearTimeout(reindexTimer);
  reindexTimer = setTimeout(() => {
    void (async () => {
      if (!(await serverSearchAvailable())) return;
      const token = await accessToken();
      if (!token) return;
      try {
        await fetch('/api/search/reindex', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        // Next sync retries.
      }
    })();
  }, delayMs);
}

/**
 * Indexed search when the server offers it and someone is signed in;
 * otherwise, or when the index has nothing yet, keyword search over the copy
 * of the ledger already in this browser.
 */
export async function searchLedger(source: ChunkSource, args: SearchArgs): Promise<SearchOutcome> {
  if (await serverSearchAvailable()) {
    const token = await accessToken();
    if (token) {
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          const { results } = (await response.json()) as { results: LedgerHit[] };
          // An empty answer usually means "not indexed yet", not "nothing there".
          if (results.length > 0) return { mode: 'indexed', hits: results };
        }
      } catch {
        // Fall through: the local copy can always be searched.
      }
    }
  }
  return { mode: 'keyword', hits: keywordSearch(buildChunks(source), args) };
}
