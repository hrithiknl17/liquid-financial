/**
 * Prompt + response-schema definitions for the two Gemini calls.
 *
 * Shared deliberately: `server.ts` imports this file so the proxy builds the
 * exact same request the browser would, and only the API key differs between
 * the two paths.
 */

/**
 * Verified against the live model list: 3.7-flash reads a receipt in ~4s with
 * the tax and discount lines correctly separated from the item lines.
 */
export const DEFAULT_MODEL = 'gemini-3.7-flash';

/** Models the proxy is willing to call, so it can't be used as an open relay. */
export const ALLOWED_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const EXPENSE_CATEGORY_LIST = [
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
];

export const PAYMENT_METHODS = ['UPI', 'Debit card', 'Credit card', 'Cash', 'Bank transfer', 'Wallet', 'Other'];

const billSchema = (categories?: string[]) => ({
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', description: 'Store or biller name as printed' },
    date: { type: 'STRING', description: 'Bill date as YYYY-MM-DD, empty string if not printed' },
    total: { type: 'NUMBER', description: 'Grand total actually paid, after discounts, as a positive number' },
    tax: { type: 'NUMBER', description: 'Total tax/GST if printed, else 0' },
    discount: { type: 'NUMBER', description: 'Total discount/savings if printed, else 0' },
    currency: { type: 'STRING', description: 'ISO code such as INR or USD if determinable, else empty' },
    category: { type: 'STRING', enum: categoryEnum(categories) },
    paymentMethod: { type: 'STRING', enum: PAYMENT_METHODS },
    note: { type: 'STRING', description: 'Short useful note, e.g. bill number or branch. Keep under 80 chars.' },
    confidence: { type: 'NUMBER', description: '0 to 1, how sure you are the totals are right' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER', description: 'Price per single unit, not the line total' },
        },
        required: ['name', 'qty', 'unitPrice'],
      },
    },
  },
  required: ['merchant', 'total', 'category', 'items', 'confidence'],
});

const BILL_INSTRUCTIONS = `You read photographed receipts and bills and turn them into structured data.

Rules:
- Read every product line. Split combined lines. Skip subtotal, tax, discount, round-off and "total" rows — those are captured in their own fields, never as items.
- unitPrice is the price of ONE unit. If the bill prints a line total for a quantity, divide it.
- qty defaults to 1 when no quantity is printed.
- Normalise item names to something you would recognise later: "AMUL TAAZA MLK 1L PP" becomes "Amul Taaza Milk 1L". Keep the size or weight, drop SKU codes.
- total is what was actually paid, after discounts.
- Indian bills: GST/CGST/SGST are tax, "Sub Total" is not the total, and the amount next to "Grand Total"/"Net Payable"/"Amount Paid" wins.
- If the date is ambiguous, prefer DD/MM/YYYY over MM/DD/YYYY.
- If a value is genuinely not on the bill, use 0 or an empty string. Never invent one.
- Set confidence below 0.6 if the image is blurred, cropped, or the item lines are unreadable.`;

/**
 * The categories a model may choose from. Defaults to the built-ins, but the
 * caller passes the merged list so a bill can be filed under a category
 * someone invented this morning.
 */
function categoryEnum(categories?: string[]): string[] {
  const list = (categories ?? []).map((name) => name.trim()).filter(Boolean);
  return list.length > 0 ? list : EXPENSE_CATEGORY_LIST;
}

export function buildBillRequest(
  imageBase64: string,
  mimeType: string,
  currencyHint?: string,
  categories?: string[]
) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          {
            text: `${BILL_INSTRUCTIONS}\n\nExtract this bill.${
              currencyHint ? ` The user's ledger is in ${currencyHint}.` : ''
            }`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: billSchema(categories),
    },
  };
}

const quickAddSchema = (categories?: string[]) => ({
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          merchant: { type: 'STRING' },
          amount: { type: 'NUMBER', description: 'Positive magnitude; direction goes in `direction`' },
          direction: { type: 'STRING', enum: ['out', 'in'] },
          category: { type: 'STRING', enum: categoryEnum(categories) },
          type: { type: 'STRING', enum: ['discretionary', 'fixed', 'income'] },
          dayOffset: {
            type: 'NUMBER',
            description: '0 for today, -1 for yesterday, and so on. Never positive.',
          },
          note: { type: 'STRING' },
        },
        required: ['merchant', 'amount', 'direction', 'category', 'type', 'dayOffset'],
      },
    },
  },
  required: ['entries'],
});

const QUICK_ADD_INSTRUCTIONS = `You turn a person's shorthand notes about their day's spending into ledger entries.

