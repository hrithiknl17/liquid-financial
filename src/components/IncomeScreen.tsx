import React, { useMemo, useState } from 'react';
import { IncomeDue, IncomeSource, Loan, Settings } from '../types';
import { compactMoney, money, moneyParts } from '../lib/format';
import { currentMonthKey, displayDate } from '../lib/dates';
import {
  DueView,
  iconForSourceKind,
  latestDuePerSource,
  periodLabel,
  summarizeIncome,
  viewDues,
} from '../lib/income';
import { LoanView, summarizeLoans, viewLoans } from '../lib/loans';
import { EmptyState, Pill, SectionHeading } from './ui';

interface IncomeScreenProps {
  sources: IncomeSource[];
  dues: IncomeDue[];
  loans: Loan[];
  settings: Settings;
  onAddSource: () => void;
  onAddLoan: () => void;
  onCollect: (view: DueView) => void;
  onEditSource: (source: IncomeSource) => void;
  onSettleLoan: (view: LoanView) => void;
  onEditLoan: (loan: Loan) => void;
}

type Segment = 'due' | 'sources' | 'loans';

export const IncomeScreen: React.FC<IncomeScreenProps> = ({
  sources,
  dues,
  loans,
  settings,
  onAddSource,
  onAddLoan,
  onCollect,
  onEditSource,
  onSettleLoan,
  onEditLoan,
}) => {
  const currency = settings.currency;
  const [segment, setSegment] = useState<Segment>('due');
  const [showSettled, setShowSettled] = useState(false);

  const summary = useMemo(() => summarizeIncome(dues, sources), [dues, sources]);
  const loanSummary = useMemo(() => summarizeLoans(loans), [loans]);
  const dueViews = useMemo(() => viewDues(dues, sources), [dues, sources]);
  const loanViews = useMemo(() => viewLoans(loans), [loans]);

  const outstanding = moneyParts(summary.totalOutstanding + loanSummary.owedToYou, currency);

  /**
   * One live card per source: the newest period already carries every earlier
   * shortfall, so listing the old periods too would show the same money twice.
   * "Show settled" opens the full history.
   */
  const openDues = useMemo(() => {
    const live = new Set(latestDuePerSource(dueViews).map((view) => view.due.id));
    return dueViews
      .filter((view) => (showSettled ? true : view.outstanding > 0 && live.has(view.due.id)))
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return b.due.periodKey.localeCompare(a.due.periodKey);
      });
  }, [dueViews, showSettled]);

  const visibleLoans = loanViews.filter((view) => (showSettled ? true : view.loan.status === 'open'));

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-28 md:pb-16 flex flex-col gap-8">
      {/* Hero: everything owed to you */}
      <section className="bg-[#f0fdf4] border-2 border-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_0px_#0f172a] md:shadow-[8px_8px_0px_0px_#0f172a] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 border border-slate-900" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-900">Owed to you</p>
          </div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
            Rent arrears + money lent out
          </h2>
          <div className="font-display text-4xl sm:text-6xl md:text-7xl font-black text-slate-900 flex items-baseline tracking-tighter">
            {outstanding.whole}
            <span className="text-2xl sm:text-3xl md:text-4xl font-black text-emerald-900/60 ml-1">
              .{outstanding.fraction}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900">
              Expected {money(summary.expectedMonthly, currency, 0)}/mo
            </span>
            {summary.overdueCount > 0 && (
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-700">
                {summary.overdueCount} overdue • {money(summary.overdueAmount, currency, 0)}
              </span>
            )}
            {loanSummary.owedToYou > 0 && (
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900">
                Lent out {money(loanSummary.owedToYou, currency, 0)}
              </span>
            )}
            {loanSummary.youOwe > 0 && (
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                You owe {money(loanSummary.youOwe, currency, 0)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 shrink-0">
          <div className="bg-white border-2 border-slate-900 rounded-2xl px-5 py-3 shadow-[3px_3px_0px_0px_#0f172a]">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Collected this month
            </p>
            <p className="font-display text-2xl font-black text-slate-900">
              {money(summary.collectedThisMonth, currency, 0)}
              <span className="text-sm text-slate-400"> of {compactMoney(summary.dueThisMonth, currency)}</span>
            </p>
            <div className="h-2 mt-2 bg-slate-100 border border-slate-900 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, summary.collectionRate)}%` }}
              />
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={onAddSource}
              className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer whitespace-nowrap"
            >
              Add source
            </button>
            <button
              onClick={onAddLoan}
              className="flex-1 px-4 py-3 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer whitespace-nowrap"
            >
              Lend / borrow
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Pill active={segment === 'due'} onClick={() => setSegment('due')}>
            Due &amp; collected
          </Pill>
          <Pill active={segment === 'sources'} onClick={() => setSegment('sources')}>
            Sources ({sources.length})
          </Pill>
          <Pill active={segment === 'loans'} onClick={() => setSegment('loans')}>
            People ({loanSummary.openCount})
          </Pill>
        </div>

        <button
          onClick={() => setShowSettled((prev) => !prev)}
          className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:underline cursor-pointer"
        >
          {showSettled ? 'Hide settled' : 'Show settled'}
        </button>
      </div>

      {/* ---- Dues ---- */}
      {segment === 'due' &&
        (openDues.length === 0 ? (
          <EmptyState
            icon="request_quote"
            title={sources.length === 0 ? 'No income sources yet' : 'Nothing outstanding'}
            body={
              sources.length === 0
                ? 'Add a house, shop or any arrangement that pays you on a schedule. Each month generates a due you can tick off.'
                : 'Everything expected so far has been collected. Nice.'
            }
            actionLabel={sources.length === 0 ? 'Add source' : undefined}
            onAction={sources.length === 0 ? onAddSource : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {openDues.map((view) => {
              const { due, source } = view;
              const owed = due.expected + due.carriedOver;
              const settled = view.outstanding <= 0;
              const isThisMonth = due.periodKey === currentMonthKey();

              return (
                <div
                  key={due.id}
                  className={`border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a] flex flex-col justify-between gap-4 ${
                    settled ? 'bg-[#f0fdf4]' : view.overdue ? 'bg-[#ffe4e6]' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
                          <span className="material-symbols-outlined text-[22px] font-bold">
                            {iconForSourceKind(source.kind)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display font-black text-base text-slate-900 truncate">
                            {source.name}
                          </h3>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                            {source.payer ?? source.kind} • {periodLabel(due.periodKey)}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-lg border border-slate-900 text-[10px] font-black uppercase tracking-wider ${
                          settled
                            ? 'bg-emerald-100 text-emerald-900'
                            : view.overdue
                              ? 'bg-rose-200 text-rose-900'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {settled
                          ? 'Paid'
                          : view.overdue
                            ? `${view.daysLate}d late`
                            : isThisMonth
                              ? 'Due'
                              : periodLabel(due.periodKey)}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-black text-slate-900 tracking-tighter">
                        {money(view.outstanding, currency, 0)}
                      </span>
                      {due.carriedOver > 0 && (
                        <span className="text-[11px] font-black uppercase tracking-wider text-rose-700">
                          incl. {money(due.carriedOver, currency, 0)} carried
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                      {money(source.amount, currency, 0)} rent
                      {due.carriedOver > 0 ? ` + ${money(due.carriedOver, currency, 0)} arrears` : ''} • due{' '}
                      {displayDate(due.dueDate)}
                    </p>

                    {due.received > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                          <span>Received</span>
                          <span>
                            {money(due.received, currency, 0)} of {money(owed, currency, 0)}
                          </span>
                        </div>
                        <div className="h-2.5 bg-white border border-slate-900 rounded-full overflow-hidden p-0.5">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (due.received / owed) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {!settled && (
                    <button
                      onClick={() => onCollect(view)}
                      className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                    >
                      Mark received
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {/* ---- Sources ---- */}
      {segment === 'sources' &&
        (sources.length === 0 ? (
          <EmptyState
            icon="storefront"
            title="No sources yet"
            body="A source is anything that pays you on a schedule — a flat, a shop, a lease, a retainer. Liquid generates each period's due and carries unpaid balances forward."
            actionLabel="Add source"
            onAction={onAddSource}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sources.map((source) => {
              const owed = viewDues(dues, [source]).reduce((sum, view) => sum + view.outstanding, 0);
              return (
                <button
                  key={source.id}
                  onClick={() => onEditSource(source)}
                  className={`text-left border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_0px_#0f172a] transition-all cursor-pointer ${
                    source.status === 'active' ? 'bg-white' : 'bg-slate-100 opacity-70'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#0f172a] text-slate-900">
                      <span className="material-symbols-outlined text-[22px] font-bold">
                        {iconForSourceKind(source.kind)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-black text-slate-900">
                        {money(source.amount, currency, 0)}
                      </div>
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        /{source.frequency}
                      </div>
                    </div>
                  </div>

                  <h3 className="font-display font-black text-base text-slate-900 truncate">{source.name}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate mb-3">
                    {source.kind}
                    {source.payer ? ` • ${source.payer}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-800">
                      Due on the {source.dueDay}
                    </span>
                    {owed > 0 && (
                      <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-[#ffe4e6] text-[10px] font-black uppercase tracking-wider text-rose-900">
                        {money(owed, currency, 0)} owed
                      </span>
                    )}
                    {source.depositHeld ? (
                      <span className="px-2.5 py-1 rounded-lg border border-slate-900 bg-[#e0f2fe] text-[10px] font-black uppercase tracking-wider text-sky-900">
                        Deposit {compactMoney(source.depositHeld, currency)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      {/* ---- Loans ---- */}
      {segment === 'loans' &&
        (visibleLoans.length === 0 ? (
          <EmptyState
            icon="handshake"
            title="Nobody owes you right now"
            body="Record money you lent a friend, or money you borrowed. Tick it off when it comes back — partial repayments welcome."
            actionLabel="Record a loan"
            onAction={onAddLoan}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleLoans.map((view) => {
              const { loan } = view;
              const lent = loan.direction === 'lent';
              const settled = loan.status !== 'open';

              return (
                <div
                  key={loan.id}
                  className={`border-2 border-slate-900 rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#0f172a] flex flex-col justify-between gap-4 ${
                    settled ? 'bg-[#f0fdf4]' : view.overdue ? 'bg-[#ffe4e6]' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-2xl border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#0f172a] text-slate-900 ${
                            lent ? 'bg-[#e0f2fe]' : 'bg-[#fef9c3]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[22px] font-bold">
                            {lent ? 'call_made' : 'call_received'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display font-black text-base text-slate-900 truncate">
                            {loan.person}
                          </h3>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {lent ? 'Owes you' : 'You owe'} • {displayDate(loan.date)}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => onEditLoan(loan)}
                        aria-label="Edit loan"
                        className="w-8 h-8 shrink-0 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px] font-bold">edit</span>
                      </button>
                    </div>

                    <span className="font-display text-3xl font-black text-slate-900 tracking-tighter">
                      {money(settled ? loan.principal : view.outstanding, currency, 0)}
                    </span>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                      {settled
                        ? loan.status === 'settled'
                          ? 'Settled in full'
                          : 'Written off'
                        : loan.repaid > 0
                          ? `${money(loan.repaid, currency, 0)} back of ${money(loan.principal, currency, 0)}`
                          : loan.expectedBack
                            ? view.overdue
                              ? `${view.daysLate} days past due`
                              : `Expected ${displayDate(loan.expectedBack)}`
                            : 'No date agreed'}
                    </p>

                    {loan.repaid > 0 && !settled && (
                      <div className="h-2.5 mt-3 bg-slate-100 border border-slate-900 rounded-full overflow-hidden p-0.5">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${view.progress}%` }}
                        />
                      </div>
                    )}

                    {loan.note && (
                      <p className="text-[11px] font-semibold text-slate-500 mt-3 line-clamp-2">{loan.note}</p>
                    )}
                  </div>

                  {!settled && (
                    <button
                      onClick={() => onSettleLoan(view)}
                      className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                    >
                      {lent ? 'They paid me back' : 'I paid them back'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      <div className="md:hidden">
        <SectionHeading eyebrow="" title="" />
      </div>
    </main>
  );
};
