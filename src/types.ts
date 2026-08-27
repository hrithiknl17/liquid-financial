export type NavTab = 'hub' | 'ledger' | 'income' | 'vault' | 'invest';

export const EXPENSE_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transportation',
  'Utilities',
  'Rent & Housing',
  'Health & Wellness',
  'Entertainment',
  'Shopping',
  'Education',
  'Recharge',
  'Subscription',
  'Investment',
  'Other',
] as const;

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Refund', 'Dividend', 'Interest', 'Other Income'] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type Category = ExpenseCategory | IncomeCategory;

/** A single line on a grocery/shopping bill. */
export interface LineItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Transaction {
  id: string;
  merchant: string;
  category: Category;
  /** ISO date, YYYY-MM-DD. Single source of truth for every date label and grouping. */
  date: string;
  /** Negative for money out, positive for money in. */
  amount: number;
  iconName: string;
  note?: string;
  /**
   * `transfer` moves cash without being spending or earning — lending money,
   * getting it back, blocking funds for an IPO. It changes the balance but
   * never the spend or income totals.
   */
  type: 'discretionary' | 'fixed' | 'income' | 'transfer';
  paymentMethod?: string;
  /** Itemised basket, used mainly for grocery runs. */
  items?: LineItem[];
  /** Set when the transaction was auto-logged from a Vault renewal. */
  sourceId?: string;
  /** Key into the local receipt store (IndexedDB) for the scanned bill image. */
  receiptId?: string;
  /** How this entry got here. Manual unless stated. */
  origin?: 'manual' | 'scan' | 'quick-add' | 'auto-vault' | 'agent' | 'rent';
  /**
   * Set on a rent/income collection. The period's `received` is the sum of the
   * entries pointing at it — never a stored counter, so two devices that were
   * offline together merge by appending rather than overwriting a number.
   */
  dueId?: string;
  /** Set on a loan repayment (never on the original disbursement). */
  loanId?: string;
}

export type VaultKind = 'subscription' | 'recharge';

export interface Subscription {
  id: string;
  name: string;
  /** Plan / pack name, e.g. "Premium 4K" or "2GB/day 84 days". */
  plan: string;
  category: string;
  kind: VaultKind;
  cost: number;
  billingPeriod: 'mo' | 'yr';
  /** ISO date of the next charge. Countdown and progress are derived from this. */
  nextRenewal: string;
  /** ISO date the current cycle started. Drives the cycle progress bar. */
  cycleStart: string;
  status: 'active' | 'paused' | 'cancelled';
  /** Optional logo. Falls back to a generated initial tile so the app works offline. */
  imageUrl?: string;
  accent?: string;
  notes?: string;
  autoLog?: boolean;
}

