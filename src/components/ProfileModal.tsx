import React, { useEffect, useRef, useState } from 'react';
import {
  AccountSummary,
  IncomeDue,
  IncomeSource,
  Investment,
  Loan,
  Settings,
  Subscription,
  Transaction,
} from '../types';
import { CURRENCY_SYMBOL, money } from '../lib/format';
import { todayISO } from '../lib/dates';
import { portfolioStats } from '../lib/finance';
import { AiStatus, aiStatus } from '../lib/ai';
import {
  notificationPermission,
  reminderCapability,
  requestNotificationPermission,
} from '../lib/reminders';
import { clearReceipts, countReceipts, exportReceipts, importReceipts, receiptsSize } from '../lib/receipts';
import { Label, ModalShell, ghostButtonClass, inputClass, primaryButtonClass } from './ui';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (next: Partial<Settings>) => void;
  summary: AccountSummary;
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  incomeDues: IncomeDue[];
  loans: Loan[];
  onOpenCategories: () => void;
  /** Null in local-only mode, which hides the account controls entirely. */
  accountEmail: string | null;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onLoadDemo: () => void;
  onResetData: () => void;
  onImport: (payload: {
    transactions?: Transaction[];
    subscriptions?: Subscription[];
    investments?: Investment[];
    incomeSources?: IncomeSource[];
    incomeDues?: IncomeDue[];
    loans?: Loan[];
    settings?: Partial<Settings>;
  }) => void;
}

