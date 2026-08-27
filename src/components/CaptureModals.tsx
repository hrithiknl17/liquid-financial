import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Category, CustomCategory, LineItem, Settings, Transaction } from '../types';
import { CURRENCY_SYMBOL, money } from '../lib/format';
import { displayDate, todayISO } from '../lib/dates';
import { categoryNames, iconFor } from '../lib/categories';
import { uid } from '../lib/storage';
import {
  AiUnavailableError,
  ScannedBill,
  compressImage,
  fileToDataUrl,
  parseQuickAdd,
  scanBill,
  splitDataUrl,
} from '../lib/ai';
import { quickParse } from '../lib/quickparse';
import { saveReceipt } from '../lib/receipts';
import { Label, ModalShell, ghostButtonClass, inputClass, primaryButtonClass } from './ui';

type Draft = Omit<Transaction, 'id'>;

/* ======================== SCAN A BILL ======================== */

interface ScanBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  categories: CustomCategory[];
  /** A file handed over by the PWA share target, if the app was opened that way. */
  incomingFile?: File | null;
  onAddTransaction: (tx: Draft) => void;
  onOpenSettings: () => void;
}

type Stage = 'pick' | 'scanning' | 'review';

export const ScanBillModal: React.FC<ScanBillModalProps> = ({
  isOpen,
  onClose,
  settings,
  categories,
  incomingFile,
  onAddTransaction,
  onOpenSettings,
}) => {
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [scan, setScan] = useState<ScannedBill | null>(null);

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<Category>('Groceries');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStage('pick');
    setError(null);
    setNeedsKey(false);
    setScan(null);
    setImageBlob(null);
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setMerchant('');
    setAmount('');
    setDate(todayISO());
    setCategory('Groceries');
    setPaymentMethod('UPI');
    setNote('');
    setItems([]);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [items]
  );
  const enteredAmount = parseFloat(amount) || 0;
  const mismatch = items.length > 0 && Math.abs(itemsTotal - enteredAmount) > Math.max(1, enteredAmount * 0.02);

  const runScan = useCallback(
    async (file: File | Blob) => {
      setError(null);
      setNeedsKey(false);
      setStage('scanning');

      try {
        const compressed = await compressImage(file);
        setImageBlob(compressed);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(compressed);
        });

        const dataUrl = await fileToDataUrl(compressed);
        const { mimeType, base64 } = splitDataUrl(dataUrl);
        const result = await scanBill(base64, mimeType, settings, categoryNames('expense', categories));

        setScan(result);
        setMerchant(result.merchant);
        setAmount(String(result.total.toFixed(2)));
        setDate(result.date);
        setCategory(result.category);
        setPaymentMethod(result.paymentMethod);
        setNote(result.note);
        setItems(result.items);
        setStage('review');
      } catch (err) {
        if (err instanceof AiUnavailableError) setNeedsKey(true);
        setError(err instanceof Error ? err.message : 'Something went wrong reading that bill.');
        setStage('pick');
      }
    },
    [settings]
  );

  // A bill shared in from another app scans the moment the sheet opens.
  useEffect(() => {
    if (isOpen && incomingFile) void runScan(incomingFile);
  }, [isOpen, incomingFile, runScan]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const file = [...event.clipboardData.files][0];
      if (file?.type.startsWith('image/')) void runScan(file);
    },
    [runScan]
  );

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Math.abs(parseFloat(amount) || 0);
    if (!merchant.trim() || value <= 0) return;

    let receiptId: string | undefined;
    if (settings.keepReceipts && imageBlob) {
      receiptId = uid('rcpt');
      await saveReceipt(receiptId, imageBlob);
    }

    onAddTransaction({
      merchant: merchant.trim(),
      category,
      date,
      amount: -value,
      iconName: iconFor(category, categories),
      type: 'discretionary',
      note: note.trim() || undefined,
      paymentMethod,
      items: items.filter((item) => item.name.trim() && item.unitPrice > 0),
      receiptId,
      origin: 'scan',
    });
    onClose();
  };

  const confidenceLow = scan !== null && scan.confidence < 0.6;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Scan a bill" icon="photo_camera" iconBg="bg-[#e0f2fe]" wide>
      <div onPaste={handlePaste}>
        {stage === 'pick' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-8 bg-[#e0f2fe] border-2 border-slate-900 rounded-2xl shadow-[3px_3px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#0f172a] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[32px] text-slate-900">photo_camera</span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">Take a photo</span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-8 bg-white border-2 border-slate-900 rounded-2xl shadow-[3px_3px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#0f172a] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[32px] text-slate-900">upload_file</span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">Pick a file</span>
              </button>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">
              Photo, screenshot or PDF page. You can paste an image here too.
            </p>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runScan(file);
                e.target.value = '';
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runScan(file);
                e.target.value = '';
              }}
            />

            {error && (
              <div className="p-4 bg-[#ffe4e6] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
                <p className="text-xs font-black uppercase tracking-wider text-rose-900 mb-1">Scan failed</p>
                <p className="text-xs font-semibold text-slate-800 leading-relaxed">{error}</p>
                {needsKey && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className={`mt-3 w-full ${primaryButtonClass}`}
                  >
                    Add a Gemini key
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {stage === 'scanning' && (
          <div className="py-12 flex flex-col items-center gap-4">
            {previewUrl && (
              <img
                src={previewUrl}
                alt=""
                className="w-32 h-40 object-cover rounded-2xl border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a]"
              />
            )}
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">Reading the bill…</span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center max-w-xs">
              Pulling out merchant, date, total and every line item
            </p>
          </div>
        )}

        {stage === 'review' && (
          <form onSubmit={save} className="space-y-4">
            <div className="flex gap-4 items-start">
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={previewUrl}
                    alt="Scanned bill"
                    className="w-20 h-24 object-cover rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]"
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg border border-slate-900 text-[10px] font-black uppercase tracking-wider ${
                      confidenceLow ? 'bg-[#ffe4e6] text-rose-900' : 'bg-[#f0fdf4] text-emerald-900'
                    }`}
                  >
                    {Math.round((scan?.confidence ?? 0) * 100)}% confident
                  </span>
                  <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-800">
                    {items.length} item{items.length === 1 ? '' : 's'}
                  </span>
                  {settings.keepReceipts && (
                    <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-[#ede9fe] text-[10px] font-black uppercase tracking-wider text-indigo-900">
                      Bill saved
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-relaxed">
                  {confidenceLow
                    ? 'Low confidence — check the total and the lines before saving.'
                    : 'Everything below is editable. Fix anything that looks off.'}
                </p>
              </div>
            </div>

            {mismatch && (
              <div className="px-4 py-3 bg-[#fef9c3] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                  Items add to {money(itemsTotal, settings.currency)}, total says{' '}
                  {money(enteredAmount, settings.currency)}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mt-0.5">
                  Usually tax, packing or a discount. The total is what gets recorded.
                </p>
              </div>
            )}

            <div>
              <Label>Merchant</Label>
              <input
                type="text"
                required
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total ({CURRENCY_SYMBOL[settings.currency]})</Label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <Label>Date</Label>
                <input
                  type="date"
                  required
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className={inputClass}
                >
                  {categoryNames('expense', categories).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Paid with</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={inputClass}
                >
                  {['UPI', 'Debit card', 'Credit card', 'Cash', 'Bank transfer', 'Wallet', 'Other'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {items.length > 0 && (
              <div className="border-2 border-slate-900 rounded-2xl overflow-hidden shadow-[2px_2px_0px_0px_#0f172a]">
                <div className="px-4 py-2.5 bg-slate-100 border-b-2 border-slate-900 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                    Basket read from the bill
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                    {money(itemsTotal, settings.currency, 0)}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y-2 divide-slate-100 bg-white">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-2 items-center p-2.5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, { name: e.target.value })}
                        className="flex-1 min-w-0 bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: parseFloat(e.target.value) || 0 })}
                        aria-label="Quantity"
                        className="w-14 bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        aria-label="Unit price"
                        className="w-20 bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                        aria-label={`Remove ${item.name}`}
                        className="w-8 h-8 shrink-0 rounded-xl border-2 border-slate-200 hover:border-rose-600 flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Note</Label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Bill number, branch, anything worth remembering"
                className={inputClass}
              />
            </div>

            <div className="pt-3 flex gap-3">
              <button type="button" onClick={reset} className={`flex-1 ${ghostButtonClass}`}>
                Rescan
              </button>
              <button type="submit" className={`flex-1 ${primaryButtonClass}`}>
                Save entry
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
};

/* ======================== QUICK ADD ======================== */

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  categories: CustomCategory[];
  suggestions: Draft[];
  onAddMany: (entries: Draft[]) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  settings,
  categories,
  suggestions,
  onAddMany,
}) => {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setDrafts([]);
    setBusy(false);
    setNotice(null);
  }, [isOpen]);

  const parse = async () => {
    const input = text.trim();
    if (!input) return;
    setBusy(true);
    setNotice(null);

    try {
      const parsed = await parseQuickAdd(input, settings, categoryNames('expense', categories));
      if (parsed.length === 0) throw new Error('empty');
      setDrafts(parsed);
    } catch (err) {
      // Local parser keeps this usable with no key and no network.
      const fallback = quickParse(input);
      if (fallback.length > 0) {
        setDrafts(fallback);
        setNotice(
          err instanceof AiUnavailableError
            ? 'Parsed on-device. Add a Gemini key for smarter reading of dates and merchants.'
            : `Parsed on-device instead — ${
                err instanceof Error ? err.message.replace(/\.$/, '') : 'Gemini was unreachable'
              }. Check the entries.`
        );
      } else {
        setNotice('Could not find any amounts in that. Try "chai 40, auto 120".');
      }
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    if (drafts.length === 0) return;
    onAddMany(drafts);
    onClose();
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Quick add" icon="bolt" iconBg="bg-[#fef9c3]" wide>
      <div className="space-y-4">
        <div>
          <Label hint="One line, several spends">What did you spend?</Label>
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void parse();
            }}
            placeholder="chai 40, auto 120 to office, kirana 850 yesterday"
            className="w-full bg-slate-50 border-2 border-slate-900 rounded-2xl px-3.5 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a] resize-none"
          />
        </div>

        {suggestions.length > 0 && drafts.length === 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
              Your usual — tap to add
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((entry) => (
                <button
                  key={`${entry.merchant}-${entry.amount}`}
                  onClick={() => onAddMany([entry])}
                  className="px-3 py-2 rounded-xl border-2 border-slate-900 bg-white text-xs font-black text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                >
                  {entry.merchant}{' '}
                  <span className="text-slate-400">{money(Math.abs(entry.amount), settings.currency, 0)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {notice && (
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-[#fef9c3] border-2 border-slate-900 rounded-2xl px-3.5 py-2.5">
            {notice}
          </p>
        )}

        {drafts.length > 0 && (
          <div className="border-2 border-slate-900 rounded-2xl overflow-hidden shadow-[2px_2px_0px_0px_#0f172a]">
            <div className="px-4 py-2.5 bg-slate-100 border-b-2 border-slate-900 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                {drafts.length} entr{drafts.length === 1 ? 'y' : 'ies'} ready
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                {money(
                  drafts.reduce((sum, draft) => sum + Math.abs(draft.amount), 0),
                  settings.currency,
                  0
                )}
              </span>
            </div>
            <div className="divide-y-2 divide-slate-100 bg-white">
              {drafts.map((draft, index) => (
                <div key={`${draft.merchant}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-slate-100 border-2 border-slate-900 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px] font-bold">{draft.iconName}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-900 truncate">{draft.merchant}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {draft.category} • {displayDate(draft.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-black text-sm text-slate-900">
                      {draft.amount > 0 ? '+' : '-'}
                      {money(Math.abs(draft.amount), settings.currency, 0)}
                    </span>
                    <button
                      onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Drop ${draft.merchant}`}
                      className="w-7 h-7 rounded-lg border-2 border-slate-200 hover:border-rose-600 flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px] font-bold">close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {drafts.length === 0 ? (
          <div className="pt-3 flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 ${ghostButtonClass}`}>
              Cancel
            </button>
            <button onClick={() => void parse()} disabled={busy || !text.trim()} className={`flex-1 ${primaryButtonClass} disabled:opacity-40`}>
              {busy ? 'Reading…' : 'Parse'}
            </button>
          </div>
        ) : (
          <div className="pt-3 flex gap-3">
            <button type="button" onClick={() => setDrafts([])} className={`flex-1 ${ghostButtonClass}`}>
              Edit text
            </button>
            <button onClick={commit} className={`flex-1 ${primaryButtonClass}`}>
              Add {drafts.length} entr{drafts.length === 1 ? 'y' : 'ies'}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
