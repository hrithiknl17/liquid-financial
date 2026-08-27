import { Settings } from '../types';

const LOCALE: Record<Settings['currency'], string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

export const CURRENCY_SYMBOL: Record<Settings['currency'], string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/** "₹1,24,500.00" — grouped for the active locale, always 2 decimals. */
export function money(value: number, currency: Settings['currency'], decimals = 2): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toLocaleString(LOCALE[currency], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${CURRENCY_SYMBOL[currency]}${abs}`;
}

/** Signed variant used in the ledger: "+₹3,250.00" / "-₹84.20". */
export function signedMoney(value: number, currency: Settings['currency']): string {
  const prefix = value > 0 ? '+' : '-';
  return `${prefix}${money(Math.abs(value), currency)}`;
}

/** Splits a formatted amount so the big hero numbers can style the paise separately. */
export function moneyParts(value: number, currency: Settings['currency']): { whole: string; fraction: string } {
  const formatted = money(value, currency);
  const dot = formatted.lastIndexOf('.');
  if (dot === -1) return { whole: formatted, fraction: '00' };
  return { whole: formatted.slice(0, dot), fraction: formatted.slice(dot + 1) };
}

/** Compact form for tight cards: ₹1.2L / $124.5K. */
export function compactMoney(value: number, currency: Settings['currency']): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const sym = CURRENCY_SYMBOL[currency];
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  } else {
    if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  }
  return money(value, currency, 0);
}

export function percent(value: number, decimals = 0): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

const ACCENTS = ['#e0f2fe', '#fef9c3', '#f0fdf4', '#ede9fe', '#ffe4e6', '#ffedd5', '#ccfbf1'];

/** Stable pastel tile colour so logo-less entries still look designed. */
export function accentFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
