import {
  AccountSummary,
  Brief,
  BriefKind,
  Investment,
  Settings,
  Signal,
  Subscription,
  Transaction,
} from '../types';
import {
  addMonths,
  currentMonthKey,
  daysBetween,
  daysInMonth,
  daysUntil,
  displayDate,
  fromISO,
  monthKey,
  todayISO,
} from './dates';
import { compactMoney, money } from './format';
import { inMonth, monthlyCost, spendOf } from './finance';

/* ===================== SAFE TO SPEND ===================== */

export interface SafeToSpend {
  /** What today's spending can be without breaking the monthly cap. */
  perDay: number;
  /** Budget left after what's already gone and what is still committed. */
  remaining: number;
  daysLeft: number;
  /** Vault charges still due before month end. */
  committed: number;
  spentToday: number;
  configured: boolean;
}

export function safeToSpend(
  transactions: Transaction[],
  subscriptions: Subscription[],
  settings: Settings,
  summary: AccountSummary
): SafeToSpend {
  const today = todayISO();
  const key = currentMonthKey();
  const total = daysInMonth(key);
  const dayOfMonth = fromISO(today).getDate();
  const daysLeft = Math.max(1, total - dayOfMonth + 1);

  const committed = subscriptions
    .filter((sub) => sub.status === 'active')
    .filter((sub) => {
      const days = daysUntil(sub.nextRenewal);
      return days >= 0 && days < daysLeft;
    })
    .reduce((sum, sub) => sum + sub.cost, 0);

  const spentToday = transactions
    .filter((tx) => tx.date === today && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const remaining = settings.monthlyBudget - summary.monthlySpend - committed;

  return {
    perDay: remaining / daysLeft,
    remaining,
    daysLeft,
    committed,
    spentToday,
    configured: settings.monthlyBudget > 0,
  };
}

/* ===================== RECURRING RADAR ===================== */

const normalise = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

interface MerchantRun {
  merchant: string;
  dates: string[];
  amounts: number[];
}

function groupByMerchant(transactions: Transaction[]): MerchantRun[] {
  const map = new Map<string, MerchantRun>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const key = normalise(tx.merchant);
    if (!key) continue;
    const run = map.get(key) ?? { merchant: tx.merchant, dates: [], amounts: [] };
    run.dates.push(tx.date);
    run.amounts.push(Math.abs(tx.amount));
    map.set(key, run);
  }
  for (const run of map.values()) {
    const order = run.dates.map((date, i) => ({ date, amount: run.amounts[i] })).sort((a, b) => a.date.localeCompare(b.date));
    run.dates = order.map((entry) => entry.date);
    run.amounts = order.map((entry) => entry.amount);
  }
  return [...map.values()];
}

export interface RecurringCandidate {
  merchant: string;
  typicalAmount: number;
  latestAmount: number;
  intervalDays: number;
  occurrences: number;
  lastDate: string;
  /** Positive when the latest charge went up against the earlier norm. */
  changePercent: number;
}

export function detectRecurring(transactions: Transaction[]): RecurringCandidate[] {
  const results: RecurringCandidate[] = [];

  for (const run of groupByMerchant(transactions)) {
    if (run.dates.length < 3) continue;

    const gaps: number[] = [];
    for (let i = 1; i < run.dates.length; i++) {
      gaps.push(daysBetween(run.dates[i - 1], run.dates[i]));
    }
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const monthly = avgGap >= 25 && avgGap <= 35;
    const yearly = avgGap >= 350 && avgGap <= 380;
    if (!monthly && !yearly) continue;

    // Gaps must be consistent, otherwise it's just a place visited often.
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread > (yearly ? 40 : 10)) continue;

    const earlier = run.amounts.slice(0, -1);
    const typical = earlier.reduce((sum, amount) => sum + amount, 0) / earlier.length;
    const latest = run.amounts[run.amounts.length - 1];

    results.push({
      merchant: run.merchant,
      typicalAmount: typical,
      latestAmount: latest,
      intervalDays: Math.round(avgGap),
      occurrences: run.dates.length,
      lastDate: run.dates[run.dates.length - 1],
      changePercent: typical === 0 ? 0 : ((latest - typical) / typical) * 100,
    });
  }

  return results.sort((a, b) => b.latestAmount - a.latestAmount);
}

