import React, { useMemo, useState } from 'react';
import { AssetClass, Investment, Settings } from '../types';
import { compactMoney, money, moneyParts, percent } from '../lib/format';
import { displayDate } from '../lib/dates';
import { blockedInIpos, holdingCost, holdingReturn, holdingValue, isPendingIpo, portfolioStats } from '../lib/finance';
import { BrandTile, EmptyState, SectionHeading } from './ui';

interface InvestScreenProps {
  investments: Investment[];
  settings: Settings;
  onOpenAddInvestment: () => void;
  onSelectInvestment: (inv: Investment) => void;
}

const ALLOCATION_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b', '#14b8a6'];

export const InvestScreen: React.FC<InvestScreenProps> = ({
  investments,
  settings,
  onOpenAddInvestment,
  onSelectInvestment,
}) => {
  const currency = settings.currency;
  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<'All' | AssetClass>('All');
  const [sortBy, setSortBy] = useState<'value' | 'return' | 'name'>('value');

  const stats = useMemo(() => portfolioStats(investments), [investments]);
  const value = moneyParts(stats.currentValue, currency);
  const blocked = useMemo(() => blockedInIpos(investments), [investments]);
  const pendingIpoCount = useMemo(() => investments.filter(isPendingIpo).length, [investments]);

  const assetClasses = useMemo(() => {
    const found = new Set(investments.map((i) => i.assetClass));
    return ['All', ...[...found].sort()] as ('All' | AssetClass)[];
  }, [investments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = investments.filter((inv) => {
      if (assetFilter !== 'All' && inv.assetClass !== assetFilter) return false;
      if (!query) return true;
      return (
        inv.name.toLowerCase().includes(query) ||
        (inv.symbol?.toLowerCase().includes(query) ?? false) ||
        inv.assetClass.toLowerCase().includes(query)
      );
    });

    return result.sort((a, b) => {
      if (sortBy === 'value') return holdingValue(b) - holdingValue(a);
      if (sortBy === 'return') return holdingReturn(b) - holdingReturn(a);
      return a.name.localeCompare(b.name);
    });
  }, [investments, search, assetFilter, sortBy]);

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-16 flex flex-col gap-8">
      {/* Portfolio hero */}
      <section className="bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 mb-2">Portfolio Value</p>
          <div className="font-display text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 flex items-baseline tracking-tighter">
            {value.whole}
            <span className="text-2xl sm:text-3xl text-slate-400 ml-1">.{value.fraction}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <span
              className={`px-3 py-1.5 rounded-xl border-2 border-slate-900 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#0f172a] ${
                stats.pnl >= 0 ? 'bg-[#f0fdf4] text-emerald-900' : 'bg-[#ffe4e6] text-rose-900'
              }`}
            >
              {stats.pnl >= 0 ? '▲' : '▼'} {money(Math.abs(stats.pnl), currency, 0)} ({percent(stats.pnlPercent, 1)})
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Invested {compactMoney(stats.invested, currency)}
            </span>
          </div>

          {blocked > 0 && (
            <div className="mt-4 px-4 py-3 bg-[#ede9fe] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Blocked in IPOs
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                    {pendingIpoCount} application{pendingIpoCount === 1 ? '' : 's'} awaiting allotment
                  </p>
                </div>
                <span className="font-display font-black text-xl text-slate-900 shrink-0">
                  {compactMoney(blocked, currency)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Allocation */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Allocation</h3>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {stats.dayCount} holding{stats.dayCount === 1 ? '' : 's'}
            </span>
          </div>

          {stats.allocation.length === 0 ? (
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Add a holding to see your split
            </p>
          ) : (
            <>
              <div className="h-5 w-full border-2 border-slate-900 rounded-full overflow-hidden flex shadow-[2px_2px_0px_0px_#0f172a] bg-slate-100">
                {stats.allocation.map((slice, i) => (
                  <div
                    key={slice.assetClass}
                    className="h-full border-r border-slate-900 last:border-r-0"
                    style={{
                      width: `${slice.share}%`,
                      backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                    }}
                    title={`${slice.assetClass} ${slice.share.toFixed(1)}%`}
                  />
                ))}
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
                {stats.allocation.map((slice, i) => (
                  <div key={slice.assetClass} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-md border border-slate-900 shrink-0"
                      style={{ backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                    />
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                      {slice.assetClass}
                    </span>
                    <span className="text-[11px] font-black text-slate-400">{Math.round(slice.share)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {stats.best && stats.dayCount > 1 && (
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="bg-[#f0fdf4] border-2 border-slate-900 rounded-2xl p-3.5 shadow-[2px_2px_0px_0px_#0f172a]">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800 mb-0.5">Top gainer</p>
                <p className="font-black text-sm text-slate-900 truncate">{stats.best.name}</p>
                <p className="text-[11px] font-black text-emerald-700">{percent(holdingReturn(stats.best), 1)}</p>
              </div>
              {stats.worst && (
                <div className="bg-[#ffe4e6] border-2 border-slate-900 rounded-2xl p-3.5 shadow-[2px_2px_0px_0px_#0f172a]">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-800 mb-0.5">Laggard</p>
                  <p className="font-black text-sm text-slate-900 truncate">{stats.worst.name}</p>
                  <p className="text-[11px] font-black text-rose-700">{percent(holdingReturn(stats.worst), 1)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Search + sort capsule */}
      {investments.length > 0 && (
        <div className="flex justify-center">
          <div className="bg-white border-2 border-slate-900 rounded-[2rem] shadow-[6px_6px_0px_0px_#0f172a] flex flex-col sm:flex-row items-center p-2.5 max-w-3xl w-full gap-2 sm:gap-0">
            <div className="w-full sm:flex-1 px-4 py-1.5 sm:border-r-2 border-slate-200">
              <label className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-600 block mb-0.5">
                Search holdings
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Nifty, INFY, Gold..."
                className="w-full bg-transparent border-none p-0 text-sm text-slate-900 font-bold focus:outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="w-full sm:flex-1 px-4 py-1.5 sm:border-r-2 border-slate-200">
              <label className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-600 block mb-0.5">
                Asset class
              </label>
              <select
                value={assetFilter}
                onChange={(e) => setAssetFilter(e.target.value as 'All' | AssetClass)}
                className="w-full bg-transparent border-none p-0 text-sm text-slate-900 font-bold focus:outline-none cursor-pointer"
              >
                {assetClasses.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:flex-1 px-4 py-1.5">
              <label className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-600 block mb-0.5">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'value' | 'return' | 'name')}
                className="w-full bg-transparent border-none p-0 text-sm text-slate-900 font-bold focus:outline-none cursor-pointer"
              >
                <option value="value">Current value</option>
                <option value="return">Return %</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-row items-end justify-between gap-3">
        <SectionHeading
          eyebrow="Portfolio"
          title="Holdings"
          sub={`Showing ${filtered.length} of ${investments.length}`}
        />

        <button
          id="invest-add-button"
          onClick={onOpenAddInvestment}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="hidden sm:inline">Add Holding</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="trending_up"
          title={investments.length === 0 ? 'No holdings tracked' : 'Nothing matches'}
          body={
            investments.length === 0
              ? 'Add your mutual funds, stocks, gold or FDs. Update prices whenever you check them and the returns follow.'
              : 'Clear the search or pick another asset class.'
          }
          actionLabel={investments.length === 0 ? 'Add Holding' : undefined}
          onAction={investments.length === 0 ? onOpenAddInvestment : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((inv) => {
            const ret = holdingReturn(inv);
            const up = ret >= 0;
            const pending = isPendingIpo(inv);
            const blockedHere = pending ? inv.ipo!.lots * inv.ipo!.lotSize * inv.ipo!.cutoffPrice : 0;
            return (
              <div
                key={inv.id}
                onClick={() => onSelectInvestment(inv)}
                className="bg-white border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_0px_#0f172a] transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <BrandTile name={inv.symbol || inv.name} />
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full font-black text-[10px] tracking-widest uppercase border border-slate-900 shadow-[1px_1px_0px_0px_#0f172a] ${
                        pending
                          ? 'bg-[#ede9fe] text-indigo-900'
                          : up
                            ? 'bg-[#f0fdf4] text-emerald-900'
                            : 'bg-[#ffe4e6] text-rose-900'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full mr-1.5 border border-slate-900 ${
                          pending ? 'bg-indigo-500 animate-pulse' : up ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      {pending ? 'Applied' : percent(ret, 1)}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-black text-slate-900 mb-0.5 group-hover:text-indigo-600 transition-colors truncate">
                    {inv.name}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    {inv.assetClass}
                    {inv.symbol ? ` • ${inv.symbol}` : ''}
                  </p>

                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="bg-slate-50 border border-slate-900 rounded-xl px-3 py-2 shadow-[1px_1px_0px_0px_#0f172a]">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                        {pending ? 'Blocked' : 'Value'}
                      </p>
                      <p className="font-black text-sm text-slate-900">
                        {compactMoney(pending ? blockedHere : holdingValue(inv), currency)}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-900 rounded-xl px-3 py-2 shadow-[1px_1px_0px_0px_#0f172a]">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                        {pending ? 'Lots' : 'Invested'}
                      </p>
                      <p className="font-black text-sm text-slate-900">
                        {pending
                          ? `${inv.ipo!.lots} × ${inv.ipo!.lotSize}`
                          : compactMoney(holdingCost(inv), currency)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {pending
                      ? `Cut-off ${money(inv.ipo!.cutoffPrice, currency, 0)} • applied ${displayDate(
                          inv.ipo!.applicationDate
                        )}`
                      : `${inv.units} units • avg ${money(inv.avgCost, currency, 0)} → now ${money(
                          inv.currentPrice,
                          currency,
                          0
                        )}`}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t-2 border-slate-100 pt-4 mt-4">
                  <div className="flex items-center text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px] mr-1.5 text-slate-400">
                      {pending ? 'hourglass_top' : 'update'}
                    </span>
                    <span>
                      {pending
                        ? inv.ipo!.allotmentDate
                          ? `Allotment ${displayDate(inv.ipo!.allotmentDate)}`
                          : 'Awaiting allotment'
                        : `Price ${displayDate(inv.priceUpdatedAt)}`}
                    </span>
                  </div>
                  {pending ? (
                    <span className="font-black text-[11px] uppercase tracking-wider text-indigo-700">
                      Not counted yet
                    </span>
                  ) : (
                    <span className={`font-black text-sm ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {up ? '+' : '-'}
                      {compactMoney(Math.abs(holdingValue(inv) - holdingCost(inv)), currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onOpenAddInvestment}
        aria-label="Add holding"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 w-14 h-14 bg-slate-900 text-white rounded-2xl border-2 border-slate-900 flex items-center justify-center shadow-[4px_4px_0px_0px_#4f46e5] hover:bg-slate-800 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all z-40 md:hidden cursor-pointer"
      >
        <span className="material-symbols-outlined text-[28px] font-bold">add</span>
      </button>
    </main>
  );
};