const CURRENCIES: Settings['currency'][] = ['INR', 'USD', 'EUR', 'GBP'];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  summary,
  transactions,
  subscriptions,
  investments,
  incomeSources,
  incomeDues,
  loans,
  onOpenCategories,
  accountEmail,
  onSignOut,
  onDeleteAccount,
  onLoadDemo,
  onResetData,
  onImport,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [keyDraft, setKeyDraft] = useState(settings.geminiApiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [receiptStats, setReceiptStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [permission, setPermission] = useState(notificationPermission());
  const fileRef = useRef<HTMLInputElement>(null);

  const portfolio = portfolioStats(investments);
  const capability = reminderCapability();

  useEffect(() => {
    if (!isOpen) return;
    setKeyDraft(settings.geminiApiKey ?? '');
    void aiStatus(settings).then(setAi);
    void Promise.all([countReceipts(), receiptsSize()]).then(([count, bytes]) =>
      setReceiptStats({ count, bytes })
    );
  }, [isOpen, settings]);

  const handleExport = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 4,
      // The key is personal and device-scoped; it never belongs in a backup.
      settings: { ...settings, geminiApiKey: undefined },
      transactions,
      subscriptions,
      investments,
      incomeSources,
      incomeDues,
      loans,
      receipts: settings.keepReceipts ? await exportReceipts() : [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `liquid-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.transactions)) {
        throw new Error('Unrecognised backup file');
      }
      if (Array.isArray(parsed.receipts) && parsed.receipts.length > 0) {
        await importReceipts(parsed.receipts);
      }
      onImport(parsed);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file');
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Settings & Data" icon="settings" iconBg="bg-[#ede9fe]">
      <div className="space-y-4">
        <div>
          <Label>Your name</Label>
          <input
            type="text"
            value={settings.displayName}
            onChange={(e) => onUpdateSettings({ displayName: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <Label>Currency</Label>
          <div className="flex gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => onUpdateSettings({ currency: c })}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border-2 border-slate-900 transition-all cursor-pointer ${
                  settings.currency === c
                    ? 'bg-slate-900 text-white shadow-[2px_2px_0px_0px_#4f46e5]'
                    : 'bg-white text-slate-800 hover:bg-slate-50 shadow-[2px_2px_0px_0px_#0f172a]'
                }`}
              >
                {CURRENCY_SYMBOL[c]} {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Opening balance</Label>
            <input
              type="number"
              step="0.01"
              value={settings.openingBalance}
              onChange={(e) => onUpdateSettings({ openingBalance: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
          <div>
            <Label>Monthly budget</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.monthlyBudget}
              onChange={(e) => onUpdateSettings({ monthlyBudget: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-1">
          Opening balance is your cash before the first logged entry. Budget of 0 hides the burn gauge.
        </p>
      </div>

      {/* ---- Bill scanning ---- */}
      <div className="mt-6 pt-5 border-t-2 border-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-slate-900">photo_camera</span>
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">Bill scanning</h4>
        </div>

        <div
          className={`px-4 py-3 rounded-2xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] ${
            ai?.route === 'none' ? 'bg-[#fef9c3]' : 'bg-[#f0fdf4]'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">
            {ai?.route === 'proxy' ? 'Server proxy' : ai?.route === 'direct' ? 'Personal key' : 'Not configured'}
          </p>
          <p className="text-[11px] font-semibold text-slate-700 leading-relaxed">
            {ai?.detail ?? 'Checking…'}
          </p>
        </div>

        {ai?.route !== 'proxy' && (
          <div>
            <Label hint={showKey ? 'Visible' : 'Hidden'}>Gemini API key</Label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onBlur={() => onUpdateSettings({ geminiApiKey: keyDraft.trim() || undefined })}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="w-11 shrink-0 rounded-2xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">
                  {showKey ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1.5 leading-relaxed">
              Kept in this browser only and left out of backups. For a shared or public deployment, run the
              server with GEMINI_API_KEY instead so the key never reaches the browser.
            </p>
          </div>
        )}

        <label className="flex items-center gap-3 p-3.5 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.keepReceipts}
            onChange={(e) => onUpdateSettings({ keepReceipts: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 cursor-pointer"
          />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
            Keep the photo of every scanned bill
          </span>
        </label>

        {receiptStats.count > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {receiptStats.count} bill{receiptStats.count === 1 ? '' : 's'} stored •{' '}
              {(receiptStats.bytes / 1_048_576).toFixed(1)} MB
            </span>
            <button
              onClick={() => {
                void clearReceipts().then(() => setReceiptStats({ count: 0, bytes: 0 }));
              }}
              className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:underline cursor-pointer shrink-0"
            >
              Delete all bills
            </button>
          </div>
        )}
      </div>

      {/* ---- Reminders ---- */}
      <div className="mt-6 pt-5 border-t-2 border-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-slate-900">notifications</span>
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">Daily nudges</h4>
        </div>

        <label className="flex items-center gap-3 p-3.5 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.remindersEnabled}
            onChange={async (e) => {
              const on = e.target.checked;
              if (on) {
                const result = await requestNotificationPermission();
                setPermission(result);
              }
              onUpdateSettings({ remindersEnabled: on });
            }}
            className="w-5 h-5 accent-indigo-600 cursor-pointer"
          />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
            Remind me to log my spends
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Morning brief</Label>
            <input
              type="time"
              value={settings.morningBriefTime}
              onChange={(e) => onUpdateSettings({ morningBriefTime: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <Label>Evening check-in</Label>
            <input
              type="time"
              value={settings.eveningNudgeTime}
              onChange={(e) => onUpdateSettings({ eveningNudgeTime: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label>Weekly review</Label>
          <select
            value={settings.weeklyReviewDay}
            onChange={(e) => onUpdateSettings({ weeklyReviewDay: Number(e.target.value) })}
            className={inputClass}
          >
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-relaxed">
          {permission === 'denied'
            ? 'Notifications are blocked for this site. The briefs still appear on the Hub when you open the app.'
            : capability === 'background'
              ? 'Installed as an app — notifications can fire in the background.'
              : capability === 'foreground'
                ? 'Notifications fire while a tab is open. Install to the home screen for background nudges; the Hub brief always works either way.'
                : 'This browser has no notifications. The Hub brief still shows up when you open the app.'}
        </p>
      </div>

      <div className="space-y-1 my-6 text-xs font-bold text-slate-800 border-y-2 border-slate-100 py-3">
        <div className="flex justify-between py-1.5">
          <span className="text-slate-400 uppercase tracking-wider">Cash balance</span>
          <span className="font-black text-slate-900">{money(summary.cashBalance, settings.currency)}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-slate-400 uppercase tracking-wider">Portfolio</span>
          <span className="font-black text-slate-900">{money(portfolio.currentValue, settings.currency)}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-slate-400 uppercase tracking-wider">Tracked</span>
          <span className="font-black text-slate-900">
            {transactions.length} txns • {subscriptions.length} plans • {investments.length} holdings
          </span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-slate-400 uppercase tracking-wider">Storage</span>
          <span className="font-black text-emerald-600">
            {accountEmail ? 'Synced to your account' : 'This device only'}
          </span>
        </div>
      </div>

      {accountEmail && (
        <div className="mb-5 p-4 bg-white border-2 border-slate-900 rounded-2xl shadow-[3px_3px_0px_0px_#0f172a]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Signed in as</p>
          <p className="text-xs font-black text-slate-900 truncate mb-3">{accountEmail}</p>

          <div className="flex gap-2.5">
            <button onClick={onSignOut} className={`flex-1 ${ghostButtonClass}`}>
              Sign out
            </button>
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="flex-1 py-3 border-2 border-rose-300 rounded-2xl text-xs font-black uppercase tracking-wider text-rose-600 hover:border-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
            >
              Delete account
            </button>
          </div>

          {confirmDeleteAccount && (
            <div className="mt-3 p-4 bg-rose-50 border-2 border-slate-900 rounded-2xl">
              <p className="text-xs font-bold text-rose-900 leading-relaxed">
                This deletes your account and every transaction, plan, holding, rent source and loan in it.
                It cannot be undone. Export a backup first if you want a copy.
              </p>
              <div className="flex gap-2.5 mt-3">
                <button
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="flex-1 py-2.5 border-2 border-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-wider text-slate-600 hover:bg-white cursor-pointer"
                >
                  Keep my account
                </button>
                <button
                  onClick={onDeleteAccount}
                  className="flex-1 py-2.5 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider border-2 border-slate-900 cursor-pointer"
                >
                  Delete everything
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        <button
          onClick={onOpenCategories}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-slate-900 rounded-2xl shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-slate-700">sell</span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-900">Categories</span>
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Add your own
          </span>
        </button>

        <div className="flex gap-2.5">
          <button onClick={() => void handleExport()} className={`flex-1 ${ghostButtonClass}`}>
            Export backup
          </button>
          <button onClick={() => fileRef.current?.click()} className={`flex-1 ${ghostButtonClass}`}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {importError && (
          <p className="text-[11px] font-black uppercase tracking-wider text-rose-600 text-center">{importError}</p>
        )}

        <button onClick={onLoadDemo} className={`w-full ${ghostButtonClass}`}>
          Load sample data
        </button>

        {confirmReset ? (
          <div className="flex gap-2.5">
            <button onClick={() => setConfirmReset(false)} className={`flex-1 ${ghostButtonClass}`}>
              Cancel
            </button>
            <button
              onClick={() => {
                onResetData();
                setConfirmReset(false);
                onClose();
              }}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] transition-all cursor-pointer"
            >
              Erase everything
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full py-3 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-2xl border-2 border-rose-200 hover:border-rose-600 transition-colors cursor-pointer"
          >
            Clear all data
          </button>
        )}

        <button onClick={onClose} className={`w-full ${primaryButtonClass}`}>
          Done
        </button>
      </div>
    </ModalShell>
  );
};
