import {
  CustomCategory,
  IncomeDue,
  IncomeSource,
  Investment,
  IpoApplication,
  Loan,
  Subscription,
  Transaction,
} from '../types';

/**
 * Translation between the app's camelCase objects and the database's
 * snake_case rows.
 *
 * Two things are deliberately missing from every row: derived totals
 * (`received`, `repaid`, and the statuses computed from them) and
 * `carriedOver`. Storing them would mean two devices could disagree about a
 * number; recomputing them from the ledger means they cannot.
 */

type Row = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

/* ========================= TRANSACTIONS ========================= */

export function txToRow(tx: Transaction): Row {
  return {
    id: tx.id,
    merchant: tx.merchant,
    category: tx.category,
    date: tx.date,
    amount: tx.amount,
    icon_name: tx.iconName,
    note: tx.note ?? null,
    type: tx.type,
    payment_method: tx.paymentMethod ?? null,
    items: tx.items ?? null,
    source_id: tx.sourceId ?? null,
    receipt_id: tx.receiptId ?? null,
    origin: tx.origin ?? null,
    due_id: tx.dueId ?? null,
    loan_id: tx.loanId ?? null,
  };
}

export function rowToTx(row: Row): Transaction {
  return {
    id: String(row.id),
    merchant: String(row.merchant),
    category: row.category as Transaction['category'],
    date: String(row.date),
    amount: num(row.amount),
    iconName: String(row.icon_name ?? 'receipt_long'),
    note: str(row.note),
    type: row.type as Transaction['type'],
    paymentMethod: str(row.payment_method),
    items: (row.items as Transaction['items']) ?? undefined,
    sourceId: str(row.source_id),
    receiptId: str(row.receipt_id),
    origin: (str(row.origin) as Transaction['origin']) ?? undefined,
    dueId: str(row.due_id),
    loanId: str(row.loan_id),
  };
}

/* ========================= SUBSCRIPTIONS ========================= */

export function subToRow(sub: Subscription): Row {
  return {
    id: sub.id,
    name: sub.name,
    plan: sub.plan ?? null,
    category: sub.category ?? null,
    kind: sub.kind,
    cost: sub.cost,
    billing_period: sub.billingPeriod,
    next_renewal: sub.nextRenewal,
    cycle_start: sub.cycleStart,
    status: sub.status,
    image_url: sub.imageUrl ?? null,
    accent: sub.accent ?? null,
    notes: sub.notes ?? null,
    auto_log: Boolean(sub.autoLog),
  };
}

export function rowToSub(row: Row): Subscription {
  return {
    id: String(row.id),
    name: String(row.name),
    plan: String(row.plan ?? ''),
    category: String(row.category ?? 'Other'),
    kind: row.kind as Subscription['kind'],
    cost: num(row.cost),
    billingPeriod: row.billing_period as Subscription['billingPeriod'],
    nextRenewal: String(row.next_renewal),
    cycleStart: String(row.cycle_start),
    status: row.status as Subscription['status'],
    imageUrl: str(row.image_url),
    accent: str(row.accent),
    notes: str(row.notes),
    autoLog: Boolean(row.auto_log),
  };
}

/* ========================== INVESTMENTS ========================== */

export function invToRow(inv: Investment): Row {
  return {
    id: inv.id,
    name: inv.name,
    symbol: inv.symbol ?? null,
    asset_class: inv.assetClass,
    units: inv.units,
    avg_cost: inv.avgCost,
    current_price: inv.currentPrice,
    opened_date: inv.openedDate,
    price_updated_at: inv.priceUpdatedAt,
    notes: inv.notes ?? null,
    accent: inv.accent ?? null,
    ipo: inv.ipo ?? null,
  };
}

export function rowToInv(row: Row): Investment {
  return {
    id: String(row.id),
    name: String(row.name),
    symbol: str(row.symbol),
    assetClass: row.asset_class as Investment['assetClass'],
    units: num(row.units),
    avgCost: num(row.avg_cost),
    currentPrice: num(row.current_price),
    openedDate: String(row.opened_date),
    priceUpdatedAt: String(row.price_updated_at),
    notes: str(row.notes),
    accent: str(row.accent),
    ipo: (row.ipo as IpoApplication) ?? undefined,
  };
}

/* ========================= INCOME SOURCES ========================= */

export function sourceToRow(source: IncomeSource): Row {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    payer: source.payer ?? null,
    payer_contact: source.payerContact ?? null,
    amount: source.amount,
    frequency: source.frequency,
    due_day: source.dueDay,
    start_date: source.startDate,
    end_date: source.endDate ?? null,
    status: source.status,
    deposit_held: source.depositHeld ?? null,
    notes: source.notes ?? null,
  };
}

export function rowToSource(row: Row): IncomeSource {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as IncomeSource['kind'],
    payer: str(row.payer),
    payerContact: str(row.payer_contact),
    amount: num(row.amount),
    frequency: row.frequency as IncomeSource['frequency'],
    dueDay: num(row.due_day, 1),
    startDate: String(row.start_date),
    endDate: str(row.end_date),
    status: row.status as IncomeSource['status'],
    depositHeld: row.deposit_held === null ? undefined : num(row.deposit_held),
    notes: str(row.notes),
  };
}

/* =========================== INCOME DUES =========================== */

/** Only the period itself is stored; every amount is recomputed on read. */
export function dueToRow(due: IncomeDue): Row {
  return {
    id: due.id,
    source_id: due.sourceId,
    period_key: due.periodKey,
    due_date: due.dueDate,
    expected: due.expected,
    waived: due.status === 'waived',
    note: due.note ?? null,
  };
}

export function rowToDue(row: Row): IncomeDue {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    periodKey: String(row.period_key),
    dueDate: String(row.due_date),
    expected: num(row.expected),
    // Filled in by reconcileDues from the ledger.
    carriedOver: 0,
    received: 0,
    status: row.waived ? 'waived' : 'pending',
    note: str(row.note),
  };
}

/* ============================ CATEGORIES ============================ */

export function categoryToRow(category: CustomCategory): Row {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    icon_name: category.iconName,
  };
}

export function rowToCategory(row: Row): CustomCategory {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as CustomCategory['kind'],
    iconName: String(row.icon_name),
  };
}

/* ============================== LOANS ============================== */

export function loanToRow(loan: Loan): Row {
  return {
    id: loan.id,
    person: loan.person,
    direction: loan.direction,
    principal: loan.principal,
    date: loan.date,
    expected_back: loan.expectedBack ?? null,
    written_off: loan.status === 'written-off',
    note: loan.note ?? null,
  };
}

export function rowToLoan(row: Row): Loan {
  return {
    id: String(row.id),
    person: String(row.person),
    direction: row.direction as Loan['direction'],
    principal: num(row.principal),
    date: String(row.date),
    expectedBack: str(row.expected_back),
    // Recomputed by hydrateLoans from the repayment entries.
    repaid: 0,
    status: row.written_off ? 'written-off' : 'open',
    transactionIds: [],
    note: str(row.note),
  };
}
