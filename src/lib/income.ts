import { DueStatus, IncomeDue, IncomeSource, Transaction } from '../types';
import {
  addMonths,
  currentMonthKey,
  daysInMonth,
  daysUntil,
  fromISO,
  monthKey,
  shiftMonthKey,
  todayISO,
} from './dates';
import { uid } from './storage';

/** Months between one payment and the next. */
export function periodMonths(frequency: IncomeSource['frequency']): number {
  return frequency === 'yr' ? 12 : frequency === 'qtr' ? 3 : 1;
}

/** Due date for a period, with the day clamped so the 31st survives February. */
function dueDateFor(periodKey: string, dueDay: number): string {
  const last = daysInMonth(periodKey);
  return `${periodKey}-${`${Math.min(Math.max(1, dueDay), last)}`.padStart(2, '0')}`;
}

export function outstandingOf(due: IncomeDue): number {
  return Math.max(0, due.expected + due.carriedOver - due.received);
}

export function statusFor(due: IncomeDue): DueStatus {
  if (due.status === 'waived') return 'waived';
  const owed = due.expected + due.carriedOver;
  if (due.received >= owed - 0.005) return 'paid';
  return due.received > 0 ? 'partial' : 'pending';
}

/** What each period has actually received, read back off the ledger. */
export function paymentsByDue(transactions: Transaction[]): Map<string, { received: number; last: string }> {
  const map = new Map<string, { received: number; last: string }>();
  for (const tx of transactions) {
    if (!tx.dueId) continue;
    const held = map.get(tx.dueId);
    map.set(tx.dueId, {
      received: (held?.received ?? 0) + Math.abs(tx.amount),
      last: !held || tx.date > held.last ? tx.date : held.last,
    });
  }
  return map;
}

/**
 * Materialises every period from a source's start up to the current month, and
 * rolls unpaid balances forward.
 *
 * Nothing about money is authored here: `received` is summed from the ledger
 * entries tagged with each due's id, so recording the same payment on two
 * devices shows up as two visible entries rather than a silently doubled
 * counter. `carriedOver` is recomputed every pass, so a late payment entered
 * against an old month immediately corrects every month after it.
 */
export function reconcileDues(
  sources: IncomeSource[],
  existing: IncomeDue[],
  transactions: Transaction[]
): IncomeDue[] {
  const payments = paymentsByDue(transactions);
  const byKey = new Map(existing.map((due) => [`${due.sourceId}|${due.periodKey}`, due]));
  const result: IncomeDue[] = [];
  const thisMonth = currentMonthKey();

  for (const source of sources) {
    const step = periodMonths(source.frequency);
    const lastAllowed = source.endDate ? monthKey(source.endDate) : thisMonth;

    let periodKey = monthKey(source.startDate);
    let carriedOver = 0;
    let guard = 0;

    while (periodKey <= thisMonth && periodKey <= lastAllowed && guard < 600) {
      guard++;
      const key = `${source.id}|${periodKey}`;
      const previous = byKey.get(key);

      const base: IncomeDue = previous
        ? { ...previous, expected: previous.expected, carriedOver }
        : {
            id: uid('due'),
            sourceId: source.id,
            periodKey,
            dueDate: dueDateFor(periodKey, source.dueDay),
            expected: source.amount,
            carriedOver,
            received: 0,
            status: 'pending',
          };

      const paid = payments.get(base.id);
      const due: IncomeDue = {
        ...base,
        received: paid?.received ?? 0,
        lastReceivedDate: paid?.last,
      };

      due.status = statusFor(due);
      result.push(due);

      // Whatever is still owed this period becomes next period's opening balance.
      carriedOver = due.status === 'waived' ? 0 : outstandingOf(due);
      periodKey = shiftMonthKey(periodKey, step);
    }
  }

  // Keep dues whose source has since been deleted out of the way.
  return result.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
}

export interface DueView {
  due: IncomeDue;
  source: IncomeSource;
  outstanding: number;
  daysLate: number;
  /** True once the due date has passed with money still owed. */
  overdue: boolean;
}

export function viewDues(dues: IncomeDue[], sources: IncomeSource[]): DueView[] {
  const byId = new Map(sources.map((source) => [source.id, source]));

  return dues
    .map((due) => {
      const source = byId.get(due.sourceId);
      if (!source) return null;
      const outstanding = outstandingOf(due);
      const days = daysUntil(due.dueDate);
      return {
        due,
        source,
        outstanding,
        daysLate: days < 0 ? -days : 0,
        overdue: days < 0 && outstanding > 0 && due.status !== 'waived',
      } satisfies DueView;
    })
    .filter((view): view is DueView => view !== null);
}

