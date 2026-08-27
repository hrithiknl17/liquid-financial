import React, { useEffect, useState } from 'react';
import { Brief, Settings, Signal } from '../types';
import { SafeToSpend } from '../lib/insights';
import { money, moneyParts } from '../lib/format';

const TONE_BG: Record<Signal['tone'], string> = {
  good: 'bg-[#f0fdf4]',
  warn: 'bg-[#ffe4e6]',
  info: 'bg-[#e0f2fe]',
};

/* ======================== DAILY BRIEF ======================== */

export const BriefBanner: React.FC<{
  brief: Brief;
  onDismiss: () => void;
  onLogSpend: () => void;
  onScan: () => void;
}> = ({ brief, onDismiss, onLogSpend, onScan }) => {
  const evening = brief.kind === 'evening';

  return (
    <section
      className={`md:col-span-12 border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] flex flex-col sm:flex-row sm:items-center justify-between gap-6 ${
        evening ? 'bg-[#ede9fe]' : brief.kind === 'weekly' ? 'bg-[#e0f2fe]' : 'bg-[#fef9c3]'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-[20px] text-slate-900">
            {evening ? 'nightlight' : brief.kind === 'weekly' ? 'calendar_view_week' : 'wb_twilight'}
          </span>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">
            {evening ? 'Evening check-in' : brief.kind === 'weekly' ? 'Weekly review' : 'Morning brief'}
          </p>
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-2">
          {brief.headline}
        </h2>
        <ul className="space-y-1">
          {brief.lines.map((line) => (
            <li key={line} className="text-xs font-bold text-slate-700 leading-relaxed flex gap-2">
              <span className="text-slate-400 shrink-0">—</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex sm:flex-col gap-2.5 shrink-0">
        {evening ? (
          <>
            <button
              onClick={onScan}
              className="flex-1 sm:flex-none px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer whitespace-nowrap"
            >
              Scan a bill
            </button>
            <button
              onClick={onLogSpend}
              className="flex-1 sm:flex-none px-5 py-3 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer whitespace-nowrap"
            >
              Type it
            </button>
          </>
        ) : (
          <button
            onClick={onLogSpend}
            className="flex-1 sm:flex-none px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer whitespace-nowrap"
          >
            Log a spend
          </button>
        )}
        <button
          onClick={onDismiss}
          className="px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 border-2 border-transparent hover:border-slate-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          Got it
        </button>
      </div>
    </section>
  );
};

/* ======================== SAFE TO SPEND ======================== */

export const SafeToSpendCard: React.FC<{
  safe: SafeToSpend;
  settings: Settings;
  onOpenSettings: () => void;
}> = ({ safe, settings, onOpenSettings }) => {
  if (!safe.configured) {
    return (
      <div className="md:col-span-4 bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[220px]">
        <div className="flex justify-between items-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl border-2 border-slate-900 flex items-center justify-center shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
            <span className="material-symbols-outlined text-[24px]">savings</span>
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-slate-700">Safe to spend</span>
        </div>
        <p className="text-xs font-bold text-slate-500 leading-relaxed my-4">
          Set a monthly budget and this becomes a daily number: what's left after bills, divided by the days
          remaining.
        </p>
        <button
          onClick={onOpenSettings}
          className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[2px_2px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          Set a budget
        </button>
      </div>
    );
  }

  const broke = safe.perDay <= 0;
  const parts = moneyParts(Math.max(0, safe.perDay), settings.currency);
  const spentShare = safe.perDay > 0 ? Math.min(100, (safe.spentToday / safe.perDay) * 100) : 100;

  return (
    <div
      className={`md:col-span-4 border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[220px] ${
        broke ? 'bg-[#ffe4e6]' : 'bg-[#f0fdf4]'
      }`}
    >
      <div className="flex justify-between items-center">
        <div className="w-12 h-12 bg-white rounded-2xl border-2 border-slate-900 flex items-center justify-center shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
          <span className="material-symbols-outlined text-[24px]">savings</span>
        </div>
        <span className="text-xs font-black uppercase tracking-widest text-slate-700">Safe today</span>
      </div>

      <div className="mt-4">
        <p className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-slate-900">
          {broke ? money(0, settings.currency, 0) : parts.whole}
          {!broke && <span className="text-xl text-slate-400">.{parts.fraction}</span>}
        </p>
        <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest mt-1">
          {broke
            ? `${money(Math.abs(safe.remaining), settings.currency, 0)} over, ${safe.daysLeft} days left`
            : `${safe.daysLeft} days left • ${money(safe.committed, settings.currency, 0)} of bills held back`}
        </p>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
          <span>Spent today</span>
          <span>{money(safe.spentToday, settings.currency, 0)}</span>
        </div>
        <div className="h-2.5 bg-white border border-slate-900 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              spentShare >= 100 ? 'bg-rose-500' : 'bg-slate-900'
            }`}
            style={{ width: `${Math.max(2, spentShare)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

/* ======================== SIGNALS ======================== */

export const SignalsSection: React.FC<{
  signals: Signal[];
  onAct: (signal: Signal) => void;
  onDismiss: (id: string) => void;
}> = ({ signals, onAct, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? signals : signals.slice(0, 3);

  useEffect(() => {
    if (signals.length <= 3) setExpanded(false);
  }, [signals.length]);

  if (signals.length === 0) return null;

  return (
    <section className="md:col-span-12 bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a]">
      <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-slate-100">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Watching your money</p>
          <h3 className="font-display text-xl md:text-2xl font-black text-slate-900 tracking-tight">Signals</h3>
        </div>
        <span className="px-3 py-1.5 bg-slate-900 text-white border-2 border-slate-900 rounded-full text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#4f46e5]">
          {signals.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {visible.map((signal) => (
          <article
            key={signal.id}
            className={`${TONE_BG[signal.tone]} border-2 border-slate-900 rounded-2xl p-5 shadow-[3px_3px_0px_0px_#0f172a] flex flex-col justify-between gap-4`}
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#0f172a]">
                  <span className="material-symbols-outlined text-[20px] font-bold text-slate-900">
                    {signal.icon}
                  </span>
                </div>
                <button
                  onClick={() => onDismiss(signal.id)}
                  aria-label="Dismiss signal"
                  className="w-7 h-7 rounded-lg border-2 border-transparent hover:border-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>
              <h4 className="font-display font-black text-base text-slate-900 leading-tight mb-1.5">
                {signal.title}
              </h4>
              <p className="text-xs font-semibold text-slate-700 leading-relaxed">{signal.body}</p>
            </div>

            {signal.action && (
              <button
                onClick={() => onAct(signal)}
                className="w-full py-2.5 bg-white text-slate-900 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                {signal.action.label}
              </button>
            )}
          </article>
        ))}
      </div>

      {signals.length > 3 && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-5 w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 border-2 border-slate-200 hover:border-slate-900 transition-colors cursor-pointer"
        >
          {expanded ? 'Show fewer' : `Show ${signals.length - 3} more`}
        </button>
      )}
    </section>
  );
};

