import { Investment, Settings, Subscription, Transaction } from '../types';
import { addDays, addMonths, currentMonthKey, shiftMonthKey, todayISO } from '../lib/dates';
import { iconForCategory } from '../lib/finance';
import { uid } from '../lib/storage';

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'You',
  currency: 'INR',
  openingBalance: 0,
  monthlyBudget: 0,
  keepReceipts: true,
  remindersEnabled: false,
  morningBriefTime: '08:00',
  eveningNudgeTime: '20:30',
  weeklyReviewDay: 0,
};

/** A fresh install starts empty — this is your ledger, not a showcase. */
export const EMPTY_TRANSACTIONS: Transaction[] = [];
export const EMPTY_SUBSCRIPTIONS: Subscription[] = [];
export const EMPTY_INVESTMENTS: Investment[] = [];

function dayOfMonth(key: string, day: number): string {
  return `${key}-${`${day}`.padStart(2, '0')}`;
}

function tx(
  merchant: string,
  category: Transaction['category'],
  amount: number,
  date: string,
  type: Transaction['type'],
  extra: Partial<Transaction> = {}
): Transaction {
  return {
    id: uid('tx'),
    merchant,
    category,
    amount,
    date,
    type,
    iconName: iconForCategory(category),
    ...extra,
  };
}

/**
 * Sample data anchored to the real calendar, so the demo always shows a
 * live-looking current month. Loaded on demand from Profile → Load sample data.
 */