/* ===================== BASKET PRICE WATCH ===================== */

export interface ItemPriceMove {
  name: string;
  latestPrice: number;
  previousPrice: number;
  changePercent: number;
  lastSeen: string;
  merchant: string;
  timesBought: number;
}

/** Per-item inflation, only possible because bills are itemised. */
export function basketPriceMoves(transactions: Transaction[]): ItemPriceMove[] {
  const map = new Map<string, { name: string; points: { date: string; price: number; merchant: string }[] }>();

  for (const tx of transactions) {
    if (!tx.items?.length) continue;
    for (const item of tx.items) {
      const key = normalise(item.name);
      if (!key || item.unitPrice <= 0) continue;
      const bucket = map.get(key) ?? { name: item.name, points: [] };
      bucket.points.push({ date: tx.date, price: item.unitPrice, merchant: tx.merchant });
      map.set(key, bucket);
    }
  }

  const moves: ItemPriceMove[] = [];
  for (const bucket of map.values()) {
    if (bucket.points.length < 2) continue;
    const points = bucket.points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = points[points.length - 1];
    const earlier = points.slice(0, -1);
    const previous = earlier.reduce((sum, point) => sum + point.price, 0) / earlier.length;
    if (previous <= 0) continue;

    const changePercent = ((latest.price - previous) / previous) * 100;
    if (Math.abs(changePercent) < 4) continue;

    moves.push({
      name: bucket.name,
      latestPrice: latest.price,
      previousPrice: previous,
      changePercent,
      lastSeen: latest.date,
      merchant: latest.merchant,
      timesBought: points.length,
    });
  }

  return moves.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/** Everywhere a given item was ever bought — answers "where did I get this?". */
export function itemHistory(
  transactions: Transaction[],
  itemName: string
): { date: string; merchant: string; price: number; qty: number; transactionId: string }[] {
  const key = normalise(itemName);
  const history: { date: string; merchant: string; price: number; qty: number; transactionId: string }[] = [];

  for (const tx of transactions) {
    for (const item of tx.items ?? []) {
      if (normalise(item.name) !== key) continue;
      history.push({
        date: tx.date,
        merchant: tx.merchant,
        price: item.unitPrice,
        qty: item.qty,
        transactionId: tx.id,
      });
    }
  }

  return history.sort((a, b) => b.date.localeCompare(a.date));
}

/* ===================== ANOMALIES ===================== */

export interface Anomaly {
  transaction: Transaction;
  categoryMedian: number;
  multiple: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function detectAnomalies(transactions: Transaction[]): Anomaly[] {
  const today = todayISO();
  const byCategory = new Map<string, number[]>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (daysBetween(tx.date, today) > 120) continue;
    const bucket = byCategory.get(String(tx.category)) ?? [];
    bucket.push(Math.abs(tx.amount));
    byCategory.set(String(tx.category), bucket);
  }

  const anomalies: Anomaly[] = [];
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const age = daysBetween(tx.date, today);
    if (age < 0 || age > 14) continue;

    const bucket = byCategory.get(String(tx.category)) ?? [];
    if (bucket.length < 4) continue;

    const categoryMedian = median(bucket);
    if (categoryMedian <= 0) continue;

    const multiple = Math.abs(tx.amount) / categoryMedian;
    if (multiple >= 2.5) anomalies.push({ transaction: tx, categoryMedian, multiple });
  }

  return anomalies.sort((a, b) => b.multiple - a.multiple);
}

/* ===================== FORECAST ===================== */

export interface Forecast {
  projectedSpend: number;
  committed: number;
  paceSoFar: number;
  overBudgetBy: number;
}