/* ======================== CAPTURE SPEED DIAL ======================== */

export const CaptureDial: React.FC<{
  onScan: () => void;
  onQuickAdd: () => void;
  onManual: () => void;
}> = ({ onScan, onQuickAdd, onManual }) => {
  const [open, setOpen] = useState(false);

  const actions = [
    { label: 'Scan a bill', icon: 'photo_camera', run: onScan, bg: 'bg-[#e0f2fe]' },
    { label: 'Quick add', icon: 'bolt', run: onQuickAdd, bg: 'bg-[#fef9c3]' },
    { label: 'Full form', icon: 'edit_note', run: onManual, bg: 'bg-white' },
  ];

  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/20 md:hidden cursor-default"
        />
      )}

      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex flex-col items-end gap-3">
        {open &&
          actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                setOpen(false);
                action.run();
              }}
              className={`${action.bg} flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-2xl border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] animate-in fade-in slide-in-from-bottom-2 duration-150 cursor-pointer`}
            >
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">{action.label}</span>
              <span className="material-symbols-outlined text-[20px] font-bold text-slate-900">{action.icon}</span>
            </button>
          ))}

        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Close capture menu' : 'Add a transaction'}
          aria-expanded={open}
          className="w-14 h-14 bg-slate-900 text-white rounded-2xl border-2 border-slate-900 flex items-center justify-center shadow-[4px_4px_0px_0px_#4f46e5] hover:bg-slate-800 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          <span
            className={`material-symbols-outlined text-[28px] font-bold transition-transform duration-150 ${
              open ? 'rotate-45' : ''
            }`}
          >
            add
          </span>
        </button>
      </div>
    </>
  );
};
