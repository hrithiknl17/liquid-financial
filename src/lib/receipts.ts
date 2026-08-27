/**
 * Local store for scanned bill images.
 *
 * IndexedDB holds the blobs so a bill survives reloads, works offline and
 * costs nothing to set up. `ReceiptSync` is the seam where a remote archive
 * (Google Drive, once a client ID exists) plugs in without touching callers:
 * the app always writes locally first, then hands the blob to the sync target.
 */

const DB_NAME = 'liquid-receipts';
const DB_VERSION = 1;
const STORE = 'receipts';

export interface ReceiptRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
  transactionId?: string;
  /** Set once a sync target has a copy, e.g. a Drive file id. */
  remoteId?: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      })
  );
}

/** Optional remote archive. Registered at startup; absent by default. */
export interface ReceiptSync {
  name: string;
  upload(record: ReceiptRecord): Promise<string | null>;
  remove?(remoteId: string): Promise<void>;
}

let syncTarget: ReceiptSync | null = null;

export function registerReceiptSync(target: ReceiptSync | null): void {
  syncTarget = target;
}

export function receiptSyncName(): string | null {
  return syncTarget?.name ?? null;
}

export async function saveReceipt(id: string, blob: Blob, transactionId?: string): Promise<void> {
  const record: ReceiptRecord = {
    id,
    blob,
    mimeType: blob.type || 'image/jpeg',
    capturedAt: new Date().toISOString(),
    transactionId,
  };
  await tx('readwrite', (store) => store.put(record));

  if (syncTarget) {
    // Best effort: a failed upload never blocks the local save.
    void syncTarget
      .upload(record)
      .then((remoteId) => {
        if (remoteId) void tx('readwrite', (store) => store.put({ ...record, remoteId }));
      })
      .catch(() => undefined);
  }
}

export async function getReceipt(id: string): Promise<ReceiptRecord | null> {
  return (await tx<ReceiptRecord>('readonly', (store) => store.get(id))) ?? null;
}

/** Object URL for display. Callers must revoke it when the view closes. */
export async function getReceiptUrl(id: string): Promise<string | null> {
  const record = await getReceipt(id);
  return record ? URL.createObjectURL(record.blob) : null;
}

export async function deleteReceipt(id: string): Promise<void> {
  const record = await getReceipt(id);
  await tx('readwrite', (store) => store.delete(id));
  if (record?.remoteId && syncTarget?.remove) {
    void syncTarget.remove(record.remoteId).catch(() => undefined);
  }
}

export async function attachTransaction(receiptId: string, transactionId: string): Promise<void> {
  const record = await getReceipt(receiptId);
  if (!record) return;
  await tx('readwrite', (store) => store.put({ ...record, transactionId }));
}

export async function countReceipts(): Promise<number> {
  return (await tx<number>('readonly', (store) => store.count())) ?? 0;
}

/** Rough footprint, so Settings can show what the bills are costing in storage. */
export async function receiptsSize(): Promise<number> {
  const all = await tx<ReceiptRecord[]>('readonly', (store) => store.getAll());
  return (all ?? []).reduce((sum, record) => sum + (record.blob?.size ?? 0), 0);
}

/** Base64 payloads for the JSON backup, so exported bills can be restored. */
export async function exportReceipts(): Promise<{ id: string; mimeType: string; capturedAt: string; data: string }[]> {
  const all = (await tx<ReceiptRecord[]>('readonly', (store) => store.getAll())) ?? [];
  return Promise.all(
    all.map(
      (record) =>
        new Promise<{ id: string; mimeType: string; capturedAt: string; data: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: record.id,
              mimeType: record.mimeType,
              capturedAt: record.capturedAt,
              data: String(reader.result).split(',')[1] ?? '',
            });
          reader.onerror = () =>
            resolve({ id: record.id, mimeType: record.mimeType, capturedAt: record.capturedAt, data: '' });
          reader.readAsDataURL(record.blob);
        })
    )
  );
}

export async function importReceipts(
  entries: { id: string; mimeType: string; capturedAt?: string; data: string }[]
): Promise<void> {
  for (const entry of entries) {
    if (!entry.data) continue;
    const bytes = Uint8Array.from(atob(entry.data), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: entry.mimeType || 'image/jpeg' });
    await tx('readwrite', (store) =>
      store.put({
        id: entry.id,
        blob,
        mimeType: entry.mimeType || 'image/jpeg',
        capturedAt: entry.capturedAt ?? new Date().toISOString(),
      } satisfies ReceiptRecord)
    );
  }
}

export async function clearReceipts(): Promise<void> {
  await tx('readwrite', (store) => store.clear());
}
