import React, { useMemo } from 'react';
import { AccountSummary, Brief, Investment, NavTab, Settings, Signal, Subscription, Transaction } from '../types';
import { compactMoney, money, moneyParts, percent } from '../lib/format';
import { displayDate, daysUntil, monthLabel } from '../lib/dates';
import { monthlyCost, portfolioStats, vaultMonthlyBurn } from '../lib/finance';
import { SafeToSpend } from '../lib/insights';
import { BrandTile } from './ui';
import { BriefBanner, SafeToSpendCard, SignalsSection } from './Signals';

interface HubScreenProps {
  summary: AccountSummary;
  settings: Settings;
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  activeMonth: string;
  safe: SafeToSpend;
  signals: Signal[];
  brief: Brief | null;
  onDismissBrief: () => void;
  onSignalAction: (signal: Signal) => void;
  onDismissSignal: (id: string) => void;
  onOpenCashIn: () => void;
  onOpenCashOut: () => void;
  onOpenAddTransaction: () => void;
  onOpenScan: () => void;
  onOpenQuickAdd: () => void;
  onOpenSettings: () => void;
  onNavigate: (tab: NavTab) => void;
  onSelectSubscription: (sub: Subscription) => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export const HubScreen: React.FC<HubScreenProps> = ({
  summary,
  settings,
  transactions,
  subscriptions,
  investments,
  activeMonth,
  safe,
  signals,
  brief,
  onDismissBrief,
  onSignalAction,
  onDismissSignal,
  onOpenCashIn,
  onOpenCashOut,
  onOpenAddTransaction,
  onOpenScan,
  onOpenQuickAdd,
  onOpenSettings,
  onNavigate,
  onSelectSubscription,
  onSelectTransaction,
}) => {
  const currency = settings.currency;
  const recentTransactions = transactions.slice(0, 4);

  const portfolio = useMemo(() => portfolioStats(investments), [investments]);
  const netWorthValue = summary.cashBalance + portfolio.currentValue;
  const net = moneyParts(netWorthValue, currency);

  const upcoming = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active')
        .map((s) => ({ sub: s, days: daysUntil(s.nextRenewal) }))
        .sort((a, b) => a.days - b.days),
    [subscriptions]
  );
  const nextRenewal = upcoming[0];
  const vaultBurn = useMemo(() => vaultMonthlyBurn(subscriptions), [subscriptions]);

  const budget = settings.monthlyBudget;
  const budgetUsed = budget > 0 ? Math.min(200, Math.round((summary.monthlySpend / budget) * 100)) : 0;