export const ASSET_CLASSES = [
  'Stocks',
  'Mutual Fund',
  'ETF',
  'Crypto',
  'Gold',
  'Fixed Deposit',
  'Bonds',
  'IPO',
  'Other',
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export interface Investment {
  id: string;
  name: string;
  symbol?: string;
  assetClass: AssetClass;
  units: number;
  /** Average buy price per unit. */
  avgCost: number;
  /** Latest known price per unit. Updated by hand. */
  currentPrice: number;
  /** ISO date of the first buy. */
  openedDate: string;
  /** ISO date the price was last touched. */
  priceUpdatedAt: string;
  notes?: string;
  accent?: string;
  /**
   * Set while an IPO application is outstanding. Under ASBA the money is
   * blocked, not spent, so an applied IPO stays out of portfolio value and
   * invested totals until it is allotted.
   */
  ipo?: IpoApplication;
}

export interface IpoApplication {
  status: 'applied' | 'allotted' | 'not-allotted';
  lots: number;
  lotSize: number;
  /** Price bid per share, usually the cut-off. */
  cutoffPrice: number;
  applicationDate: string;
  /** Expected or actual basis-of-allotment date. */
  allotmentDate?: string;
  /** Lots actually allotted; below `lots` on partial allotment. */
  allottedLots?: number;
}

export interface Settings {
  displayName: string;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  /** Opening cash balance before any logged transaction. */
  openingBalance: number;
  /** Optional monthly spending cap; drives the burn gauge. */
  monthlyBudget: number;

  /**
   * Personal Gemini key, used only when the server proxy is unavailable.
   * Stored in this browser alone and never bundled into the build.
   */
  geminiApiKey?: string;
  geminiModel?: string;
  /** Keep the photo of every scanned bill so you can look it up later. */
  keepReceipts: boolean;

  remindersEnabled: boolean;
  /** 24h HH:MM local times for the two daily touchpoints. */
  morningBriefTime: string;
  eveningNudgeTime: string;
  /** Weekday index (0 = Sunday) for the weekly review. */
  weeklyReviewDay: number;
}

/** Everything on this object is derived from transactions — never stored. */
export interface AccountSummary {
  cashBalance: number;
  monthlyIncome: number;
  monthlyIncomeChange: number;
  monthlySpend: number;
  monthlySpendChange: number;
  discretionaryPercentage: number;
  fixedCostsPercentage: number;
  groceriesThisMonth: number;
  savingsRate: number;
}


/** An actionable card produced by the insight engine. */
export type SignalKind =
  | 'recurring-candidate'
  | 'price-hike'
  | 'basket-price'
  | 'anomaly'
  | 'forecast'
  | 'stale-price'
  | 'budget-pace';

export interface Signal {
  /** Stable across recomputation so a dismissal sticks. */
  id: string;
  kind: SignalKind;
  tone: 'good' | 'warn' | 'info';
  title: string;
  body: string;
  icon: string;
  /** Optional one-tap follow-through, wired by the Hub. */
  action?: { label: string; payload?: unknown };
}

export type BriefKind = 'morning' | 'evening' | 'weekly';

export interface Brief {
  kind: BriefKind;
  /** ISO date the brief covers. */
  date: string;
  headline: string;
  lines: string[];
}


/* ===================== INCOME SOURCES ===================== */

export const INCOME_SOURCE_KINDS = [
  'House rent',
  'Shop rent',
  'Land lease',
  'Salary',
  'Freelance retainer',
  'Interest',
  'Other',
] as const;

export type IncomeSourceKind = (typeof INCOME_SOURCE_KINDS)[number];

/** Something that is supposed to pay you on a schedule. */
export interface IncomeSource {
  id: string;
  /** What it is: "Shop 2 — MG Road", "Flat 301". */
  name: string;
  kind: IncomeSourceKind;
  /** Who owes it. */
  payer?: string;
  payerContact?: string;
  /** Expected amount per period. */
  amount: number;
  frequency: 'mo' | 'qtr' | 'yr';
  /** Day of the month the payment is due. Clamped to short months. */
  dueDay: number;
  /** First period this source should generate a due for. */
  startDate: string;
  /** Set when the arrangement ends; no dues are generated past it. */
  endDate?: string;
  status: 'active' | 'ended';
  /** Deposit held, for reference only — never counted as income. */
  depositHeld?: number;
  notes?: string;
}

export type DueStatus = 'pending' | 'partial' | 'paid' | 'waived';

/**
 * One expected payment for one period. `carriedOver` is what went unpaid in
 * earlier periods, so a missed ₹8,000 shows next month as ₹16,000 owed.
 */
export interface IncomeDue {
  id: string;
  sourceId: string;
  /** YYYY-MM of the period this covers. */
  periodKey: string;
  dueDate: string;
  expected: number;
  carriedOver: number;
  /** Derived from the transactions tagged with this due's id. Never authored. */
  received: number;
  /** Derived: the date of the most recent payment against this period. */
  lastReceivedDate?: string;
  status: DueStatus;
  note?: string;
}


/* ===================== LOANS ===================== */

/** Money lent to someone, or borrowed from them. Settled by repayments. */
export interface Loan {
  id: string;
  person: string;
  direction: 'lent' | 'borrowed';
  principal: number;
  /** When the money changed hands. */
  date: string;
  /** When you expect it back, if there was an understanding. */
  expectedBack?: string;
  /** Derived from the repayment transactions tagged with this loan's id. */
  repaid: number;
  /**
   * `written-off` is authored; `open` vs `settled` is derived from what has
   * been repaid.
   */
  status: 'open' | 'settled' | 'written-off';
  /** The ledger entry for the original movement of money. */
  transactionIds: string[];
  note?: string;
}