export interface IncomeSummary {
  /** Sum of every active source's monthly-equivalent amount. */
  expectedMonthly: number;
  /** Owed right now across all periods, including arrears. */
  totalOutstanding: number;
  overdueAmount: number;
  overdueCount: number;
  collectedThisMonth: number;
  dueThisMonth: number;
  /** Share of this month's expectation actually collected, 0-100. */
  collectionRate: number;
}

/**
 * The newest period of each source — the only one whose outstanding is the
 * whole story, since every earlier shortfall has been carried into it.
 */
export function latestDuePerSource(views: DueView[]): DueView[] {
  const latest = new Map<string, DueView>();
  for (const view of views) {
    const held = latest.get(view.due.sourceId);
    if (!held || view.due.periodKey > held.due.periodKey) latest.set(view.due.sourceId, view);
  }
  return [...latest.values()];
}

/** The part of a source's balance that is already late. */
function lateAmount(view: DueView): number {
  if (view.overdue) return view.outstanding;
  // Not yet due this period, but the arrears inside it are still late money.
  return Math.max(0, Math.min(view.outstanding, view.due.carriedOver - view.due.received));
}

export function summarizeIncome(dues: IncomeDue[], sources: IncomeSource[]): IncomeSummary {
  const views = viewDues(dues, sources);
  const thisMonth = currentMonthKey();

  const expectedMonthly = sources
    .filter((source) => source.status === 'active')
    .reduce((sum, source) => sum + source.amount / periodMonths(source.frequency), 0);

  const current = views.filter((view) => view.due.periodKey === thisMonth);
  const dueThisMonth = current.reduce((sum, view) => sum + view.due.expected + view.due.carriedOver, 0);
  const collectedThisMonth = current.reduce((sum, view) => sum + view.due.received, 0);
  const latest = latestDuePerSource(views);

  return {
    expectedMonthly,
    // Summing every period would count ₹8,000 three times over once it has
    // been carried forward twice; only the newest period is real money owed.
    totalOutstanding: latest.reduce((sum, view) => sum + view.outstanding, 0),
    overdueAmount: latest.reduce((sum, view) => sum + lateAmount(view), 0),
    overdueCount: latest.filter((view) => lateAmount(view) > 0).length,
    collectedThisMonth,
    dueThisMonth,
    collectionRate: dueThisMonth === 0 ? 100 : Math.round((collectedThisMonth / dueThisMonth) * 100),
  };
}

const KIND_ICONS: Record<string, string> = {
  'House rent': 'home',
  'Shop rent': 'storefront',
  'Land lease': 'landscape',
  Salary: 'payments',
  'Freelance retainer': 'work',
  Interest: 'percent',
  Other: 'account_balance',
};

export function iconForSourceKind(kind: string): string {
  return KIND_ICONS[kind] ?? 'account_balance';
}

/** The ledger entry a collected payment turns into. */
export function paymentTransaction(
  source: IncomeSource,
  amount: number,
  date: string,
  method?: string
): Omit<Transaction, 'id'> {
  const isRent = source.kind.includes('rent') || source.kind.includes('lease');
  return {
    merchant: source.payer ? `${source.name} — ${source.payer}` : source.name,
    category: isRent ? 'Other Income' : source.kind === 'Salary' ? 'Salary' : 'Other Income',
    date,
    amount: Math.abs(amount),
    iconName: iconForSourceKind(source.kind),
    type: 'income',
    paymentMethod: method,
    note: `Rent collection — ${source.name}`,
    sourceId: source.id,
    origin: 'rent',
  };
}

/** Label like "Aug 2026" for a period key. */
export function periodLabel(periodKey: string): string {
  const [year, month] = periodKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Next payment expected from a source after today. */
export function nextExpected(source: IncomeSource): string {
  const step = periodMonths(source.frequency);
  let date = dueDateFor(monthKey(source.startDate), source.dueDay);
  let guard = 0;
  while (fromISO(date) < fromISO(todayISO()) && guard < 600) {
    date = dueDateFor(monthKey(addMonths(date, step)), source.dueDay);
    guard++;
  }
  return date;
}