Rules:
- One entry per distinct payment. "chai 40, auto 120 to office" is two entries.
- The number is the amount. Words around it name the merchant or the thing bought.
- Indian shorthand is expected: auto/rickshaw = Transportation, chai/tiffin/mess = Dining, kirana/sabzi = Groceries, recharge = Recharge, current bill = Utilities.
- direction is "in" only for money received (salary, refund, cashback, someone paying you back). Otherwise "out".
- type is "income" for money in, "fixed" for rent/bills/EMI/SIP/subscriptions, "discretionary" for everything else.
- dayOffset: "yesterday" is -1, "last monday" counts back to that date, anything unstated is 0.
- Guess the merchant from the words given. If only a thing is named ("chai"), use that as the merchant.
- Return an empty entries array if there is no spending in the text.`;

export function buildQuickAddRequest(
  text: string,
  todayISO: string,
  currencyHint?: string,
  categories?: string[]
) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${QUICK_ADD_INSTRUCTIONS}\n\nToday is ${todayISO}.${
              currencyHint ? ` Amounts are in ${currencyHint}.` : ''
            }\n\nText:\n"""${text}"""`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: quickAddSchema(categories),
    },
  };
}

export type AiOperation = 'scan-bill' | 'quick-add' | 'agent';

/* ============================ SMART AGENT ============================ */

const S = 'STRING';
const N = 'NUMBER';

/**
 * Tools the chat agent may call. Anything that writes is staged for the user
 * to confirm — the model proposes, the person approves, the app applies.
 */