export function forecastMonth(
  transactions: Transaction[],
  subscriptions: Subscription[],
  settings: Settings
): Forecast {
  const key = currentMonthKey();
  const total = daysInMonth(key);
  const dayOfMonth = fromISO(todayISO()).getDate();
  const spent = spendOf(inMonth(transactions, key));
  const pace = dayOfMonth > 0 ? spent / dayOfMonth : 0;
  const daysLeft = Math.max(0, total - dayOfMonth);

  const committed = subscriptions
    .filter((sub) => sub.status === 'active')
    .filter((sub) => {
      const days = daysUntil(sub.nextRenewal);
      return days >= 0 && days <= daysLeft;
    })
    .reduce((sum, sub) => sum + sub.cost, 0);

  const projectedSpend = spent + pace * daysLeft + committed;

  return {
    projectedSpend,
    committed,
    paceSoFar: pace,
    overBudgetBy: settings.monthlyBudget > 0 ? projectedSpend - settings.monthlyBudget : 0,
  };
}

/* ===================== SIGNALS ===================== */

export function buildSignals(
  transactions: Transaction[],
  subscriptions: Subscription[],
  investments: Investment[],
  settings: Settings,
  summary: AccountSummary
): Signal[] {
  const currency = settings.currency;
  const signals: Signal[] = [];
  const vaultNames = new Set(subscriptions.map((sub) => normalise(sub.name)));

  for (const candidate of detectRecurring(transactions)) {
    const known = vaultNames.has(normalise(candidate.merchant));

    if (!known && candidate.occurrences >= 3) {
      signals.push({
        id: `recurring:${normalise(candidate.merchant)}`,
        kind: 'recurring-candidate',
        tone: 'info',
        icon: 'autorenew',
        title: `${candidate.merchant} looks recurring`,
        body: `Charged ${candidate.occurrences} times, about every ${candidate.intervalDays} days, around ${money(
          candidate.typicalAmount,
          currency,
          0
        )}. Track it in the Vault and you'll get a countdown before each renewal.`,
        action: { label: 'Add to Vault', payload: candidate },
      });
    }

    if (candidate.changePercent >= 3 && candidate.latestAmount - candidate.typicalAmount >= 1) {
      signals.push({
        id: `hike:${normalise(candidate.merchant)}:${candidate.lastDate}`,
        kind: 'price-hike',
        tone: 'warn',
        icon: 'trending_up',
        title: `${candidate.merchant} went up`,
        body: `Now ${money(candidate.latestAmount, currency, 0)}, was usually ${money(
          candidate.typicalAmount,
          currency,
          0
        )} — ${Math.round(candidate.changePercent)}% more, ${money(
          (candidate.latestAmount - candidate.typicalAmount) * (candidate.intervalDays > 200 ? 1 : 12),
          currency,
          0
        )} a year.`,
      });
    }
  }

  for (const move of basketPriceMoves(transactions).slice(0, 3)) {
    const up = move.changePercent > 0;
    signals.push({
      id: `basket:${normalise(move.name)}:${move.lastSeen}`,
      kind: 'basket-price',
      tone: up ? 'warn' : 'good',
      icon: up ? 'local_fire_department' : 'savings',
      title: `${move.name} ${up ? 'costs more' : 'got cheaper'}`,
      body: `${money(move.previousPrice, currency, 0)} → ${money(move.latestPrice, currency, 0)} (${
        up ? '+' : ''
      }${Math.round(move.changePercent)}%) at ${move.merchant}. Seen ${move.timesBought} times.`,
      action: { label: 'See history', payload: move.name },
    });
  }

  for (const anomaly of detectAnomalies(transactions).slice(0, 2)) {
    signals.push({
      id: `anomaly:${anomaly.transaction.id}`,
      kind: 'anomaly',
      tone: 'warn',
      icon: 'priority_high',
      title: `Unusual ${anomaly.transaction.category} spend`,
      body: `${anomaly.transaction.merchant} at ${money(
        Math.abs(anomaly.transaction.amount),
        currency,
        0
      )} is ${anomaly.multiple.toFixed(1)}× your usual ${money(anomaly.categoryMedian, currency, 0)} for that category.`,
      action: { label: 'Open entry', payload: anomaly.transaction.id },
    });
  }

  if (settings.monthlyBudget > 0) {
    const forecast = forecastMonth(transactions, subscriptions, settings);
    if (Math.abs(forecast.overBudgetBy) > settings.monthlyBudget * 0.05) {
      const over = forecast.overBudgetBy > 0;
      signals.push({
        id: `forecast:${currentMonthKey()}:${over ? 'over' : 'under'}`,
        kind: 'forecast',
        tone: over ? 'warn' : 'good',
        icon: over ? 'speed' : 'check_circle',
        title: over ? 'On pace to overshoot' : 'On pace to come in under',
        body: `At this rate the month closes near ${compactMoney(forecast.projectedSpend, currency)} against a ${compactMoney(
          settings.monthlyBudget,
          currency
        )} budget${
          forecast.committed > 0 ? `, including ${money(forecast.committed, currency, 0)} of bills still due` : ''
        }.`,
      });
    }
  }

  const stale = investments.filter((inv) => daysBetween(inv.priceUpdatedAt, todayISO()) >= 7);
  if (stale.length > 0) {
    signals.push({
      id: `stale:${stale.length}:${todayISO().slice(0, 7)}`,
      kind: 'stale-price',
      tone: 'info',
      icon: 'update',
      title: `${stale.length} holding${stale.length === 1 ? '' : 's'} need a price check`,
      body: `${stale
        .slice(0, 3)
        .map((inv) => inv.name)
        .join(', ')}${stale.length > 3 ? ` and ${stale.length - 3} more` : ''} last updated ${displayDate(
        stale[0].priceUpdatedAt
      )}. Your portfolio value is only as fresh as these.`,
      action: { label: 'Open Invest', payload: 'invest' },
    });
  }

  if (summary.savingsRate < 0 && summary.monthlyIncome > 0) {
    signals.push({
      id: `pace:negative:${currentMonthKey()}`,
      kind: 'budget-pace',
      tone: 'warn',
      icon: 'warning',
      title: 'Spending more than you earned',
      body: `This month's outflow is ${money(
        summary.monthlySpend - summary.monthlyIncome,
        currency,
        0
      )} above what came in. The gap is coming out of savings.`,
    });
  }

  return signals;
}