export function buildDemoData(): {
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  settings: Settings;
} {
  const now = currentMonthKey();
  const prev = shiftMonthKey(now, -1);
  const prev2 = shiftMonthKey(now, -2);
  const today = todayISO();

  const transactions: Transaction[] = [
    tx('Monthly Salary', 'Salary', 92000, dayOfMonth(now, 1), 'income', {
      note: 'Net credit after tax',
      paymentMethod: 'Bank transfer',
    }),
    tx('Big Bazaar', 'Groceries', -3480, dayOfMonth(now, 2), 'discretionary', {
      note: 'Monthly pantry run',
      paymentMethod: 'UPI',
      items: [
        { id: uid('li'), name: 'Rice 10kg', qty: 1, unitPrice: 720 },
        { id: uid('li'), name: 'Toor dal 2kg', qty: 1, unitPrice: 340 },
        { id: uid('li'), name: 'Cooking oil 5L', qty: 1, unitPrice: 890 },
        { id: uid('li'), name: 'Milk 1L', qty: 12, unitPrice: 62 },
        { id: uid('li'), name: 'Vegetables', qty: 1, unitPrice: 786 },
      ],
    }),
    tx('House Rent', 'Rent & Housing', -22000, dayOfMonth(now, 3), 'fixed', { paymentMethod: 'Bank transfer' }),
    tx('Electricity Board', 'Utilities', -1840, dayOfMonth(now, 5), 'fixed', { note: 'Aug billing cycle' }),
    tx('Jio Prepaid Recharge', 'Recharge', -3599, dayOfMonth(now, 6), 'fixed', {
      note: '2GB/day • 365 days',
      paymentMethod: 'UPI',
    }),
    tx('Swiggy', 'Dining', -640, addDays(today, -6), 'discretionary', { note: 'Weekend order' }),
    tx('Uber', 'Transportation', -285, addDays(today, -4), 'discretionary'),
    tx('Reliance Fresh', 'Groceries', -1260, addDays(today, -3), 'discretionary', {
      paymentMethod: 'UPI',
      items: [
        { id: uid('li'), name: 'Fruits', qty: 1, unitPrice: 480 },
        { id: uid('li'), name: 'Eggs (30)', qty: 1, unitPrice: 210 },
        { id: uid('li'), name: 'Bread & spreads', qty: 1, unitPrice: 570 },
      ],
    }),
    tx('SIP — Nifty 50 Index', 'Investment', -10000, addDays(today, -2), 'fixed', {
      note: 'Monthly SIP debit',
    }),
    tx('Freelance Retainer', 'Freelance', 18000, addDays(today, -2), 'income'),
    tx('Cult Fit', 'Health & Wellness', -1999, addDays(today, -1), 'fixed'),
    tx('Blue Tokai Coffee', 'Dining', -420, today, 'discretionary'),

    // Previous month, so the deltas on the Hub have something to compare against.
    tx('Monthly Salary', 'Salary', 92000, dayOfMonth(prev, 1), 'income'),
    tx('House Rent', 'Rent & Housing', -22000, dayOfMonth(prev, 3), 'fixed'),
    tx('DMart', 'Groceries', -5120, dayOfMonth(prev, 8), 'discretionary'),
    tx('Zomato', 'Dining', -1890, dayOfMonth(prev, 12), 'discretionary'),
    tx('Electricity Board', 'Utilities', -2260, dayOfMonth(prev, 6), 'fixed'),
    tx('Amazon', 'Shopping', -4300, dayOfMonth(prev, 18), 'discretionary'),
    tx('SIP — Nifty 50 Index', 'Investment', -10000, dayOfMonth(prev, 20), 'fixed'),
    tx('Reliance Fresh', 'Groceries', -1180, dayOfMonth(prev, 22), 'discretionary', {
      paymentMethod: 'UPI',
      items: [
        { id: uid('li'), name: 'Fruits', qty: 1, unitPrice: 505 },
        { id: uid('li'), name: 'Eggs (30)', qty: 1, unitPrice: 195 },
        { id: uid('li'), name: 'Milk 1L', qty: 8, unitPrice: 58 },
      ],
    }),

    // A third month back, so the recurring radar has a pattern to lock onto.
    tx('Monthly Salary', 'Salary', 92000, dayOfMonth(prev2, 1), 'income'),
    tx('House Rent', 'Rent & Housing', -22000, dayOfMonth(prev2, 3), 'fixed'),
    tx('Electricity Board', 'Utilities', -1920, dayOfMonth(prev2, 6), 'fixed'),
    tx('SIP — Nifty 50 Index', 'Investment', -10000, dayOfMonth(prev2, 20), 'fixed'),
    tx('Cult Fit', 'Health & Wellness', -1799, dayOfMonth(prev2, 24), 'fixed'),
    tx('Cult Fit', 'Health & Wellness', -1799, dayOfMonth(prev, 24), 'fixed'),
    tx('Big Bazaar', 'Groceries', -3120, dayOfMonth(prev2, 2), 'discretionary', {
      paymentMethod: 'UPI',
      items: [
        { id: uid('li'), name: 'Rice 10kg', qty: 1, unitPrice: 690 },
        { id: uid('li'), name: 'Cooking oil 5L', qty: 1, unitPrice: 940 },
        { id: uid('li'), name: 'Milk 1L', qty: 10, unitPrice: 57 },
      ],
    }),
  ];

  const sub = (
    name: string,
    plan: string,
    category: string,
    kind: Subscription['kind'],
    cost: number,
    billingPeriod: Subscription['billingPeriod'],
    renewalInDays: number,
    notes?: string
  ): Subscription => {
    const nextRenewal = addDays(today, renewalInDays);
    return {
      id: uid('sub'),
      name,
      plan,
      category,
      kind,
      cost,
      billingPeriod,
      nextRenewal,
      cycleStart: billingPeriod === 'yr' ? addMonths(nextRenewal, -12) : addMonths(nextRenewal, -1),
      status: 'active',
      notes,
      autoLog: true,
    };
  };

  const subscriptions: Subscription[] = [
    sub('Netflix', 'Premium 4K', 'Entertainment', 'subscription', 649, 'mo', 4, 'Shared family plan'),
    sub('Spotify', 'Duo', 'Music', 'subscription', 149, 'mo', 11),
    sub('YouTube Premium', 'Individual', 'Entertainment', 'subscription', 149, 'mo', 19),
    sub('Google One', '200 GB', 'Cloud Storage', 'subscription', 1300, 'yr', 62, 'Photos + Drive backup'),
    sub('Jio Prepaid', '2GB/day • 365 days', 'Mobile', 'recharge', 3599, 'yr', 298, 'Primary number'),
    sub('Airtel Fiber', '200 Mbps unlimited', 'Broadband', 'recharge', 1099, 'mo', 8),
    sub('Tata Play DTH', 'Hindi Value Pack', 'DTH', 'recharge', 399, 'mo', 22),
  ];

  const inv = (
    name: string,
    symbol: string,
    assetClass: Investment['assetClass'],
    units: number,
    avgCost: number,
    currentPrice: number,
    monthsAgo: number,
    notes?: string
  ): Investment => ({
    id: uid('inv'),
    name,
    symbol,
    assetClass,
    units,
    avgCost,
    currentPrice,
    openedDate: addMonths(today, -monthsAgo),
    priceUpdatedAt: today,
    notes,
  });

  const investments: Investment[] = [
    inv('Nifty 50 Index Fund', 'NIFTY50', 'Mutual Fund', 420.5, 218.4, 246.9, 14, 'Monthly SIP ₹10,000'),
    inv('Parag Parikh Flexi Cap', 'PPFCF', 'Mutual Fund', 180.2, 62.1, 78.35, 22),
    inv('Infosys', 'INFY', 'Stocks', 40, 1420, 1588.6, 9),
    inv('HDFC Bank', 'HDFCBANK', 'Stocks', 25, 1610, 1542.3, 6, 'Averaging down on dips'),
    inv('Sovereign Gold Bond', 'SGB', 'Gold', 12, 5820, 7140, 30),
    inv('Bitcoin', 'BTC', 'Crypto', 0.045, 4820000, 5310000, 11),
    inv('Bank FD — 7.1%', 'FD', 'Fixed Deposit', 1, 150000, 158900, 18, 'Matures next year'),
  ];

  return {
    transactions,
    subscriptions,
    investments,
    settings: {
      ...DEFAULT_SETTINGS,
      displayName: 'Demo User',
      openingBalance: 145000,
      monthlyBudget: 55000,
    },
  };
}