export const agentTools = (categories?: string[]) => [
  {
    name: 'add_transaction',
    description: 'Record money spent or received in the ledger.',
    parameters: {
      type: 'OBJECT',
      properties: {
        merchant: { type: S, description: 'Who it was paid to, or the source of income' },
        amount: { type: N, description: 'Positive magnitude. Decimals allowed, e.g. 0.5 for fifty paise.' },
        direction: { type: S, enum: ['out', 'in'] },
        category: { type: S, enum: categoryEnum(categories) },
        type: { type: S, enum: ['discretionary', 'fixed', 'income'] },
        dayOffset: { type: N, description: '0 today, -1 yesterday. Never positive.' },
        paymentMethod: { type: S, enum: PAYMENT_METHODS },
        note: { type: S },
      },
      required: ['merchant', 'amount', 'direction', 'category', 'type', 'dayOffset'],
    },
  },
  {
    name: 'delete_transaction',
    description: 'Remove a ledger entry. Use the id from the context snapshot.',
    parameters: {
      type: 'OBJECT',
      properties: { id: { type: S }, reason: { type: S } },
      required: ['id'],
    },
  },
  {
    name: 'add_vault_plan',
    description: 'Track a subscription, recharge or recurring bill in the Vault.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: S },
        plan: { type: S, description: 'Pack or tier, e.g. "2GB/day 84 days"' },
        kind: { type: S, enum: ['subscription', 'recharge'] },
        cost: { type: N },
        billingPeriod: { type: S, enum: ['mo', 'yr'] },
        category: { type: S },
        renewalInDays: { type: N, description: 'Days until the next charge' },
      },
      required: ['name', 'kind', 'cost', 'billingPeriod'],
    },
  },
  {
    name: 'update_vault_plan',
    description: 'Change the cost, renewal date or status of a Vault plan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: S },
        cost: { type: N },
        renewalInDays: { type: N },
        status: { type: S, enum: ['active', 'paused', 'cancelled'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_vault_plan',
    description: 'Delete a subscription or recharge from the Vault.',
    parameters: { type: 'OBJECT', properties: { id: { type: S } }, required: ['id'] },
  },
  {
    name: 'add_holding',
    description: 'Track an investment holding.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: S },
        symbol: { type: S },
        assetClass: {
          type: S,
          enum: ['Stocks', 'Mutual Fund', 'ETF', 'Crypto', 'Gold', 'Fixed Deposit', 'Bonds', 'IPO', 'Other'],
        },
        units: { type: N },
        avgCost: { type: N },
        currentPrice: { type: N },
      },
      required: ['name', 'assetClass', 'units', 'avgCost'],
    },
  },
  {
    name: 'update_holding_price',
    description: 'Set the latest known price of a holding.',
    parameters: {
      type: 'OBJECT',
      properties: { id: { type: S }, currentPrice: { type: N } },
      required: ['id', 'currentPrice'],
    },
  },
  {
    name: 'add_income_source',
    description: 'Add a recurring income source such as rent from a house or shop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: S, description: 'Property or arrangement, e.g. "Shop 2 — MG Road"' },
        kind: {
          type: S,
          enum: ['House rent', 'Shop rent', 'Land lease', 'Salary', 'Freelance retainer', 'Interest', 'Other'],
        },
        payer: { type: S, description: 'Tenant or payer name' },
        amount: { type: N },
        frequency: { type: S, enum: ['mo', 'qtr', 'yr'] },
        dueDay: { type: N, description: 'Day of the month the payment is due' },
      },
      required: ['name', 'kind', 'amount', 'frequency', 'dueDay'],
    },
  },
  {
    name: 'record_rent_payment',
    description: 'Mark rent or other expected income as received, in full or in part.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourceId: { type: S },
        amount: { type: N, description: 'Omit to settle everything outstanding' },
        dayOffset: { type: N, description: '0 today, -1 yesterday' },
      },
      required: ['sourceId'],
    },
  },
  {
    name: 'add_loan',
    description: 'Record money lent to someone, or money you borrowed from them.',
    parameters: {
      type: 'OBJECT',
      properties: {
        person: { type: S, description: 'Who owes it, or who you owe' },
        direction: { type: S, enum: ['lent', 'borrowed'] },
        amount: { type: N },
        dayOffset: { type: N, description: '0 today, -1 yesterday' },
        expectedInDays: { type: N, description: 'Days until you expect it back, if stated' },
        note: { type: S },
      },
      required: ['person', 'direction', 'amount'],
    },
  },
  {
    name: 'record_loan_repayment',
    description: 'Mark a loan as repaid, fully or in part. Use the loan id from the context.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: S },
        amount: { type: N, description: 'Omit to settle the whole outstanding balance' },
        dayOffset: { type: N },
      },
      required: ['id'],
    },
  },
  {
    name: 'answer',
    description:
      'Reply without changing anything — for questions, summaries, or when you need the user to clarify.',
    parameters: {
      type: 'OBJECT',
      properties: { text: { type: S } },
      required: ['text'],
    },
  },
];

const AGENT_INSTRUCTIONS = `You are the assistant inside Liquid, a personal finance tracker. You turn plain requests into precise changes to the user's own data.

Rules:
- Prefer a tool call over prose. Use "answer" only for questions, summaries, or a genuine ambiguity you cannot resolve.
- Several changes in one message means several tool calls. "Remove Airtel and add Jio" is remove_vault_plan then add_vault_plan.
- Ids come from the CONTEXT block. Match on name, case-insensitively, and tolerate typos and phonetic spellings — "airtel air cyber" means the Airtel Fiber plan. If two entries match equally well, use "answer" to ask which.
- Amounts are exact: "50 paise" is 0.5, "2.5k" is 2500, "1 lakh" is 100000. Never round.
- Dates: "yesterday" is -1, unstated is 0 (today). Never a future date.
- Missing detail gets a sensible default, not a question: unstated category is inferred from the merchant, unstated payment method is left out, unstated renewal is 30 days.
- Never invent an id. If nothing in the context matches what the user named, say so with "answer".
- You are proposing changes, not applying them — the user confirms every write. So be decisive rather than asking permission.`;

export function buildAgentRequest(
  history: { role: 'user' | 'model'; text: string }[],
  contextBlock: string,
  todayISO: string,
  currency: string,
  categories?: string[]
) {
  return {
    systemInstruction: {
      parts: [
        {
          text: `${AGENT_INSTRUCTIONS}\n\nToday is ${todayISO}. Amounts are in ${currency}.\n\nCONTEXT (the user's current data):\n${contextBlock}`,
        },
      ],
    },
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    tools: [{ functionDeclarations: agentTools(categories) }],
    generationConfig: { temperature: 0 },
  };
}