/* ===================== BRIEFS ===================== */

export function buildBrief(
  kind: BriefKind,
  transactions: Transaction[],
  subscriptions: Subscription[],
  settings: Settings,
  summary: AccountSummary
): Brief {
  const currency = settings.currency;
  const today = todayISO();
  const sts = safeToSpend(transactions, subscriptions, settings, summary);

  const upcoming = subscriptions
    .filter((sub) => sub.status === 'active')
    .map((sub) => ({ sub, days: daysUntil(sub.nextRenewal) }))
    .filter((entry) => entry.days >= 0 && entry.days <= (kind === 'weekly' ? 7 : 3))
    .sort((a, b) => a.days - b.days);

  if (kind === 'evening') {
    const todayEntries = transactions.filter((tx) => tx.date === today);
    const spent = todayEntries.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const lines: string[] = [];
    if (todayEntries.length === 0) {
      lines.push('Nothing logged today yet.');
      lines.push('Snap a bill or type what you spent — it takes about ten seconds.');
    } else {
      lines.push(`${todayEntries.length} entr${todayEntries.length === 1 ? 'y' : 'ies'}, ${money(spent, currency)} out.`);
      if (sts.configured) {
        const delta = sts.perDay - spent;
        lines.push(
          delta >= 0
            ? `${money(delta, currency, 0)} under today's safe-to-spend.`
            : `${money(-delta, currency, 0)} over today's safe-to-spend.`
        );
      }
      lines.push('Anything cash you paid that is not in here yet?');
    }

    return {
      kind,
      date: today,
      headline: todayEntries.length === 0 ? 'How did today go?' : `Today: ${money(spent, currency, 0)}`,
      lines,
    };
  }

  if (kind === 'weekly') {
    const weekAgo = transactions.filter((tx) => {
      const age = daysBetween(tx.date, today);
      return age >= 0 && age < 7;
    });
    const spent = spendOf(weekAgo);
    const lines = [
      `${money(spent, currency)} across ${weekAgo.length} entries this week.`,
      `Month so far: ${money(summary.monthlySpend, currency, 0)}${
        settings.monthlyBudget > 0 ? ` of ${compactMoney(settings.monthlyBudget, currency)}` : ''
      }.`,
    ];
    if (upcoming.length > 0) {
      lines.push(
        `Due next week: ${upcoming.map((entry) => `${entry.sub.name} ${money(entry.sub.cost, currency, 0)}`).join(', ')}.`
      );
    }
    return { kind, date: today, headline: 'Your week in money', lines };
  }

  // Morning
  const yesterday = transactions.filter((tx) => daysBetween(tx.date, today) === 1);
  const yesterdaySpend = spendOf(yesterday);

  const lines: string[] = [];
  lines.push(
    yesterday.length === 0
      ? 'Nothing logged yesterday.'
      : `Yesterday: ${money(yesterdaySpend, currency)} across ${yesterday.length} entr${
          yesterday.length === 1 ? 'y' : 'ies'
        }.`
  );

  if (sts.configured) {
    lines.push(
      sts.perDay > 0
        ? `Safe to spend today: ${money(sts.perDay, currency, 0)} — ${sts.daysLeft} days left in the month.`
        : `Budget is spent. ${money(Math.abs(sts.remaining), currency, 0)} over with ${sts.daysLeft} days to go.`
    );
  } else {
    lines.push(`Month so far: ${money(summary.monthlySpend, currency, 0)} out, ${money(summary.monthlyIncome, currency, 0)} in.`);
  }

  if (upcoming.length > 0) {
    lines.push(
      `Coming up: ${upcoming
        .map((entry) => `${entry.sub.name} ${money(entry.sub.cost, currency, 0)} ${entry.days === 0 ? 'today' : `in ${entry.days}d`}`)
        .join(', ')}.`
    );
  }

  return {
    kind,
    date: today,
    headline: `Good morning${settings.displayName && settings.displayName !== 'You' ? `, ${settings.displayName.split(' ')[0]}` : ''}`,
    lines,
  };
}

