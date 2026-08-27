import { Loan, Transaction } from '../types';
import { daysUntil, todayISO } from './dates';

/** What is still owed on a loan. */
export function outstandingLoan(loan: Loan): number {
  if (loan.status === 'written-off') return 0;
  return Math.max(0, loan.principal - loan.repaid);
}

/**
 * Replaces each loan's stored `repaid` with the sum of the repayment entries
 * tagged with its id, and derives open/settled from that. Only `written-off`
 * stays authored, so two offline devices settling the same loan append two
 * visible entries instead of racing on one number.
 */
export function hydrateLoans(loans: Loan[], transactions: Transaction[]): Loan[] {
  const repaidBy = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.loanId) continue;
    repaidBy.set(tx.loanId, (repaidBy.get(tx.loanId) ?? 0) + Math.abs(tx.amount));
  }

  return loans.map((loan) => {
    const repaid = repaidBy.get(loan.id) ?? 0;
    if (loan.status === 'written-off') return { ...loan, repaid };
    return {
      ...loan,
      repaid,
      status: repaid >= loan.principal - 0.005 ? ('settled' as const) : ('open' as const),
    };
  });
}

export interface LoanView {
  loan: Loan;
  outstanding: number;
  /** Days past the expected-back date; 0 when there is none or it is future. */
  daysLate: number;
  overdue: boolean;
  progress: number;
}

export function viewLoans(loans: Loan[]): LoanView[] {
  return loans
    .map((loan) => {
      const outstanding = outstandingLoan(loan);
      const days = loan.expectedBack ? daysUntil(loan.expectedBack) : 0;
      return {
        loan,
        outstanding,
        daysLate: days < 0 ? -days : 0,
        overdue: Boolean(loan.expectedBack) && days < 0 && outstanding > 0,
        progress: loan.principal === 0 ? 100 : Math.min(100, Math.round((loan.repaid / loan.principal) * 100)),
      } satisfies LoanView;
    })
    .sort((a, b) => {
      // Open first, overdue at the very top, then biggest outstanding.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const aOpen = a.loan.status === 'open';
      const bOpen = b.loan.status === 'open';
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return b.outstanding - a.outstanding;
    });
}

export interface LoanSummary {
  owedToYou: number;
  youOwe: number;
  openCount: number;
  overdueCount: number;
}

export function summarizeLoans(loans: Loan[]): LoanSummary {
  const views = viewLoans(loans);
  return {
    owedToYou: views
      .filter((view) => view.loan.direction === 'lent')
      .reduce((sum, view) => sum + view.outstanding, 0),
    youOwe: views
      .filter((view) => view.loan.direction === 'borrowed')
      .reduce((sum, view) => sum + view.outstanding, 0),
    openCount: views.filter((view) => view.loan.status === 'open').length,
    overdueCount: views.filter((view) => view.overdue).length,
  };
}

/**
 * Ledger entry for the money changing hands. Typed `transfer` so lending
 * ₹5,000 does not show up as ₹5,000 of spending.
 */
export function loanTransaction(loan: Omit<Loan, 'id'>, date = todayISO()): Omit<Transaction, 'id'> {
  const lent = loan.direction === 'lent';
  return {
    merchant: lent ? `Lent to ${loan.person}` : `Borrowed from ${loan.person}`,
    category: 'Other',
    date,
    amount: lent ? -Math.abs(loan.principal) : Math.abs(loan.principal),
    iconName: lent ? 'call_made' : 'call_received',
    type: 'transfer',
    note: loan.note,
    origin: 'manual',
  };
}

export function repaymentTransaction(
  loan: Loan,
  amount: number,
  date = todayISO()
): Omit<Transaction, 'id'> {
  const lent = loan.direction === 'lent';
  return {
    merchant: lent ? `${loan.person} repaid` : `Repaid ${loan.person}`,
    category: 'Other',
    date,
    amount: lent ? Math.abs(amount) : -Math.abs(amount),
    iconName: lent ? 'call_received' : 'call_made',
    type: 'transfer',
    note: `Settlement against ${lent ? 'money lent' : 'money borrowed'}`,
    origin: 'manual',
    loanId: loan.id,
  };
}
