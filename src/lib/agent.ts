import {
  CustomCategory,
  IncomeSource,
  Investment,
  Loan,
  Settings,
  Subscription,
  Transaction,
} from '../types';
import { displayDate, todayISO } from './dates';
import { money } from './format';
import { outstandingLoan } from './loans';
import { callGemini } from './ai';
import { buildAgentRequest } from './prompts';
import { categoryNames } from './categories';

export interface AgentState {
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  loans: Loan[];
  /** Offered to the model so it can file entries under your own categories. */
  categories: CustomCategory[];
  settings: Settings;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/** One change the model wants to make, waiting on the user's yes. */
export interface ProposedAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  /** Plain-language description shown on the confirmation card. */
  summary: string;
  destructive: boolean;
}

export interface AgentResult {
  reply: string | null;
  actions: ProposedAction[];
}

/**
 * A compact snapshot of the user's data. Ids are included so the model can
 * point at an exact record instead of guessing from a name.
 */
export function buildContext(state: AgentState): string {
  const { currency } = state.settings;
  const lines: string[] = [];

  const recent = state.transactions.slice(0, 12);
  if (recent.length > 0) {
    lines.push('RECENT TRANSACTIONS (id | merchant | amount | date):');
    for (const tx of recent) {
      lines.push(
        `  ${tx.id} | ${tx.merchant} | ${tx.amount > 0 ? '+' : ''}${tx.amount} | ${tx.date} | ${tx.category}`
      );
    }
  }

  if (state.subscriptions.length > 0) {
    lines.push('VAULT PLANS (id | name | plan | cost | period | kind | renews):');
    for (const sub of state.subscriptions) {
      lines.push(
        `  ${sub.id} | ${sub.name} | ${sub.plan || '-'} | ${sub.cost} | ${sub.billingPeriod} | ${sub.kind} | ${sub.nextRenewal} | ${sub.status}`
      );
    }
  }

  if (state.investments.length > 0) {
    lines.push('HOLDINGS (id | name | symbol | class | units | avg | price):');
    for (const inv of state.investments) {
      lines.push(
        `  ${inv.id} | ${inv.name} | ${inv.symbol ?? '-'} | ${inv.assetClass} | ${inv.units} | ${inv.avgCost} | ${inv.currentPrice}${
          inv.ipo ? ` | IPO ${inv.ipo.status}` : ''
        }`
      );
    }
  }

  if (state.incomeSources.length > 0) {
    lines.push('INCOME SOURCES (id | name | payer | amount | frequency | due day):');
    for (const source of state.incomeSources) {
      lines.push(
        `  ${source.id} | ${source.name} | ${source.payer ?? '-'} | ${source.amount} | ${source.frequency} | ${source.dueDay} | ${source.status}`
      );
    }
  }

  const openLoans = state.loans.filter((loan) => loan.status === 'open');
  if (openLoans.length > 0) {
    lines.push('LOANS (id | person | direction | principal | outstanding):');
    for (const loan of openLoans) {
      lines.push(
        `  ${loan.id} | ${loan.person} | ${loan.direction} | ${loan.principal} | ${outstandingLoan(loan)}`
      );
    }
  }

  if (lines.length === 0) lines.push('(The ledger is empty. Nothing tracked yet.)');
  lines.push(`CURRENCY: ${currency}`);
  return lines.join('\n');
}

const DESTRUCTIVE = new Set(['delete_transaction', 'remove_vault_plan']);