/** Turns a detected recurring charge into a Vault entry. */
export function candidateToSubscription(
  candidate: RecurringCandidate
): Omit<Subscription, 'id'> {
  const yearly = candidate.intervalDays > 200;
  const nextRenewal = addMonths(candidate.lastDate, yearly ? 12 : 1);
  return {
    name: candidate.merchant,
    plan: '',
    category: 'Other',
    kind: 'subscription',
    cost: candidate.latestAmount,
    billingPeriod: yearly ? 'yr' : 'mo',
    nextRenewal,
    cycleStart: candidate.lastDate,
    status: 'active',
    notes: `Detected from ${candidate.occurrences} charges in your ledger`,
    autoLog: false,
  };
}

/** Most-used merchants in a category, for the evening nudge's one-tap repeats. */
export function frequentEntries(transactions: Transaction[], limit = 4): Omit<Transaction, 'id'>[] {
  const today = todayISO();
  const map = new Map<string, { tx: Transaction; count: number }>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (daysBetween(tx.date, today) > 60) continue;
    if (monthKey(tx.date) < monthKey(addMonths(today, -2))) continue;
    const key = `${normalise(tx.merchant)}|${Math.abs(tx.amount)}`;
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { tx, count: 1 });
  }

  return [...map.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ tx }) => ({
      merchant: tx.merchant,
      category: tx.category,
      date: today,
      amount: tx.amount,
      iconName: tx.iconName,
      type: tx.type,
      paymentMethod: tx.paymentMethod,
      origin: 'quick-add' as const,
    }));
}
