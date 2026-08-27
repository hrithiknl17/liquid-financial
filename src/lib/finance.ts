import {
  AccountSummary,
  Category,
  Investment,
  Settings,
  Subscription,
  Transaction,
} from '../types';
import { currentMonthKey, daysInMonth, fromISO, monthKey, shiftMonthKey } from './dates';

export function isIncome(tx: Transaction): boolean {
  return tx.amount > 0;
}

export function txTotal(txs: Transaction[]): number {
  return txs.reduce((sum, tx) => sum + tx.amount, 0);
}

export function inMonth(txs: Transaction[], key: string): Transaction[] {
  return txs.filter((tx) => monthKey(tx.date) === key);
}

/** Transfers move money without being spend or income, so they never count. */
export function isFlow(tx: Transaction): boolean {
  return tx.type !== 'transfer';
}

export function spendOf(txs: Transaction[]): number {
  return txs
    .filter((tx) => tx.amount < 0 && isFlow(tx))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

export function incomeOf(txs: Transaction[]): number {
  return txs.filter((tx) => tx.amount > 0 && isFlow(tx)).reduce((sum, tx) => sum + tx.amount, 0);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

/** Every headline number on the Hub, recomputed from the raw ledger. */
export function summarize(
  transactions: Transaction[],
  settings: Settings,
  key: string = currentMonthKey()
): AccountSummary {
  const thisMonth = inMonth(transactions, key);
  const lastMonth = inMonth(transactions, shiftMonthKey(key, -1));

  const monthlyIncome = incomeOf(thisMonth);
  const monthlySpend = spendOf(thisMonth);

  const outflow = thisMonth.filter((tx) => tx.amount < 0 && isFlow(tx));
  const discretionary = outflow
    .filter((tx) => tx.type === 'discretionary')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const fixed = outflow.filter((tx) => tx.type === 'fixed').reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const split = discretionary + fixed;

  return {
    cashBalance: settings.openingBalance + txTotal(transactions),
    monthlyIncome,
    monthlyIncomeChange: pctChange(monthlyIncome, incomeOf(lastMonth)),
    monthlySpend,
    monthlySpendChange: pctChange(monthlySpend, spendOf(lastMonth)),
    discretionaryPercentage: split === 0 ? 0 : Math.round((discretionary / split) * 100),
    fixedCostsPercentage: split === 0 ? 0 : Math.round((fixed / split) * 100),
    groceriesThisMonth: thisMonth
      .filter((tx) => tx.category === 'Groceries')
      .reduce((s, tx) => s + Math.abs(tx.amount), 0),
    savingsRate: monthlyIncome === 0 ? 0 : Math.round(((monthlyIncome - monthlySpend) / monthlyIncome) * 100),
  };
}

export interface CategorySlice {
  category: Category;
  total: number;
  share: number;
  count: number;
}

/** Spend per category for a month, biggest first. */
export function categoryBreakdown(transactions: Transaction[], key: string): CategorySlice[] {
  const outflow = inMonth(transactions, key).filter((tx) => tx.amount < 0 && isFlow(tx));
  const total = spendOf(outflow);
  const buckets = new Map<Category, { total: number; count: number }>();

  for (const tx of outflow) {
    const bucket = buckets.get(tx.category) ?? { total: 0, count: 0 };
    bucket.total += Math.abs(tx.amount);
    bucket.count += 1;
    buckets.set(tx.category, bucket);
  }

  return [...buckets.entries()]
    .map(([category, b]) => ({
      category,
      total: b.total,
      count: b.count,
      share: total === 0 ? 0 : (b.total / total) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Cumulative spend per day across a month — the shape the Ledger chart draws. */
export function cumulativeSpendSeries(transactions: Transaction[], key: string): number[] {
  const days = daysInMonth(key);
  const perDay = new Array<number>(days).fill(0);

  for (const tx of inMonth(transactions, key)) {
    if (tx.amount >= 0 || !isFlow(tx)) continue;
    perDay[fromISO(tx.date).getDate() - 1] += Math.abs(tx.amount);
  }

  let running = 0;
  return perDay.map((value) => (running += value));
}

/** Builds an SVG path across a 0..100 viewBox for a numeric series. */
export function seriesToPath(series: number[], width = 300, height = 100): { line: string; area: string } {
  if (series.length === 0) return { line: '', area: '' };
  const max = Math.max(...series, 1);
  const stepX = series.length > 1 ? width / (series.length - 1) : width;

  const points = series.map((value, i) => {
    const x = i * stepX;
    const y = height - (value / max) * (height - 8) - 4;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, area };
}

/** Monthly cost of a vault entry, with yearly plans amortised. */
export function monthlyCost(sub: Subscription): number {
  return sub.billingPeriod === 'yr' ? sub.cost / 12 : sub.cost;
}

export function vaultMonthlyBurn(subs: Subscription[], kind?: Subscription['kind']): number {
  return subs
    .filter((s) => s.status === 'active' && (kind ? s.kind === kind : true))
    .reduce((sum, s) => sum + monthlyCost(s), 0);
}

export interface PortfolioStats {
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  dayCount: number;
  allocation: { assetClass: string; value: number; share: number }[];
  best: Investment | null;
  worst: Investment | null;
}

/** True while an IPO application is outstanding — money blocked, no shares yet. */
export function isPendingIpo(inv: Investment): boolean {
  return inv.ipo?.status === 'applied';
}

/** Funds locked in IPO applications that have not been allotted yet. */
export function blockedInIpos(investments: Investment[]): number {
  return investments
    .filter(isPendingIpo)
    .reduce((sum, inv) => sum + (inv.ipo!.lots * inv.ipo!.lotSize * inv.ipo!.cutoffPrice), 0);
}

export function holdingValue(inv: Investment): number {
  if (isPendingIpo(inv)) return 0;
  return inv.units * inv.currentPrice;
}

export function holdingCost(inv: Investment): number {
  if (isPendingIpo(inv)) return 0;
  return inv.units * inv.avgCost;
}

export function holdingReturn(inv: Investment): number {
  const cost = holdingCost(inv);
  return cost === 0 ? 0 : ((holdingValue(inv) - cost) / cost) * 100;
}

export function portfolioStats(investments: Investment[]): PortfolioStats {
  const held = investments.filter((inv) => !isPendingIpo(inv));
  const invested = held.reduce((sum, inv) => sum + holdingCost(inv), 0);
  const currentValue = held.reduce((sum, inv) => sum + holdingValue(inv), 0);

  const byClass = new Map<string, number>();
  for (const inv of held) {
    byClass.set(inv.assetClass, (byClass.get(inv.assetClass) ?? 0) + holdingValue(inv));
  }

  const ranked = [...held].sort((a, b) => holdingReturn(b) - holdingReturn(a));

  return {
    invested,
    currentValue,
    pnl: currentValue - invested,
    pnlPercent: invested === 0 ? 0 : ((currentValue - invested) / invested) * 100,
    dayCount: held.length,
    allocation: [...byClass.entries()]
      .map(([assetClass, value]) => ({
        assetClass,
        value,
        share: currentValue === 0 ? 0 : (value / currentValue) * 100,
      }))
      .sort((a, b) => b.value - a.value),
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

export function netWorth(
  transactions: Transaction[],
  investments: Investment[],
  settings: Settings
): number {
  return settings.openingBalance + txTotal(transactions) + portfolioStats(investments).currentValue;
}

const CATEGORY_ICONS: Record<string, string> = {
  Groceries: 'shopping_basket',
  Dining: 'restaurant',
  Transportation: 'directions_car',
  Utilities: 'bolt',
  'Rent & Housing': 'home',
  'Health & Wellness': 'fitness_center',
  Entertainment: 'movie',
  Shopping: 'shopping_bag',
  Education: 'school',
  Recharge: 'smartphone',
  Subscription: 'subscriptions',
  Investment: 'trending_up',
  Salary: 'payments',
  Freelance: 'work',
  Refund: 'undo',
  Dividend: 'savings',
  Interest: 'percent',
  'Other Income': 'account_balance',
  Transfer: 'swap_horiz',
  Other: 'receipt_long',
};

export function iconForCategory(category: string): string {
  return CATEGORY_ICONS[category] ?? 'receipt_long';
}

/** Rough label for how a month is trending, shown on the Ledger insight card. */
export function insightFor(summary: AccountSummary, budget: number): { title: string; body: string; tone: 'good' | 'warn' | 'flat' } {
  if (budget > 0 && summary.monthlySpend > budget) {
    const over = summary.monthlySpend - budget;
    return {
      tone: 'warn',
      title: 'Over budget this month',
      body: `You are ${Math.round((over / budget) * 100)}% past your monthly cap. Trim discretionary spend to pull back.`,
    };
  }
  if (summary.monthlySpendChange < -5) {
    return {
      tone: 'good',
      title: 'Spending is cooling off',
      body: `Outflow is ${Math.abs(Math.round(summary.monthlySpendChange))}% lower than last month. Keep this pace and the surplus compounds.`,
    };
  }
  if (summary.monthlySpendChange > 15) {
    return {
      tone: 'warn',
      title: 'Burn is climbing',
      body: `Spend is up ${Math.round(summary.monthlySpendChange)}% against last month. Check the top category below.`,
    };
  }
  return {
    tone: 'flat',
    title: summary.savingsRate > 0 ? `Saving ${summary.savingsRate}% of income` : 'Steady month so far',
    body:
      summary.monthlySpend === 0
        ? 'Log a few transactions and this panel starts reading your habits.'
        : 'Spend is tracking close to last month. Nothing unusual in the ledger.',
  };
}
