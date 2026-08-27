import React, { useEffect, useMemo, useState } from 'react';
import {
  ASSET_CLASSES,
  AssetClass,
  Category,
  CustomCategory,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  Investment,
  LineItem,
  Settings,
  Subscription,
  Transaction,
  VaultKind,
} from '../types';
import { CURRENCY_SYMBOL, compactMoney, money } from '../lib/format';
import { addMonths, displayDate, todayISO } from '../lib/dates';
import { holdingValue } from '../lib/finance';
import { categoryNames, iconFor } from '../lib/categories';
import { uid } from '../lib/storage';
import {
  BrandTile,
  FormActions,
  Label,
  ModalShell,
  bigInputClass,
  inputClass,
  primaryButtonClass,
} from './ui';

/* ======================== ADD TRANSACTION ======================== */

interface AddTransactionModalProps {
  categories: CustomCategory[];
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
}

type EntryType = 'discretionary' | 'fixed' | 'income';

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  settings,
  categories,
  onAddTransaction,
}) => {
  const [type, setType] = useState<EntryType>('discretionary');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Groceries');
  const [date, setDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const symbol = CURRENCY_SYMBOL[settings.currency];
  const itemised = items.length > 0;
  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [items]
  );

  useEffect(() => {
    if (!isOpen) return;
    setType('discretionary');
    setMerchant('');
    setAmount('');
    setCategory('Groceries');
    setDate(todayISO());
    setPaymentMethod('UPI');
    setNote('');
    setItems([]);
  }, [isOpen]);

  const addItem = () => setItems((prev) => [...prev, { id: uid('li'), name: '', qty: 1, unitPrice: 0 }]);

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = itemised ? itemsTotal : parseFloat(amount);
    if (!merchant.trim() || !Number.isFinite(value) || value <= 0) return;

    onAddTransaction({
      merchant: merchant.trim(),
      category,
      date,
      amount: type === 'income' ? Math.abs(value) : -Math.abs(value),
      iconName: iconFor(category, categories),
      type,
      note: note.trim() || undefined,
      paymentMethod: paymentMethod || undefined,
      items: itemised ? items.filter((item) => item.name.trim()) : undefined,
    });
    onClose();
  };

  const categoryOptions = categoryNames(type === 'income' ? 'income' : 'expense', categories);

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="New Transaction" icon="add" iconBg="bg-[#e0f2fe]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 p-1.5 bg-slate-100 border-2 border-slate-900 rounded-2xl">
          {(
            [
              ['discretionary', 'Spend'],
              ['fixed', 'Fixed Cost'],
              ['income', 'Income (+)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setType(value);
                setCategory(value === 'income' ? 'Salary' : 'Groceries');
                if (value === 'income') setItems([]);
              }}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                type === value
                  ? value === 'income'
                    ? 'bg-[#f0fdf4] text-emerald-950 border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]'
                    : 'bg-white text-slate-900 border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]'
                  : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <Label>{type === 'income' ? 'Source' : 'Merchant / Store'}</Label>
          <input
            type="text"
            required
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={type === 'income' ? 'e.g. Monthly Salary' : 'e.g. DMart, Swiggy, Electricity Board'}
            className={inputClass}
          />
        </div>

        <div>
          <Label hint={itemised ? `From ${items.length} item${items.length === 1 ? '' : 's'}` : undefined}>Amount ({symbol})</Label>
          <input
            type="number"
            step="0.01"
            min="0"
            required={!itemised}
            disabled={itemised}
            value={itemised ? itemsTotal.toFixed(2) : amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`${bigInputClass} disabled:bg-slate-100 disabled:text-slate-500`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className={inputClass}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Date</Label>
            <input
              type="date"
              required
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label>Paid with</Label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={inputClass}
          >
            {['UPI', 'Debit card', 'Credit card', 'Cash', 'Bank transfer', 'Wallet', 'Other'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Basket: itemise a grocery or shopping bill */}
        {type !== 'income' && (
          <div className="border-2 border-slate-900 rounded-2xl p-4 bg-slate-50 shadow-[2px_2px_0px_0px_#0f172a]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Basket (optional)</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Itemise it and the amount adds up for you
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="w-8 h-8 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-slate-100 cursor-pointer shrink-0"
                aria-label="Add item"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">add</span>
              </button>
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      placeholder="Item"
                      className="flex-1 min-w-0 bg-white border-2 border-slate-900 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.qty}
                      onChange={(e) => updateItem(item.id, { qty: parseFloat(e.target.value) || 0 })}
                      className="w-14 bg-white border-2 border-slate-900 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      aria-label="Quantity"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-white border-2 border-slate-900 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      aria-label="Unit price"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove item"
                      className="w-8 h-8 shrink-0 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center text-slate-500 hover:text-rose-600 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                    </button>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t-2 border-slate-200 text-xs font-black uppercase tracking-wider text-slate-700">
                  <span>Basket total</span>
                  <span>{money(itemsTotal, settings.currency)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Note</Label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional context"
            className={inputClass}
          />
        </div>

        <FormActions onCancel={onClose} submitLabel="Save Entry" />
      </form>
    </ModalShell>
  );
};

/* ======================== ADD SUBSCRIPTION / RECHARGE ======================== */

interface AddSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onAddSubscription: (sub: Omit<Subscription, 'id'>) => void;
}

const SUBSCRIPTION_CATEGORIES = [
  'Entertainment',
  'Music',
  'Cloud Storage',
  'Software',
  'AI Tools',
  'News',
  'Fitness',
  'Gaming',
  'Other',
];
const RECHARGE_CATEGORIES = ['Mobile', 'Broadband', 'DTH', 'Electricity', 'Gas', 'Water', 'Insurance', 'Other'];

export const AddSubscriptionModal: React.FC<AddSubscriptionModalProps> = ({
  isOpen,
  onClose,
  settings,
  onAddSubscription,
}) => {
  const [kind, setKind] = useState<VaultKind>('subscription');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [category, setCategory] = useState('Entertainment');
  const [cost, setCost] = useState('');
  const [billingPeriod, setBillingPeriod] = useState<'mo' | 'yr'>('mo');
  const [nextRenewal, setNextRenewal] = useState(addMonths(todayISO(), 1));
  const [autoLog, setAutoLog] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setKind('subscription');
    setName('');
    setPlan('');
    setCategory('Entertainment');
    setCost('');
    setBillingPeriod('mo');
    setNextRenewal(addMonths(todayISO(), 1));
    setAutoLog(true);
    setNotes('');
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(cost);
    if (!name.trim() || !Number.isFinite(value) || value <= 0) return;

    onAddSubscription({
      name: name.trim(),
      plan: plan.trim(),
      category,
      kind,
      cost: value,
      billingPeriod,
      nextRenewal,
      cycleStart: addMonths(nextRenewal, billingPeriod === 'yr' ? -12 : -1),
      status: 'active',
      notes: notes.trim() || undefined,
      autoLog,
    });
    onClose();
  };

  const categories = kind === 'recharge' ? RECHARGE_CATEGORIES : SUBSCRIPTION_CATEGORIES;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Add to Vault"
      icon="subscriptions"
      iconBg="bg-[#ede9fe]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 p-1.5 bg-slate-100 border-2 border-slate-900 rounded-2xl">
          {(
            [
              ['subscription', 'Subscription'],
              ['recharge', 'Recharge / Bill'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value);
                setCategory(value === 'recharge' ? 'Mobile' : 'Entertainment');
              }}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                kind === value
                  ? 'bg-white text-slate-900 border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]'
                  : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <Label>Name</Label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'recharge' ? 'e.g. Jio Prepaid, Airtel Fiber' : 'e.g. Netflix, Spotify'}
            className={inputClass}
          />
        </div>

        <div>
          <Label>Plan / Pack</Label>
          <input
            type="text"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder={kind === 'recharge' ? 'e.g. 2GB/day • 84 days' : 'e.g. Premium 4K'}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cost ({CURRENCY_SYMBOL[settings.currency]})</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <Label>Billing</Label>
            <select
              value={billingPeriod}
              onChange={(e) => {
                const period = e.target.value as 'mo' | 'yr';
                setBillingPeriod(period);
                setNextRenewal(addMonths(todayISO(), period === 'yr' ? 12 : 1));
              }}
              className={inputClass}
            >
              <option value="mo">Monthly</option>
              <option value="yr">Yearly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Next renewal</Label>
            <input
              type="date"
              required
              value={nextRenewal}
              min={todayISO()}
              onChange={(e) => setNextRenewal(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <label className="flex items-center gap-3 p-3.5 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer">
          <input
            type="checkbox"
            checked={autoLog}
            onChange={(e) => setAutoLog(e.target.checked)}
            className="w-5 h-5 accent-indigo-600 cursor-pointer"
          />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
            Auto-log the charge into my ledger on renewal
          </span>
        </label>

        <div>
          <Label>Notes</Label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <FormActions onCancel={onClose} submitLabel="Add Plan" />
      </form>
    </ModalShell>
  );
};

/* ======================== ADD INVESTMENT ======================== */

interface AddInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onAddInvestment: (inv: Omit<Investment, 'id'>) => void;
}

export const AddInvestmentModal: React.FC<AddInvestmentModalProps> = ({
  isOpen,
  onClose,
  settings,
  onAddInvestment,
}) => {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('Mutual Fund');
  const [units, setUnits] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [openedDate, setOpenedDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [lots, setLots] = useState('1');
  const [lotSize, setLotSize] = useState('');
  const [cutoffPrice, setCutoffPrice] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setSymbol('');
    setAssetClass('Mutual Fund');
    setUnits('');
    setAvgCost('');
    setCurrentPrice('');
    setOpenedDate(todayISO());
    setNotes('');
    setLots('1');
    setLotSize('');
    setCutoffPrice('');
    setAllotmentDate('');
  }, [isOpen]);

  // An IPO application is described in lots, not units, and stays out of the
  // portfolio until it is allotted — the money is blocked, not spent.
  const isIpo = assetClass === 'IPO';
  const lotsValue = parseInt(lots, 10) || 0;
  const lotSizeValue = parseInt(lotSize, 10) || 0;
  const cutoffValue = parseFloat(cutoffPrice) || 0;
  const blockedValue = lotsValue * lotSizeValue * cutoffValue;

  const unitsValue = parseFloat(units) || 0;
  const costValue = parseFloat(avgCost) || 0;
  const priceValue = parseFloat(currentPrice) || costValue;
  const projectedValue = unitsValue * priceValue;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isIpo) {
      if (lotsValue <= 0 || lotSizeValue <= 0 || cutoffValue <= 0) return;
      onAddInvestment({
        name: name.trim(),
        symbol: symbol.trim() || undefined,
        assetClass,
        units: lotsValue * lotSizeValue,
        avgCost: cutoffValue,
        currentPrice: cutoffValue,
        openedDate,
        priceUpdatedAt: todayISO(),
        notes: notes.trim() || undefined,
        ipo: {
          status: 'applied',
          lots: lotsValue,
          lotSize: lotSizeValue,
          cutoffPrice: cutoffValue,
          applicationDate: openedDate,
          allotmentDate: allotmentDate || undefined,
        },
      });
      onClose();
      return;
    }

    if (unitsValue <= 0 || costValue <= 0) return;

    onAddInvestment({
      name: name.trim(),
      symbol: symbol.trim() || undefined,
      assetClass,
      units: unitsValue,
      avgCost: costValue,
      currentPrice: priceValue,
      openedDate,
      priceUpdatedAt: todayISO(),
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Add Holding" icon="trending_up" iconBg="bg-[#f0fdf4]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nifty 50 Index Fund, Infosys, Sovereign Gold Bond"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Symbol / Code</Label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
          <div>
            <Label>Asset class</Label>
            <select
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as AssetClass)}
              className={inputClass}
            >
              {ASSET_CLASSES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isIpo ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Lots</Label>
              <input
                type="number"
                min="1"
                required
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <Label hint="shares">Lot size</Label>
              <input
                type="number"
                min="1"
                required
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                placeholder="e.g. 15"
                className={inputClass}
              />
            </div>
            <div>
              <Label>Cut-off price</Label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={cutoffPrice}
                onChange={(e) => setCutoffPrice(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Units</Label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <Label>Avg cost</Label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <Label>Price now</Label>
              <input
                type="number"
                step="any"
                min="0"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="Same as cost"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {isIpo && blockedValue > 0 && (
          <div className="px-4 py-3 bg-[#ede9fe] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Blocked under ASBA
              </span>
              <span className="font-display font-black text-lg text-slate-900">
                {money(blockedValue, settings.currency)}
              </span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 leading-relaxed">
              {lotsValue} lot{lotsValue === 1 ? '' : 's'} × {lotSizeValue} shares. Stays out of portfolio value
              until allotment.
            </p>
          </div>
        )}

        {!isIpo && projectedValue > 0 && (
          <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Current value</span>
            <span className="font-display font-black text-lg text-slate-900">
              {money(projectedValue, settings.currency)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{isIpo ? 'Applied on' : 'First bought'}</Label>
            <input
              type="date"
              value={openedDate}
              max={isIpo ? undefined : todayISO()}
              onChange={(e) => setOpenedDate(e.target.value)}
              className={inputClass}
            />
          </div>
          {isIpo && (
            <div>
              <Label hint="optional">Allotment on</Label>
              <input
                type="date"
                value={allotmentDate}
                onChange={(e) => setAllotmentDate(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </div>

        <FormActions onCancel={onClose} submitLabel={isIpo ? 'Track Application' : 'Track Holding'} />
      </form>
    </ModalShell>
  );
};

/* ======================== MONEY IN / MONEY OUT ======================== */

interface AdjustCashModalProps {
  direction: 'in' | 'out' | null;
  onClose: () => void;
  settings: Settings;
  cashBalance: number;
  onSubmit: (direction: 'in' | 'out', amount: number, label: string, note: string) => void;
}

export const AdjustCashModal: React.FC<AdjustCashModalProps> = ({
  direction,
  onClose,
  settings,
  cashBalance,
  onSubmit,
}) => {
  const isIn = direction === 'in';
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!direction) return;
    setAmount('');
    setLabel(direction === 'in' ? 'Cash deposit' : 'Cash withdrawal');
    setNote('');
  }, [direction]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onSubmit(isIn ? 'in' : 'out', value, label.trim() || (isIn ? 'Money in' : 'Money out'), note.trim());
    onClose();
  };

  const quickAmounts = settings.currency === 'INR' ? [500, 1000, 5000, 10000] : [50, 100, 500, 1000];

  return (
    <ModalShell
      isOpen={direction !== null}
      onClose={onClose}
      title={isIn ? 'Money In' : 'Money Out'}
      icon={isIn ? 'add_card' : 'arrow_outward'}
      iconBg={isIn ? 'bg-[#f0fdf4]' : 'bg-[#ffe4e6]'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label hint={`Balance ${money(cashBalance, settings.currency, 0)}`}>
            Amount ({CURRENCY_SYMBOL[settings.currency]})
          </Label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={bigInputClass}
          />
          <div className="flex gap-2 mt-2.5">
            {quickAmounts.map((quick) => (
              <button
                type="button"
                key={quick}
                onClick={() => setAmount(String(quick))}
                className="flex-1 py-1.5 text-[11px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 border border-slate-900 text-slate-900 rounded-xl transition-all cursor-pointer"
              >
                {compactMoney(quick, settings.currency)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>{isIn ? 'Source' : 'Paid to'}</Label>
          <input
            type="text"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <Label>Note</Label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <FormActions onCancel={onClose} submitLabel={isIn ? 'Add to balance' : 'Deduct from balance'} />
      </form>
    </ModalShell>
  );
};

/* ======================== GLOBAL SEARCH ======================== */

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  onSelectTx: (tx: Transaction) => void;
  onSelectSub: (sub: Subscription) => void;
  onSelectInv: (inv: Investment) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  settings,
  transactions,
  subscriptions,
  investments,
  onSelectTx,
  onSelectSub,
  onSelectInv,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const q = query.trim().toLowerCase();

  const txResults = useMemo(
    () =>
      q
        ? transactions
            .filter(
              (tx) =>
                tx.merchant.toLowerCase().includes(q) ||
                String(tx.category).toLowerCase().includes(q) ||
                (tx.note?.toLowerCase().includes(q) ?? false) ||
                (tx.items?.some((item) => item.name.toLowerCase().includes(q)) ?? false)
            )
            .slice(0, 6)
        : [],
    [transactions, q]
  );

  const subResults = useMemo(
    () =>
      q
        ? subscriptions
            .filter(
              (s) =>
                s.name.toLowerCase().includes(q) ||
                s.plan.toLowerCase().includes(q) ||
                s.category.toLowerCase().includes(q)
            )
            .slice(0, 5)
        : [],
    [subscriptions, q]
  );

  const invResults = useMemo(
    () =>
      q
        ? investments
            .filter(
              (i) =>
                i.name.toLowerCase().includes(q) ||
                (i.symbol?.toLowerCase().includes(q) ?? false) ||
                i.assetClass.toLowerCase().includes(q)
            )
            .slice(0, 5)
        : [],
    [investments, q]
  );

  const empty = q !== '' && txResults.length === 0 && subResults.length === 0 && invResults.length === 0;

  const rowClass =
    'w-full flex items-center justify-between gap-3 p-3 rounded-2xl border-2 border-slate-900 bg-slate-50 hover:bg-white shadow-[2px_2px_0px_0px_#0f172a] transition-all cursor-pointer text-left';

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Search" icon="search" wide>
      <div className="relative mb-5">
        <span className="material-symbols-outlined absolute left-4 top-3.5 text-slate-400 text-[20px]">search</span>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Transactions, plans, holdings, basket items..."
          className="w-full bg-slate-50 border-2 border-slate-900 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a]"
        />
      </div>

      {q === '' && (
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center py-8">
          Start typing to search everything you track
        </p>
      )}

      {empty && (
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center py-8">
          Nothing found for “{query}”
        </p>
      )}

      <div className="space-y-5">
        {txResults.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Transactions</p>
            <div className="space-y-2">
              {txResults.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => {
                    onSelectTx(tx);
                    onClose();
                  }}
                  className={rowClass}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-white border-2 border-slate-900 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px] font-bold">{tx.iconName}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-black text-sm text-slate-900 truncate">{tx.merchant}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {tx.category} • {displayDate(tx.date)}
                      </span>
                    </span>
                  </span>
                  <span className="font-black text-sm text-slate-900 shrink-0">
                    {tx.amount > 0 ? '+' : '-'}
                    {money(Math.abs(tx.amount), settings.currency, 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {subResults.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Vault</p>
            <div className="space-y-2">
              {subResults.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    onSelectSub(sub);
                    onClose();
                  }}
                  className={rowClass}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <BrandTile name={sub.name} imageUrl={sub.imageUrl} size="w-9 h-9" rounded="rounded-xl" />
                    <span className="min-w-0">
                      <span className="block font-black text-sm text-slate-900 truncate">{sub.name}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        {sub.kind === 'recharge' ? 'Recharge' : 'Subscription'} • renews{' '}
                        {displayDate(sub.nextRenewal)}
                      </span>
                    </span>
                  </span>
                  <span className="font-black text-sm text-slate-900 shrink-0">
                    {money(sub.cost, settings.currency, 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {invResults.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Holdings</p>
            <div className="space-y-2">
              {invResults.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => {
                    onSelectInv(inv);
                    onClose();
                  }}
                  className={rowClass}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <BrandTile name={inv.symbol || inv.name} size="w-9 h-9" rounded="rounded-xl" />
                    <span className="min-w-0">
                      <span className="block font-black text-sm text-slate-900 truncate">{inv.name}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {inv.assetClass} • {inv.units} units
                      </span>
                    </span>
                  </span>
                  <span className="font-black text-sm text-slate-900 shrink-0">
                    {compactMoney(holdingValue(inv), settings.currency)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {q !== '' && (
        <button onClick={onClose} className={`w-full mt-6 ${primaryButtonClass}`}>
          Close
        </button>
      )}
    </ModalShell>
  );
};
