import React, { useMemo, useState } from 'react';
import { AccountSummary, Settings, Transaction } from '../types';
import { compactMoney, money, moneyParts } from '../lib/format';
import {
  currentMonthKey,
  daysInMonth,
  displayDate,
  groupLabel,
  monthKey,
  monthLabel,
  shiftMonthKey,
} from '../lib/dates';
import {
  categoryBreakdown,
  cumulativeSpendSeries,
  insightFor,
  seriesToPath,
} from '../lib/finance';
import { basketPriceMoves, itemHistory } from '../lib/insights';
import { EmptyState, Pill, SectionHeading } from './ui';

interface LedgerScreenProps {
  summary: AccountSummary;
  settings: Settings;
  transactions: Transaction[];
  activeMonth: string;
  /** Basket item to show a price history for, set from a Signal. */
  itemFocus: string | null;
  onClearItemFocus: () => void;
  onChangeMonth: (key: string) => void;
  onOpenAddTransaction: () => void;
  onOpenScan: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export const LedgerScreen: React.FC<LedgerScreenProps> = ({
  summary,
  settings,
  transactions,
  activeMonth,
  itemFocus,
  onClearItemFocus,
  onChangeMonth,
  onOpenAddTransaction,
  onOpenScan,
  onSelectTransaction,
}) => {
  const currency = settings.currency;
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [scope, setScope] = useState<'month' | 'all'>('month');

  const monthTransactions = useMemo(
    () => (scope === 'all' ? transactions : transactions.filter((tx) => monthKey(tx.date) === activeMonth)),
    [transactions, activeMonth, scope]
  );

  const categories = useMemo(() => {
    const found = new Set(monthTransactions.map((tx) => tx.category as string));
    return ['All', ...[...found].sort()];
  }, [monthTransactions]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return monthTransactions.filter((tx) => {
      const matchesCategory = selectedCategory === 'All' || tx.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        tx.merchant.toLowerCase().includes(query) ||
        String(tx.category).toLowerCase().includes(query) ||
        (tx.note?.toLowerCase().includes(query) ?? false) ||
        (tx.items?.some((item) => item.name.toLowerCase().includes(query)) ?? false)
      );
    });
  }, [monthTransactions, selectedCategory, searchQuery]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of [...filteredTransactions].sort((a, b) => b.date.localeCompare(a.date))) {
      const key = groupLabel(tx.date);
      const bucket = groups.get(key) ?? [];
      bucket.push(tx);
      groups.set(key, bucket);
    }
    return [...groups.entries()];
  }, [filteredTransactions]);

  const series = useMemo(() => cumulativeSpendSeries(transactions, activeMonth), [transactions, activeMonth]);
  const paths = useMemo(() => seriesToPath(series), [series]);
  const breakdown = useMemo(() => categoryBreakdown(transactions, activeMonth), [transactions, activeMonth]);
  const insight = insightFor(summary, settings.monthlyBudget);
  const priceMoves = useMemo(() => basketPriceMoves(transactions).slice(0, 5), [transactions]);
  const focusHistory = useMemo(
    () => (itemFocus ? itemHistory(transactions, itemFocus) : []),
    [transactions, itemFocus]
  );
  const spend = moneyParts(summary.monthlySpend, currency);
  const days = daysInMonth(activeMonth);
  const isCurrentMonth = activeMonth === currentMonthKey();

  const insightTone =
    insight.tone === 'warn' ? 'bg-[#ffe4e6]' : insight.tone === 'good' ? 'bg-[#f0fdf4]' : 'bg-[#fef9c3]';

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 pb-28 md:pb-16 flex flex-col md:flex-row gap-6 md:gap-8">
      {/* Analytics column */}
      <div className="w-full md:w-[42%] lg:w-[38%] flex flex-col gap-6">
        <div
          id="ledger-spending-trends-card"
          className="bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a]"
        >
          <div className="flex justify-between items-start mb-2 gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 mb-1">Analytics</p>
              <h2 className="font-display text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                Spending Trends
              </h2>
            </div>

            {/* Month stepper */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onChangeMonth(shiftMonthKey(activeMonth, -1))}
                aria-label="Previous month"
                className="w-8 h-8 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 hover:bg-slate-100 shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">chevron_left</span>
              </button>
              <button
                onClick={() => onChangeMonth(shiftMonthKey(activeMonth, 1))}
                disabled={isCurrentMonth}
                aria-label="Next month"
                className="w-8 h-8 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 hover:bg-slate-100 shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">chevron_right</span>
              </button>
            </div>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
            {monthLabel(activeMonth)} • 1–{days}
          </p>

          <div className="mb-6 flex items-baseline">
            <span className="font-display text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter">
              {spend.whole}
            </span>
            <span className="font-display text-2xl font-black text-slate-400 ml-1">.{spend.fraction}</span>
          </div>

          <div className="w-full rounded-2xl overflow-hidden relative bg-slate-50 border-2 border-slate-900 p-4 flex flex-col justify-end shadow-[3px_3px_0px_0px_#0f172a]">
            <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none opacity-40">
              <div className="w-full border-b-2 border-dashed border-slate-300" />
              <div className="w-full border-b-2 border-dashed border-slate-300" />
              <div className="w-full border-b-2 border-dashed border-slate-300" />
            </div>

            {summary.monthlySpend === 0 ? (
              <div className="h-32 flex items-center justify-center relative z-10">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 text-center px-4">
                  No spend logged for {monthLabel(activeMonth)}
                </p>
              </div>
            ) : (
              <svg
                className="w-full h-32 overflow-visible relative z-10"
                viewBox="0 0 300 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Cumulative spend for ${monthLabel(activeMonth)}`}
              >
                <defs>
                  <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={paths.area} fill="url(#spendingGradient)" />
                <path
                  d={paths.line}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-wider pt-2 border-t-2 border-slate-900 relative z-10">
              <span>01</span>
              <span>{Math.round(days / 3)}</span>
              <span>{Math.round((days / 3) * 2)}</span>
              <span>{days}</span>
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center pt-4 border-t-2 border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-md bg-indigo-600 border border-slate-900" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">Discretionary</span>
            </div>
            <span className="text-sm font-black text-slate-900">{summary.discretionaryPercentage}%</span>
          </div>

          <div className="mt-3 flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-md bg-slate-900 border border-slate-900" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">Fixed Costs</span>
            </div>
            <span className="text-sm font-black text-slate-900">{summary.fixedCostsPercentage}%</span>
          </div>
        </div>

        {/* Category breakdown */}
        {breakdown.length > 0 && (
          <div className="bg-white border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Where it went</h3>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                {breakdown.length} categories
              </span>
            </div>
            <div className="space-y-3.5">
              {breakdown.slice(0, 6).map((slice) => (
                <button
                  key={slice.category}
                  onClick={() => {
                    setScope('month');
                    setSelectedCategory(slice.category);
                    setShowFilterDrawer(true);
                  }}
                  className="w-full text-left group cursor-pointer"
                >
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800 group-hover:text-indigo-600 transition-colors">
                      {slice.category}
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      {money(slice.total, currency, 0)}
                      <span className="text-slate-400 ml-1.5">{Math.round(slice.share)}%</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 border border-slate-900 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(3, slice.share)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Basket price watch — only possible because bills are itemised */}
        {(priceMoves.length > 0 || focusHistory.length > 0) && (
          <div className="bg-white border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                {focusHistory.length > 0 ? 'Where you bought it' : 'Basket price watch'}
              </h3>
              {focusHistory.length > 0 && (
                <button
                  onClick={onClearItemFocus}
                  className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:underline cursor-pointer"
                >
                  Back
                </button>
              )}
            </div>

            {focusHistory.length > 0 ? (
              <>
                <p className="font-display font-black text-lg text-slate-900 mb-3">{itemFocus}</p>
                <div className="space-y-2">
                  {focusHistory.map((entry) => (
                    <button
                      key={`${entry.transactionId}-${entry.date}`}
                      onClick={() => {
                        const tx = transactions.find((t) => t.id === entry.transactionId);
                        if (tx) onSelectTransaction(tx);
                      }}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl border-2 border-slate-900 bg-slate-50 hover:bg-white shadow-[2px_2px_0px_0px_#0f172a] transition-all cursor-pointer text-left"
                    >
                      <span className="min-w-0">
                        <span className="block font-black text-sm text-slate-900 truncate">{entry.merchant}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {displayDate(entry.date)} • {entry.qty} × {money(entry.price, currency, 0)}
                        </span>
                      </span>
                      <span className="font-black text-sm text-slate-900 shrink-0">
                        {money(entry.qty * entry.price, currency, 0)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {priceMoves.map((move) => {
                  const up = move.changePercent > 0;
                  return (
                    <div key={move.name} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-xs text-slate-900 truncate">{move.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {money(move.previousPrice, currency, 0)} → {money(move.latestPrice, currency, 0)} •{' '}
                          {move.merchant}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-lg border border-slate-900 text-[10px] font-black uppercase tracking-wider ${
                          up ? 'bg-[#ffe4e6] text-rose-900' : 'bg-[#f0fdf4] text-emerald-900'
                        }`}
                      >
                        {up ? '+' : ''}
                        {Math.round(move.changePercent)}%
                      </span>
                    </div>
                  );
                })}
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-2 border-t-2 border-slate-100">
                  Tracked from itemised bills. Scan more receipts to sharpen this.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Insight */}
        <div
          id="ledger-insights-card"
          className={`${insightTone} border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a]`}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#0f172a] text-slate-900 font-black">
              <span className="material-symbols-outlined text-[24px]">
                {insight.tone === 'warn' ? 'warning' : 'lightbulb'}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">
                Automated Signal
              </p>
              <h3 className="font-display font-black text-lg text-slate-900 mb-1">{insight.title}</h3>
              <p className="text-xs font-semibold leading-relaxed text-slate-700">{insight.body}</p>
              {summary.groceriesThisMonth > 0 && (
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-600 mt-2.5">
                  Groceries: {money(summary.groceriesThisMonth, currency, 0)} this month
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ledger column */}
      <div className="w-full md:w-[58%] lg:w-[62%] flex flex-col">
        <div className="flex justify-between items-end mb-6 gap-3">
          <SectionHeading
            eyebrow="Ledger Database"
            title="Transactions"
            sub={`${filteredTransactions.length} entr${filteredTransactions.length === 1 ? 'y' : 'ies'} • ${
              scope === 'all' ? 'All time' : monthLabel(activeMonth)
            }`}
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="desktop-add-tx-button"
              onClick={onOpenAddTransaction}
              className="hidden sm:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Entry</span>
            </button>

            <button
              onClick={onOpenScan}
              aria-label="Scan a bill"
              title="Scan a bill"
              className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl border-2 border-slate-900 bg-[#e0f2fe] text-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-[#bae6fd] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">photo_camera</span>
            </button>

            <button
              id="ledger-tune-filter-button"
              onClick={() => setShowFilterDrawer(!showFilterDrawer)}
              aria-label="Filter transactions"
              className={`w-10 h-10 flex items-center justify-center rounded-xl border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                showFilterDrawer || selectedCategory !== 'All' || scope === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-900 hover:bg-slate-50'
              }`}
              title="Filter by category, month or keyword"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">tune</span>
            </button>
          </div>
        </div>

        {(showFilterDrawer || selectedCategory !== 'All') && (
          <div className="mb-6 p-5 bg-white border-2 border-slate-900 rounded-[2rem] shadow-[4px_4px_0px_0px_#0f172a] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">Range</span>
              {(selectedCategory !== 'All' || scope === 'all') && (
                <button
                  onClick={() => {
                    setSelectedCategory('All');
                    setScope('month');
                  }}
                  className="text-xs font-black uppercase tracking-wider text-indigo-600 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Pill active={scope === 'month'} onClick={() => setScope('month')}>
                {monthLabel(activeMonth)}
              </Pill>
              <Pill active={scope === 'all'} onClick={() => setScope('all')}>
                All time
              </Pill>
            </div>

            <span className="text-xs font-black uppercase tracking-wider text-slate-700">Category</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Pill key={cat} active={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>
                  {cat}
                </Pill>
              ))}
            </div>

            <div className="relative mt-1">
              <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search merchant, note or basket item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl pl-10 pr-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a]"
              />
            </div>
          </div>
        )}

        {groupedTransactions.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title={transactions.length === 0 ? 'Your ledger is empty' : 'Nothing matches'}
            body={
              transactions.length === 0
                ? 'Add a grocery bill, a recharge or your salary credit to get started.'
                : 'Try a different month, category or search term.'
            }
            actionLabel={transactions.length === 0 ? 'Add Transaction' : undefined}
            onAction={transactions.length === 0 ? onOpenAddTransaction : undefined}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groupedTransactions.map(([label, items]) => {
              const dayTotal = items.reduce((sum, tx) => sum + tx.amount, 0);
              return (
                <div key={label} className="flex flex-col">
                  <div className="flex items-baseline justify-between mb-2.5 ml-1 mr-1">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">{label}</h3>
                    <span
                      className={`text-[11px] font-black uppercase tracking-wider ${
                        dayTotal >= 0 ? 'text-indigo-600' : 'text-slate-400'
                      }`}
                    >
                      {dayTotal >= 0 ? '+' : '-'}
                      {compactMoney(Math.abs(dayTotal), currency)}
                    </span>
                  </div>
                  <div className="bg-white border-2 border-slate-900 rounded-[2rem] overflow-hidden shadow-[6px_6px_0px_0px_#0f172a] divide-y-2 divide-slate-100">
                    {items.map((tx) => (
                      <div
                        key={tx.id}
                        onClick={() => onSelectTransaction(tx)}
                        className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 border-2 border-slate-900 flex items-center justify-center text-slate-900 group-hover:bg-white transition-colors shrink-0 shadow-[2px_2px_0px_0px_#0f172a]">
                            <span className="material-symbols-outlined text-[22px] font-bold">{tx.iconName}</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-[15px] text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                              {tx.merchant}
                            </h4>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 min-w-0">
                              <span className="shrink-0">{tx.category}</span>
                              {tx.items && tx.items.length > 0 && (
                                <span className="shrink-0 text-indigo-600">
                                  • {tx.items.length} item{tx.items.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {tx.note && (
                                <span className="hidden sm:inline text-slate-400 truncate">• {tx.note}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`font-black text-[16px] tracking-tight shrink-0 pl-3 ${
                            tx.amount > 0 ? 'text-indigo-600' : 'text-slate-900'
                          }`}
                        >
                          {tx.amount > 0 ? '+' : '-'}
                          {money(Math.abs(tx.amount), currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </main>
  );
};
