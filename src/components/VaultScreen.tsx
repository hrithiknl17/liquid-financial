import React, { useMemo, useState } from 'react';
import { Settings, Subscription, VaultKind } from '../types';
import { money, moneyParts } from '../lib/format';
import { cycleProgress, daysUntil, displayDate } from '../lib/dates';
import { monthlyCost, vaultMonthlyBurn } from '../lib/finance';
import { BrandTile, EmptyState, Pill } from './ui';

interface VaultScreenProps {
  subscriptions: Subscription[];
  settings: Settings;
  onOpenAddSubscription: () => void;
  onSelectSubscription: (sub: Subscription) => void;
}

type KindFilter = 'all' | VaultKind;

export const VaultScreen: React.FC<VaultScreenProps> = ({
  subscriptions,
  settings,
  onOpenAddSubscription,
  onSelectSubscription,
}) => {
  const currency = settings.currency;
  const [sortBy, setSortBy] = useState<'renewal' | 'cost' | 'name'>('renewal');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);

  const totalBurn = useMemo(() => vaultMonthlyBurn(subscriptions), [subscriptions]);
  const subsBurn = useMemo(() => vaultMonthlyBurn(subscriptions, 'subscription'), [subscriptions]);
  const rechargeBurn = useMemo(() => vaultMonthlyBurn(subscriptions, 'recharge'), [subscriptions]);
  const burn = moneyParts(totalBurn, currency);

  const categories = useMemo(() => {
    const found = new Set(subscriptions.map((s) => s.category).filter(Boolean));
    return ['All', ...[...found].sort()];
  }, [subscriptions]);

  const processed = useMemo(() => {
    let result = subscriptions.filter((s) => {
      if (kindFilter !== 'all' && s.kind !== kindFilter) return false;
      if (filterCategory !== 'All' && s.category !== filterCategory) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'renewal') return daysUntil(a.nextRenewal) - daysUntil(b.nextRenewal);
      if (sortBy === 'cost') return monthlyCost(b) - monthlyCost(a);
      return a.name.localeCompare(b.name);
    });

    // Cancelled and paused entries always sink to the bottom.
    return result.sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));
  }, [subscriptions, sortBy, kindFilter, filterCategory]);

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-28 md:pb-16 flex flex-col gap-8">
      <section
        id="vault-header-section"
        className="bg-[#ede9fe] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] flex flex-col md:flex-row md:items-center justify-between gap-6 relative"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 border border-slate-900" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-900">Recurring Outflows</p>
          </div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
            Total Monthly Burn • yearly plans amortised
          </h2>
          <div className="font-display text-4xl sm:text-6xl md:text-7xl font-black text-slate-900 flex items-baseline tracking-tighter">
            {burn.whole}
            <span className="text-2xl sm:text-3xl md:text-4xl font-black text-indigo-900/60 ml-1">
              .{burn.fraction}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900">
              Subscriptions {money(subsBurn, currency, 0)}
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900">
              Recharges & bills {money(rechargeBurn, currency, 0)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            id="vault-add-subscription-button"
            onClick={onOpenAddSubscription}
            className="px-6 py-3.5 bg-white border-2 border-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            Add Plan
          </button>

          <button
            id="vault-filter-button"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            aria-label="Sort and filter vault"
            className="w-12 h-12 bg-slate-900 border-2 border-slate-900 rounded-2xl flex items-center justify-center text-white shadow-[3px_3px_0px_0px_#4f46e5] hover:bg-slate-800 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[24px] font-bold">filter_list</span>
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 top-16 w-72 bg-white border-2 border-slate-900 rounded-[2rem] p-5 shadow-[6px_6px_0px_0px_#0f172a] z-30">
              <div className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5">Sort By</div>
              <div className="flex flex-col gap-1.5 mb-4">
                {(
                  [
                    ['renewal', 'Renewal date (soonest)'],
                    ['cost', 'Highest monthly cost'],
                    ['name', 'Name (A-Z)'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSortBy(value);
                      setShowFilterDropdown(false);
                    }}
                    className={`text-left px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      sortBy === value
                        ? 'bg-indigo-600 text-white shadow-[2px_2px_0px_0px_#0f172a]'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 border-t-2 border-slate-100 pt-3">
                Category
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Pill
                    key={c}
                    size="sm"
                    active={filterCategory === c}
                    onClick={() => {
                      setFilterCategory(c);
                      setShowFilterDropdown(false);
                    }}
                  >
                    {c}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Kind tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(
          [
            ['all', 'Everything'],
            ['subscription', 'Subscriptions'],
            ['recharge', 'Recharges & Bills'],
          ] as const
        ).map(([value, label]) => (
          <Pill key={value} active={kindFilter === value} onClick={() => setKindFilter(value)}>
            {label}
          </Pill>
        ))}
      </div>

      {processed.length === 0 ? (
        <EmptyState
          icon="subscriptions"
          title={subscriptions.length === 0 ? 'Vault is empty' : 'Nothing in this filter'}
          body={
            subscriptions.length === 0
              ? 'Track Netflix, Spotify, your mobile pack, broadband and DTH so nothing renews behind your back.'
              : 'Switch tabs or clear the category filter.'
          }
          actionLabel={subscriptions.length === 0 ? 'Add Plan' : undefined}
          onAction={subscriptions.length === 0 ? onOpenAddSubscription : undefined}
        />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processed.map((sub) => {
            const days = daysUntil(sub.nextRenewal);
            const progress = cycleProgress(sub.cycleStart, sub.nextRenewal);
            const urgent = sub.status === 'active' && days <= 3;
            return (
              <div
                key={sub.id}
                onClick={() => onSelectSubscription(sub)}
                className={`bg-white border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_0px_#0f172a] transition-all cursor-pointer flex flex-col justify-between group ${
                  sub.status !== 'active' ? 'opacity-60' : ''
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-6 gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <BrandTile name={sub.name} imageUrl={sub.imageUrl} />
                      <div className="min-w-0">
                        <h3 className="font-display font-black text-base text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {sub.name}
                        </h3>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">
                          {sub.plan || sub.category}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-display text-xl font-black text-slate-900">
                        {money(sub.cost, currency, 0)}
                      </div>
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        /{sub.billingPeriod}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-800">
                      {sub.kind === 'recharge' ? 'Recharge' : 'Subscription'}
                    </span>
                    {sub.category && (
                      <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-[#e0f2fe] text-[10px] font-black uppercase tracking-wider text-sky-900">
                        {sub.category}
                      </span>
                    )}
                    {sub.status !== 'active' && (
                      <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-700">
                        {sub.status}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t-2 border-slate-100">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                    <span className={urgent ? 'text-rose-600' : 'text-slate-600'}>
                      {sub.status !== 'active'
                        ? 'Not billing'
                        : days < 0
                          ? 'Overdue'
                          : days === 0
                            ? 'Renews today'
                            : `Renews in ${days} days`}
                    </span>
                    <span className="text-slate-600">{displayDate(sub.nextRenewal)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 border border-slate-900 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        urgent ? 'bg-rose-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {sub.billingPeriod === 'yr' && (
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-2">
                      ≈ {money(monthlyCost(sub), currency, 0)} / month
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <button
        onClick={onOpenAddSubscription}
        aria-label="Add plan"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 w-14 h-14 bg-slate-900 text-white rounded-2xl border-2 border-slate-900 flex items-center justify-center shadow-[4px_4px_0px_0px_#4f46e5] hover:bg-slate-800 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all z-40 md:hidden cursor-pointer"
      >
        <span className="material-symbols-outlined text-[28px] font-bold">add</span>
      </button>
    </main>
  );
};
