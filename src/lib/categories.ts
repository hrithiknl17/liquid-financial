import { CustomCategory, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types';
import { iconForCategory } from './finance';

export interface CategoryOption {
  name: string;
  iconName: string;
  kind: 'expense' | 'income';
  /** False for the categories that ship with the app. */
  custom: boolean;
}

/** Icons offered when someone makes a category of their own. */
export const CATEGORY_ICON_CHOICES = [
  'shopping_cart',
  'restaurant',
  'directions_bus',
  'local_gas_station',
  'bolt',
  'home',
  'chair',
  'medical_services',
  'fitness_center',
  'movie',
  'sports_esports',
  'checkroom',
  'school',
  'menu_book',
  'smartphone',
  'wifi',
  'subscriptions',
  'pets',
  'child_care',
  'flight',
  'hotel',
  'card_giftcard',
  'volunteer_activism',
  'savings',
  'trending_up',
  'payments',
  'account_balance',
  'work',
  'handyman',
  'local_laundry_service',
  'content_cut',
  'spa',
  'celebration',
  'church',
  'receipt_long',
];

const BUILT_IN: CategoryOption[] = [
  ...EXPENSE_CATEGORIES.map((name) => ({
    name: name as string,
    iconName: iconForCategory(name),
    kind: 'expense' as const,
    custom: false,
  })),
  ...INCOME_CATEGORIES.map((name) => ({
    name: name as string,
    iconName: iconForCategory(name),
    kind: 'income' as const,
    custom: false,
  })),
];

/**
 * Everything on offer: the built-ins first, then anything added by hand. A
 * custom category that reuses a built-in name wins, so someone can re-icon
 * "Groceries" without ending up with two of them.
 */
export function allCategories(custom: CustomCategory[]): CategoryOption[] {
  const byName = new Map<string, CategoryOption>();
  for (const option of BUILT_IN) byName.set(option.name.toLowerCase(), option);
  for (const entry of custom) {
    byName.set(entry.name.toLowerCase(), {
      name: entry.name,
      iconName: entry.iconName,
      kind: entry.kind,
      custom: true,
    });
  }
  return [...byName.values()];
}

export function categoriesFor(kind: 'expense' | 'income', custom: CustomCategory[]): CategoryOption[] {
  return allCategories(custom).filter((option) => option.kind === kind);
}

/** Category names for a kind, which is what a <select> wants. */
export function categoryNames(kind: 'expense' | 'income', custom: CustomCategory[]): string[] {
  return categoriesFor(kind, custom).map((option) => option.name);
}

/** The icon for a category name, custom ones included. */
export function iconFor(name: string, custom: CustomCategory[]): string {
  const match = custom.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  return match?.iconName ?? iconForCategory(name);
}

export function isIncomeCategory(name: string, custom: CustomCategory[]): boolean {
  const match = allCategories(custom).find((option) => option.name.toLowerCase() === name.toLowerCase());
  return match?.kind === 'income';
}

/**
 * True when the name is already taken, so the manager can refuse duplicates
 * rather than silently shadowing a built-in.
 */
export function categoryExists(name: string, custom: CustomCategory[], ignoreId?: string): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  if (BUILT_IN.some((option) => option.name.toLowerCase() === needle)) return true;
  return custom.some((entry) => entry.name.toLowerCase() === needle && entry.id !== ignoreId);
}

/** How many transactions still point at a category, used before deleting one. */
export function usageCount(name: string, transactions: { category: string }[]): number {
  return transactions.filter((tx) => tx.category.toLowerCase() === name.toLowerCase()).length;
}
