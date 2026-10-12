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
import { AgentContent, buildAgentRequest, READ_ONLY_TOOLS } from './prompts';
import { categoryNames } from './categories';
import { searchLedger } from './ledgerSearch';
import { SearchArgs, summarizeSpending } from './ledgerTools';

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

/** An entry an answer relied on, shown as a chip the user can open. */
export interface AgentSource {
  id: string;
  kind: 'transaction' | 'vault_plan' | 'holding' | 'income_source' | 'loan';
  label: string;
  date?: string;
  amount?: number;
  /** A scanned bill photo exists for this entry. */
  hasBill?: boolean;
}

export interface AgentResult {
  reply: string | null;
  actions: ProposedAction[];
  sources: AgentSource[];
  /** How many read-only lookups the answer took. */
  lookups: number;
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

/* ============================ SOURCES ============================ */

/** Strips chunk prefixes ("tx:", "item:<id>:<n>") a model may echo back instead of the bare id. */
function bareId(id: string): string {
  const parts = id.split(':');
  if (parts.length === 1) return id;
  return parts[0] === 'item' ? parts[1] : parts.slice(1).join(':');
}

/** Turns cited ids into chips the UI can show and open. Unknown ids are dropped, never invented. */
export function resolveSources(ids: string[], state: AgentState): AgentSource[] {
  const out: AgentSource[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = bareId(String(raw));
    if (seen.has(id)) continue;
    seen.add(id);
    const tx = state.transactions.find((entry) => entry.id === id);
    if (tx) {
      out.push({ id, kind: 'transaction', label: tx.merchant, date: tx.date, amount: tx.amount, hasBill: Boolean(tx.receiptId) });
      continue;
    }
    const sub = state.subscriptions.find((entry) => entry.id === id);
    if (sub) {
      out.push({ id, kind: 'vault_plan', label: sub.name, date: sub.nextRenewal, amount: -sub.cost });
      continue;
    }
    const inv = state.investments.find((entry) => entry.id === id);
    if (inv) {
      out.push({ id, kind: 'holding', label: inv.name, amount: inv.units * inv.currentPrice });
      continue;
    }
    const src = state.incomeSources.find((entry) => entry.id === id);
    if (src) {
      out.push({ id, kind: 'income_source', label: src.name, amount: src.amount });
      continue;
    }
    const loan = state.loans.find((entry) => entry.id === id);
    if (loan) out.push({ id, kind: 'loan', label: loan.person, date: loan.date, amount: loan.principal });
  }
  return out.slice(0, 6);
}

/** Ids a tool result points at, used when the model forgets to cite. */
function idsInResult(result: unknown): string[] {
  const ids: string[] = [];
  const visit = (value: unknown, key?: string) => {
    if (Array.isArray(value)) value.forEach((entry) => visit(entry));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    } else if (typeof value === 'string' && (key === 'id' || key === 'sourceId' || key === 'transactionId')) {
      ids.push(value);
    }
  };
  visit(result);
  return ids;
}

/* ============================ THE LOOP ============================ */

type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
};

/** Lookups per question before giving up; each round is one model call. */
const MAX_TOOL_ROUNDS = 4;

async function runReadTool(name: string, args: Record<string, unknown>, state: AgentState) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : undefined);

  if (name === 'search_ledger') {
    const outcome = await searchLedger(
      { ...state, currency: state.settings.currency },
      {
        query: str(args.query) ?? '',
        kinds: list(args.kinds) as SearchArgs['kinds'],
        dateFrom: str(args.dateFrom),
        dateTo: str(args.dateTo),
        category: str(args.category),
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      }
    );
    return {
      mode: outcome.mode,
      count: outcome.hits.length,
      // Ids and the text that matched; amounts are signed (negative = money out).
      results: outcome.hits.map((hit) => ({
        sourceId: hit.sourceId,
        kind: hit.kind,
        text: hit.content,
        date: hit.date ?? undefined,
        amount: hit.amount ?? undefined,
      })),
    };
  }

  return summarizeSpending(state.transactions, {
    merchants: list(args.merchants),
    categories: list(args.categories),
    item: str(args.item),
    dateFrom: str(args.dateFrom),
    dateTo: str(args.dateTo),
    direction: args.direction === 'in' ? 'in' : 'out',
  });
}

/**
 * Sends the conversation to Gemini and turns its tool calls into proposals.
 *
 * Read-only lookups (search_ledger, summarize_spending) run here, in a short
 * loop, and their results go back to the model so it can look again or
 * answer. Writes still stop at proposals: nothing is applied here, the caller
 * confirms first.
 */
export async function runAgent(history: ChatTurn[], state: AgentState): Promise<AgentResult> {
  const toolTurns: AgentContent[] = [];
  const toolIds: string[] = [];
  let lookups = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const request = buildAgentRequest(
      history,
      buildContext(state),
      todayISO(),
      state.settings.currency,
      // Both kinds: the agent logs income as readily as spending.
      [...categoryNames('expense', state.categories), ...categoryNames('income', state.categories)],
      toolTurns
    );

    const payload = await callGemini('agent', request, state.settings, { raw: true });
    const content = (payload as { candidates?: { content?: { role?: string; parts?: Part[] } }[] }).candidates?.[0]?.content;
    const parts = content?.parts ?? [];

    const reads = parts.filter((part) => part.functionCall && READ_ONLY_TOOLS.has(part.functionCall.name));
    const otherCalls = parts.filter((part) => part.functionCall && !READ_ONLY_TOOLS.has(part.functionCall.name));

    if (reads.length > 0 && otherCalls.length === 0 && round < MAX_TOOL_ROUNDS) {
      // Replay the model's turn exactly as sent: Gemini 3 signs its tool calls
      // and rejects a follow-up that drops or edits them.
      toolTurns.push({ role: 'model', parts: parts as Record<string, unknown>[] });
      const responses: Record<string, unknown>[] = [];
      for (const part of reads) {
        const call = part.functionCall!;
        let result: unknown;
        try {
          result = await runReadTool(call.name, call.args ?? {}, state);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : 'Lookup failed' };
        }
        lookups += 1;
        toolIds.push(...idsInResult(result));
        responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: { result } } });
      }
      toolTurns.push({ role: 'user', parts: responses });
      continue;
    }

    return finish(parts, state, toolIds, lookups);
  }

  return {
    reply: 'I could not finish looking that up. Try a narrower question, like one merchant or one month.',
    actions: [],
    sources: [],
    lookups,
  };
}

function finish(parts: Part[], state: AgentState, toolIds: string[], lookups: number): AgentResult {
  const actions: ProposedAction[] = [];
  const texts: string[] = [];
  const cited: string[] = [];

  for (const part of parts) {
    if (part.functionCall) {
      const { name, args = {} } = part.functionCall;
      if (READ_ONLY_TOOLS.has(name)) continue;
      if (name === 'answer') {
        texts.push(String(args.text ?? ''));
        if (Array.isArray(args.sources)) cited.push(...args.sources.map(String));
        continue;
      }
      actions.push({
        id: `${name}-${actions.length}-${Date.now()}`,
        tool: name,
        args,
        summary: describe(name, args, state),
        destructive: DESTRUCTIVE.has(name),
      });
    } else if (part.text?.trim() && !part.thought) {
      texts.push(part.text.trim());
    }
  }

  // Sources only make sense for an answer that looked something up.
  const sources = lookups > 0 ? resolveSources(cited.length > 0 ? cited : toolIds.slice(0, 4), state) : [];

  return {
    reply: texts.length > 0 ? texts.join('\n\n') : null,
    actions,
    sources,
    lookups,
  };
}
