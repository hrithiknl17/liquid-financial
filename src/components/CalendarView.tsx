import React, { useMemo } from 'react';
import { Settings, Transaction } from '../types';
import { compactMoney, money } from '../lib/format';
import { daysInMonth, displayDate, todayISO } from '../lib/dates';
import { spendOf } from '../lib/finance';

interface CalendarViewProps {
  /** Already scoped to the month being shown. */
  transactions: Transaction[];
  activeMonth: string;
  settings: Settings;
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
  onSelectTransaction: (tx: Transaction) => void;
}

interface DayCell {
  iso: string;
  day: number;
  spend: number;
  income: number;
  count: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A month grid where each square carries what that day cost.
 *
 * Shading is relative to the heaviest day of the month rather than an absolute
 * scale: what matters when you glance at it is which days stand out from your
 * own normal, not how they compare to someone else's.
 */
export const CalendarView: React.FC<CalendarViewProps> = ({
  transactions,
  activeMonth,
  settings,
  selectedDay,
  onSelectDay,
  onSelectTransaction,
}) => {
  const currency = settings.currency;
  const today = todayISO();

  const { cells, leading, busiest, monthSpend, spentDays } = useMemo(() => {
    const total = daysInMonth(activeMonth);
    const byDay = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const list = byDay.get(tx.date);
      if (list) list.push(tx);
      else byDay.set(tx.date, [tx]);
    }

    const built: DayCell[] = [];
    for (let day = 1; day <= total; day++) {
      const iso = `${activeMonth}-${`${day}`.padStart(2, '0')}`;
      const entries = byDay.get(iso) ?? [];
      built.push({
        iso,
        day,
        spend: spendOf(entries),
        // Transfers are excluded by spendOf; do the same for money in.
        income: entries
          .filter((tx) => tx.type === 'income')
          .reduce((sum, tx) => sum + Math.max(0, tx.amount), 0),
        count: entries.length,
      });
    }

    const [year, month] = activeMonth.split('-').map(Number);
    return {
      cells: built,
      leading: new Date(year, month - 1, 1).getDay(),
      busiest: Math.max(...built.map((cell) => cell.spend), 0),
      monthSpend: built.reduce((sum, cell) => sum + cell.spend, 0),
      spentDays: built.filter((cell) => cell.spend > 0).length,
    };
  }, [transactions, activeMonth]);

  const selectedEntries = useMemo(
    () =>
      selectedDay
        ? transactions
            .filter((tx) => tx.date === selectedDay)
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        : [],
    [transactions, selectedDay]
  );

  /** 0 for a quiet day, 1 for the month's heaviest. */
  const heat = (spend: number): number => (busiest <= 0 ? 0 : spend / busiest);

  const dailyAverage = spentDays === 0 ? 0 : monthSpend / spentDays;

  return (
    <section className="bg-white border-2 border-slate-900 rounded-[2rem] p-4 sm:p-6 shadow-[6px_6px_0px_0px_#0f172a]">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5 px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Spent this month</p>
          <p className="font-display text-2xl font-black text-slate-900">{money(monthSpend, currency, 0)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Average on days you spent
          </p>
          <p className="font-black text-sm text-slate-900">
            {money(dailyAverage, currency, 0)}
            <span className="text-slate-400"> · {spentDays} day{spentDays === 1 ? '' : 's'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="text-center text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 py-1"
          >
            {label.slice(0, 1)}
            <span className="hidden sm:inline">{label.slice(1)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: leading }, (_, i) => (
          <div key={`pad-${i}`} aria-hidden />
        ))}

        {cells.map((cell) => {
          const intensity = heat(cell.spend);
          const isToday = cell.iso === today;
          const isSelected = cell.iso === selectedDay;
          const hasSpend = cell.spend > 0;

          return (
            <button
              key={cell.iso}
              onClick={() => onSelectDay(isSelected ? null : cell.iso)}
              aria-label={`${displayDate(cell.iso)}: ${
                hasSpend ? money(cell.spend, currency, 0) + ' spent' : 'nothing spent'
              }`}
              aria-pressed={isSelected}
              className={`relative aspect-square rounded-xl sm:rounded-2xl border-2 p-1 sm:p-1.5 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_0px_#4f46e5]'
                  : 'border-slate-900 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#0f172a]'
              }`}
              style={
                isSelected
                  ? undefined
                  : {
                      // Indigo, deepening with the day's share of the month's worst.
                      backgroundColor: hasSpend
                        ? `rgba(79, 70, 229, ${0.08 + intensity * 0.55})`
                        : '#f8fafc',
                    }
              }
            >
              <span
                className={`text-[10px] sm:text-xs font-black leading-none ${
                  isSelected ? 'text-white' : intensity > 0.55 ? 'text-white' : 'text-slate-900'
                }`}
              >
                {cell.day}
              </span>

              {hasSpend && (
                <span
                  className={`hidden sm:block text-[9px] font-black leading-none mt-1 ${
                    isSelected ? 'text-white/90' : intensity > 0.55 ? 'text-white/90' : 'text-slate-700'
                  }`}
                >
                  {compactMoney(cell.spend, currency)}
                </span>
              )}

              {/* On phones the number is all that fits, so spend becomes a dot. */}
              {hasSpend && (
                <span
                  className={`sm:hidden w-1 h-1 rounded-full mt-1 ${
                    isSelected ? 'bg-white' : intensity > 0.55 ? 'bg-white' : 'bg-indigo-700'
                  }`}
                />
              )}

              {cell.income > 0 && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-slate-900"
                  title={`${money(cell.income, currency, 0)} in`}
                />
              )}

              {isToday && !isSelected && (
                <span className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-slate-900" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 px-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quiet</span>
        <div className="flex gap-1">
          {[0.08, 0.25, 0.4, 0.55, 0.63].map((alpha) => (
            <span
              key={alpha}
              className="w-4 h-4 rounded-md border border-slate-900"
              style={{ backgroundColor: `rgba(79, 70, 229, ${alpha})` }}
            />
          ))}
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Heavy</span>
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 border border-slate-900" />
          Money in
        </span>
      </div>

      {selectedDay && (
        <div className="mt-5 pt-5 border-t-2 border-slate-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {displayDate(selectedDay)}
              </p>
              <p className="font-display text-lg font-black text-slate-900">
                {money(spendOf(selectedEntries), currency)} spent
              </p>
            </div>
            <button
              onClick={() => onSelectDay(null)}
              className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          {selectedEntries.length === 0 ? (
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 py-4 text-center">
              Nothing logged on this day
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedEntries.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => onSelectTransaction(tx)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] hover:bg-white cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-slate-500 shrink-0">
                      {tx.iconName}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">{tx.merchant}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                        {tx.category}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-black shrink-0 ${
                      tx.amount > 0 ? 'text-emerald-600' : 'text-slate-900'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : '−'}
                    {money(Math.abs(tx.amount), currency)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
