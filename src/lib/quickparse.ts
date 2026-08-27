import { Category, Transaction } from '../types';
import { addDays, todayISO } from './dates';
import { iconForCategory } from './finance';

/**
 * Offline fallback for the quick-add box. Handles the common shape —
 * "chai 40, auto 120, dmart 850" — without a network call, so logging never
 * depends on an API being reachable. Gemini handles anything subtler.
 */

const KEYWORD_CATEGORIES: [RegExp, Category, Transaction['type']][] = [
  [/\b(rent|landlord|maintenance|society)\b/i, 'Rent & Housing', 'fixed'],
  [/\b(sip|mutual fund|stocks?|shares?|invest(ed|ment)?)\b/i, 'Investment', 'fixed'],
  [/\b(recharge|prepaid|topup|top-up|dth|broadband|fiber|fibre)\b/i, 'Recharge', 'fixed'],
  [/\b(electric(ity)?|current bill|water bill|gas|lpg|bill)\b/i, 'Utilities', 'fixed'],
  [/\b(netflix|spotify|prime|hotstar|subscription|youtube)\b/i, 'Subscription', 'fixed'],
  [/\b(auto|rickshaw|uber|ola|cab|taxi|bus|metro|train|petrol|diesel|fuel|parking)\b/i, 'Transportation', 'discretionary'],
  [/\b(chai|tea|coffee|tiffin|mess|lunch|dinner|breakfast|snack|swiggy|zomato|restaurant|hotel|cafe)\b/i, 'Dining', 'discretionary'],
  [/\b(kirana|sabzi|vegetable|grocer(y|ies)|dmart|bigbasket|blinkit|zepto|supermarket|milk|market)\b/i, 'Groceries', 'discretionary'],
  [/\b(medicine|pharmacy|doctor|hospital|gym|clinic|chemist)\b/i, 'Health & Wellness', 'discretionary'],
  [/\b(movie|cinema|game|concert|bookmyshow)\b/i, 'Entertainment', 'discretionary'],
  [/\b(amazon|flipkart|myntra|clothes|shopping|shoes)\b/i, 'Shopping', 'discretionary'],
  [/\b(course|book|tuition|fees|exam)\b/i, 'Education', 'discretionary'],
];

const INCOME_PATTERN = /\b(salary|refund|cashback|received|credited|bonus|repaid|paid me|freelance|dividend|interest)\b/i;

const DAY_OFFSETS: [RegExp, number][] = [
  [/\b(day before yesterday|dbz)\b/i, -2],
  [/\b(yesterday|ydy|y'day)\b/i, -1],
  [/\b(today)\b/i, 0],
];

const NOISE = /\b(rs|rupees?|inr|for|on|at|to|from|the|a|an|paid|spent|bought|gave|and|of|my|it|was|were)\b/gi;

function classify(text: string): { category: Category; type: Transaction['type'] } {
  for (const [pattern, category, type] of KEYWORD_CATEGORIES) {
    if (pattern.test(text)) return { category, type };
  }
  return { category: 'Other', type: 'discretionary' };
}

function cleanMerchant(chunk: string, amountText: string): string {
  const withoutAmount = chunk.replace(amountText, ' ');
  const cleaned = withoutAmount
    .replace(/[₹$€£]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Cash spend';
  return cleaned
    .split(' ')
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(' ')
    .slice(0, 48);
}

export function quickParse(input: string): Omit<Transaction, 'id'>[] {
  const today = todayISO();
  const chunks = input
    .split(/[,\n;]+|\band\b/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const entries: Omit<Transaction, 'id'>[] = [];

  for (const chunk of chunks) {
    // First standalone number in the chunk is the amount, "1,250.50" included.
    const match = chunk.match(/(?:[₹$€£]\s*)?(\d[\d,]*(?:\.\d{1,2})?)/);
    if (!match) continue;

    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    let offset = 0;
    for (const [pattern, value] of DAY_OFFSETS) {
      if (pattern.test(chunk)) {
        offset = value;
        break;
      }
    }

    const incoming = INCOME_PATTERN.test(chunk);
    const { category, type } = incoming
      ? { category: 'Other Income' as Category, type: 'income' as Transaction['type'] }
      : classify(chunk);

    entries.push({
      merchant: cleanMerchant(chunk, match[0]),
      category,
      date: addDays(today, offset),
      amount: incoming ? amount : -amount,
      iconName: iconForCategory(category),
      type,
      origin: 'quick-add',
    });
  }

  return entries;
}