function describe(tool: string, args: Record<string, unknown>, state: AgentState): string {
  const c = state.settings.currency;
  const num = (key: string): number => Number(args[key] ?? 0);
  const str = (key: string): string => String(args[key] ?? '');

  const nameOf = (list: { id: string; name?: string; person?: string }[], id: string): string =>
    list.find((entry) => entry.id === id)?.name ??
    list.find((entry) => entry.id === id)?.person ??
    'that entry';

  switch (tool) {
    case 'add_transaction': {
      const dir = str('direction') === 'in' ? 'Income' : 'Spend';
      const when = num('dayOffset') === 0 ? 'today' : displayDate(offsetDate(num('dayOffset')));
      return `${dir} • ${money(num('amount'), c)} — ${str('merchant')} (${str('category')}, ${when})`;
    }
    case 'delete_transaction': {
      const tx = state.transactions.find((entry) => entry.id === str('id'));
      return tx
        ? `Delete "${tx.merchant}" ${money(Math.abs(tx.amount), c)} from ${displayDate(tx.date)}`
        : 'Delete a transaction';
    }
    case 'add_vault_plan':
      return `Track ${str('name')} — ${money(num('cost'), c)}/${str('billingPeriod')} (${str('kind')})`;
    case 'update_vault_plan': {
      const parts: string[] = [];
      if (args.cost !== undefined) parts.push(`cost ${money(num('cost'), c)}`);
      if (args.renewalInDays !== undefined) parts.push(`renews in ${num('renewalInDays')} days`);
      if (args.status !== undefined) parts.push(`status ${str('status')}`);
      return `Update ${nameOf(state.subscriptions, str('id'))}: ${parts.join(', ') || 'no change'}`;
    }
    case 'remove_vault_plan':
      return `Remove ${nameOf(state.subscriptions, str('id'))} from the Vault`;
    case 'add_holding':
      return `Track ${str('name')} — ${num('units')} units at ${money(num('avgCost'), c)}`;
    case 'update_holding_price':
      return `Set ${nameOf(state.investments, str('id'))} price to ${money(num('currentPrice'), c)}`;
    case 'add_income_source':
      return `Add income source ${str('name')} — ${money(num('amount'), c)} per ${str('frequency')}${
        args.payer ? ` from ${str('payer')}` : ''
      }`;
    case 'record_rent_payment': {
      const source = state.incomeSources.find((entry) => entry.id === str('sourceId'));
      const amount = args.amount === undefined ? 'everything outstanding' : money(num('amount'), c);
      return `Record ${amount} received for ${source?.name ?? 'that source'}`;
    }
    case 'add_loan':
      return str('direction') === 'lent'
        ? `Record ${money(num('amount'), c)} lent to ${str('person')}`
        : `Record ${money(num('amount'), c)} borrowed from ${str('person')}`;
    case 'record_loan_repayment': {
      const loan = state.loans.find((entry) => entry.id === str('id'));
      const amount = args.amount === undefined ? 'the full balance' : money(num('amount'), c);
      return `Settle ${amount} on the loan with ${loan?.person ?? 'that person'}`;
    }
    default:
      return tool.replace(/_/g, ' ');
  }
}

function offsetDate(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + Math.min(0, offset));
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Sends the conversation to Gemini and turns its tool calls into proposals.
 * Nothing is applied here — the caller confirms first.
 */
export async function runAgent(history: ChatTurn[], state: AgentState): Promise<AgentResult> {
  const request = buildAgentRequest(
    history,
    buildContext(state),
    todayISO(),
    state.settings.currency,
    // Both kinds: the agent logs income as readily as spending.
    [...categoryNames('expense', state.categories), ...categoryNames('income', state.categories)]
  );

  const payload = await callGemini('agent', request, state.settings, { raw: true });

  const parts =
    (payload as {
      candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] } }[];
    }).candidates?.[0]?.content?.parts ?? [];

  const actions: ProposedAction[] = [];
  const texts: string[] = [];

  for (const part of parts) {
    if (part.functionCall) {
      const { name, args = {} } = part.functionCall;
      if (name === 'answer') {
        texts.push(String(args.text ?? ''));
        continue;
      }
      actions.push({
        id: `${name}-${actions.length}-${Date.now()}`,
        tool: name,
        args,
        summary: describe(name, args, state),
        destructive: DESTRUCTIVE.has(name),
      });
    } else if (part.text?.trim()) {
      texts.push(part.text.trim());
    }
  }

  return {
    reply: texts.length > 0 ? texts.join('\n\n') : null,
    actions,
  };
}