  return (
    <main className="max-w-[1280px] mx-auto w-full px-4 md:px-8 py-6 pb-28 md:pb-16">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {brief && (
          <BriefBanner
            brief={brief}
            onDismiss={onDismissBrief}
            onLogSpend={onOpenQuickAdd}
            onScan={onOpenScan}
          />
        )}

        {/* Net worth hero */}
        <section
          id="hub-hero-section"
          className="md:col-span-8 bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 md:p-10 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] relative overflow-hidden min-h-[360px]"
        >
          {/* Dot-grid texture, drawn in CSS so the app stays offline-safe */}
          <div
            className="absolute inset-0 z-0 pointer-events-none opacity-[0.18]"
            style={{
              backgroundImage: 'radial-gradient(#0f172a 1.5px, transparent 1.5px)',
              backgroundSize: '22px 22px',
            }}
          />

          <div className="relative z-10 flex justify-between items-start gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 mb-2">
                Net Worth • Cash + Investments
              </p>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black leading-tight tracking-tight text-slate-900">
                TOTAL<br />POSITION
              </h2>
            </div>
            <div className="bg-slate-100 px-4 py-2 rounded-full border border-slate-900 text-xs font-black uppercase tracking-wider text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] shrink-0">
              {monthLabel(activeMonth).split(' ')[0]}
            </div>
          </div>

          <div className="relative z-10 mt-8 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
            <div>
              <p id="hub-total-balance" className="font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-slate-900">
                {net.whole}
                <span className="text-2xl sm:text-3xl text-slate-400">.{net.fraction}</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Cash {money(summary.cashBalance, currency, 0)}
                </span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Invested {compactMoney(portfolio.currentValue, currency)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                id="hub-money-in-button"
                onClick={onOpenCashIn}
                className="flex-1 sm:flex-none px-5 py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer text-center"
              >
                Money In
              </button>
              <button
                id="hub-money-out-button"
                onClick={onOpenCashOut}
                className="flex-1 sm:flex-none px-5 py-3.5 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer text-center"
              >
                Money Out
              </button>
              <button
                id="hub-scan-button"
                onClick={onOpenScan}
                aria-label="Scan a bill"
                title="Scan a bill"
                className="w-[52px] h-[52px] shrink-0 bg-[#e0f2fe] text-slate-900 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-[#bae6fd] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[24px] font-bold">photo_camera</span>
              </button>
            </div>
          </div>
        </section>

        <SafeToSpendCard safe={safe} settings={settings} onOpenSettings={onOpenSettings} />

        {/* Income */}
        <div
          id="hub-income-card"
          className="md:col-span-4 bg-[#e0f2fe] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[200px]">
          <div className="flex justify-between items-center">
            <div className="w-12 h-12 bg-white rounded-2xl border-2 border-slate-900 flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
              <span className="material-symbols-outlined text-[24px]">trending_up</span>
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Income</span>
          </div>
          <div className="mt-4">
            <p className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-slate-900">
              {compactMoney(summary.monthlyIncome, currency)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-black uppercase tracking-wider ${
                  summary.monthlyIncomeChange >= 0 ? 'text-indigo-700' : 'text-rose-700'
                }`}
              >
                {percent(summary.monthlyIncomeChange)}
              </span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">vs last month</span>
            </div>
          </div>
        </div>

        {/* Spend */}
        <div
          id="hub-spend-card"
          className="md:col-span-4 bg-[#fef9c3] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[220px]">
          <div className="flex justify-between items-center">
            <div className="w-12 h-12 bg-white rounded-2xl border-2 border-slate-900 flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
              <span className="material-symbols-outlined text-[24px]">credit_card</span>
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-slate-800">Monthly Burn</span>
          </div>
          <div className="mt-4">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-slate-900">
              {money(summary.monthlySpend, currency)}
            </p>
            {budget > 0 ? (
              <>
                <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest mt-1">
                  {budgetUsed}% of {compactMoney(budget, currency)} budget
                </p>
                <div className="h-2.5 mt-2 bg-white border border-slate-900 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetUsed > 100 ? 'bg-rose-500' : 'bg-slate-900'
                    }`}
                    style={{ width: `${Math.min(100, budgetUsed)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-1">
                {percent(summary.monthlySpendChange)} vs last month
              </p>
            )}
          </div>
          <button
            onClick={() => onNavigate('ledger')}
            className="mt-4 w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
          >
            Open Ledger &rarr;
          </button>
        </div>

        {/* Next renewal */}
        <div className="md:col-span-4 bg-[#f0fdf4] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[220px]">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Next Renewal</h3>
            <span className="px-2.5 py-1 bg-emerald-100 border border-slate-900 text-[10px] font-black uppercase tracking-wider rounded-full text-emerald-900">
              {money(vaultBurn, currency, 0)}/mo
            </span>
          </div>
          <div className="my-2 flex items-center gap-4">
            <div className="font-display text-4xl sm:text-5xl font-black text-slate-900">
              {nextRenewal ? Math.max(0, nextRenewal.days) : '—'}
            </div>
            <div className="text-xs font-black text-slate-600 leading-snug uppercase tracking-wider">
              {nextRenewal ? (
                <>
                  Days left until
                  <br />
                  <span className="text-slate-900 font-extrabold">{nextRenewal.sub.name}</span>
                </>
              ) : (
                <>
                  Nothing due
                  <br />
                  <span className="text-slate-900 font-extrabold">Add a plan</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate('vault')}
            className="w-full py-3 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Manage Vault
          </button>
        </div>

        {/* Portfolio */}
        <div className="md:col-span-4 bg-indigo-600 border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between text-white shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] min-h-[220px]">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">Portfolio</p>
            <div className="w-8 h-8 rounded-full bg-indigo-500 border border-slate-900 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">monitoring</span>
            </div>
          </div>
          <div className="my-2">
            <h4 className="font-display text-3xl sm:text-4xl font-black tracking-tighter">
              {compactMoney(portfolio.currentValue, currency)}
            </h4>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-200 mt-1">
              {portfolio.dayCount} holding{portfolio.dayCount === 1 ? '' : 's'} • invested{' '}
              {compactMoney(portfolio.invested, currency)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-3 py-1 rounded-full border border-slate-900 text-[11px] font-black uppercase tracking-wider ${
                portfolio.pnl >= 0 ? 'bg-emerald-400 text-emerald-950' : 'bg-rose-400 text-rose-950'
              }`}
            >
              {percent(portfolio.pnlPercent, 1)}
            </span>
            <button
              onClick={() => onNavigate('invest')}
              className="text-[11px] font-black uppercase tracking-widest text-white hover:underline cursor-pointer"
            >
              Open Invest &rarr;
            </button>
          </div>
        </div>

        <SignalsSection signals={signals} onAct={onSignalAction} onDismiss={onDismissSignal} />

        {/* Recent activity */}
        <section className="md:col-span-8 bg-white border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a]">
          <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-slate-100">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Live Feed</p>
              <h3 className="font-display text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                Recent Activity
              </h3>
            </div>
            <button
              id="hub-view-all-transactions"
              onClick={() => onNavigate('ledger')}
              className="px-4 py-2 bg-slate-100 border border-slate-900 rounded-full text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-slate-200 shadow-[2px_2px_0px_0px_#0f172a] transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              View All &rarr;
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-symbols-outlined text-[44px] text-slate-300 block mb-2">receipt_long</span>
              <p className="font-display font-black text-slate-900">No entries yet</p>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                Log your first grocery run or bill
              </p>
              <button
                onClick={onOpenAddTransaction}
                className="mt-5 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Add Transaction
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => onSelectTransaction(tx)}
                  className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border-2 border-slate-900 bg-slate-50 hover:bg-white shadow-[3px_3px_0px_0px_#0f172a] hover:shadow-[5px_5px_0px_0px_#0f172a] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center text-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] shrink-0">
                      <span className="material-symbols-outlined text-[20px] font-bold">{tx.iconName}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-[15px] text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {tx.merchant}
                      </p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        {tx.category} • {displayDate(tx.date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <span
                      className={`font-black text-[16px] tracking-tight ${
                        tx.amount > 0 ? 'text-indigo-600' : 'text-slate-900'
                      }`}
                    >
                      {tx.amount > 0 ? '+' : '-'}
                      {money(Math.abs(tx.amount), currency)}
                    </span>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{tx.type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vault preview */}
        <section className="md:col-span-4 bg-[#ede9fe] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-indigo-200">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700 mb-1">Subs & Recharges</p>
                <h3 className="font-display text-xl font-black text-slate-900 tracking-tight">Active Vault</h3>
              </div>
              <button
                onClick={() => onNavigate('vault')}
                aria-label="Open vault"
                className="w-8 h-8 rounded-full bg-white border border-slate-900 flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer"
              >
                &rarr;
              </button>
            </div>

            {upcoming.length === 0 ? (
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-900/60 leading-relaxed py-6 text-center">
                No plans tracked yet. Add Netflix, a mobile pack or your broadband bill.
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(0, 3).map(({ sub, days }) => (
                  <div
                    key={sub.id}
                    onClick={() => onSelectSubscription(sub)}
                    className="bg-white border-2 border-slate-900 rounded-2xl p-3.5 flex items-center justify-between shadow-[3px_3px_0px_0px_#0f172a] hover:shadow-[5px_5px_0px_0px_#0f172a] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <BrandTile name={sub.name} imageUrl={sub.imageUrl} size="w-10 h-10" rounded="rounded-xl" />
                      <div className="min-w-0">
                        <h4 className="font-black text-sm text-slate-900 truncate">{sub.name}</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {days <= 0 ? 'Due now' : `in ${days} days`}
                        </p>
                      </div>
                    </div>
                    <span className="font-black text-sm text-slate-900 shrink-0 pl-2">
                      {money(monthlyCost(sub), currency, 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('vault')}
            className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            Explore Vault Tracker
          </button>
        </section>
      </div>
    </main>
  );
};
