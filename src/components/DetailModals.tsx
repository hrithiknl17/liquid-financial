import React, { useEffect, useState } from 'react';
import {
  Category,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  Investment,
  Settings,
  Subscription,
  Transaction,
} from '../types';
import { CURRENCY_SYMBOL, money, percent } from '../lib/format';
import { addMonths, cycleProgress, daysUntil, displayDate, todayISO } from '../lib/dates';
import { holdingCost, holdingValue, holdingReturn, isPendingIpo, monthlyCost } from '../lib/finance';
import { getReceiptUrl } from '../lib/receipts';
import { BrandTile, Label, ModalShell, ghostButtonClass, inputClass, primaryButtonClass } from './ui';

const DetailRow: React.FC<{ label: string; children: React.ReactNode; tone?: string }> = ({
  label,
  children,
  tone = 'text-slate-900',
}) => (
  <div className="flex justify-between items-center gap-4 py-2.5 border-b-2 border-slate-100">
    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shrink-0">{label}</span>
    <span className={`font-black text-sm text-right ${tone} truncate`}>{children}</span>
  </div>
);

/* ======================== TRANSACTION DETAIL ======================== */

export const TransactionDetailModal: React.FC<{
  transaction: Transaction | null;
  settings: Settings;
  onClose: () => void;
  onUpdate: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}> = ({ transaction, settings, onClose, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Transaction | null>(transaction);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    setDraft(transaction);
    setEditing(false);
    setConfirmDelete(false);
  }, [transaction]);

  /** Pull the stored bill photo out of IndexedDB while this sheet is open. */
  useEffect(() => {
    let revoked: string | null = null;
    setReceiptUrl(null);

    if (transaction?.receiptId) {
      void getReceiptUrl(transaction.receiptId).then((url) => {
        revoked = url;
        setReceiptUrl(url);
      });
    }

    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [transaction?.receiptId]);

  if (!transaction || !draft) return null;

  const isIncome = transaction.amount > 0;
  const basketTotal = transaction.items?.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) ?? 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const magnitude = Math.abs(draft.amount);
    onUpdate({
      ...draft,
      amount: draft.type === 'income' ? magnitude : -magnitude,
    });
    onClose();
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editing ? 'Edit Transaction' : transaction.merchant}
      icon={transaction.iconName}
      iconBg={isIncome ? 'bg-[#f0fdf4]' : 'bg-slate-100'}
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Merchant</Label>
            <input
              type="text"
              required
              value={draft.merchant}
              onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount ({CURRENCY_SYMBOL[settings.currency]})</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={Math.abs(draft.amount)}
                onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </div>
            <div>
              <Label>Date</Label>
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <Label>Category</Label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
              className={inputClass}
            >
              {(draft.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Note</Label>
            <input
              type="text"
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button type="button" onClick={() => setEditing(false)} className={`flex-1 ${ghostButtonClass}`}>
              Cancel
            </button>
            <button type="submit" className={`flex-1 ${primaryButtonClass}`}>
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <>
          <div
            className={`rounded-2xl border-2 border-slate-900 p-5 mb-5 shadow-[3px_3px_0px_0px_#0f172a] ${
              isIncome ? 'bg-[#f0fdf4]' : 'bg-slate-50'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
              {isIncome ? 'Money in' : 'Money out'}
            </p>
            <p className="font-display text-4xl font-black tracking-tighter text-slate-900">
              {isIncome ? '+' : '-'}
              {money(Math.abs(transaction.amount), settings.currency)}
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">
              {displayDate(transaction.date)} • {transaction.category}
            </p>
          </div>

          <div className="mb-5">
            <DetailRow label="Type">{transaction.type}</DetailRow>
            {transaction.paymentMethod && <DetailRow label="Paid with">{transaction.paymentMethod}</DetailRow>}
            <DetailRow label="Date">{transaction.date}</DetailRow>
            {transaction.note && <DetailRow label="Note">{transaction.note}</DetailRow>}
            {transaction.sourceId && <DetailRow label="Source">Auto-logged from Vault</DetailRow>}
          </div>

          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-5 flex items-center gap-4 p-3 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] hover:bg-white transition-colors"
            >
              <img
                src={receiptUrl}
                alt="Stored bill"
                className="w-16 h-20 object-cover rounded-xl border-2 border-slate-900 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Original bill
                </span>
                <span className="block font-black text-sm text-slate-900">Tap to open full size</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Saved on this device
                </span>
              </span>
            </a>
          )}

          {transaction.items && transaction.items.length > 0 && (
            <div className="mb-5 border-2 border-slate-900 rounded-2xl overflow-hidden shadow-[3px_3px_0px_0px_#0f172a]">
              <div className="px-4 py-2.5 bg-slate-100 border-b-2 border-slate-900 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Basket</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                  {transaction.items.length} item{transaction.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="divide-y-2 divide-slate-100 bg-white">
                {transaction.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center px-4 py-2.5 gap-3">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {item.name}
                      {item.qty !== 1 && <span className="text-slate-400"> × {item.qty}</span>}
                    </span>
                    <span className="text-xs font-black text-slate-900 shrink-0">
                      {money(item.qty * item.unitPrice, settings.currency, 0)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total</span>
                  <span className="text-sm font-black text-slate-900">
                    {money(basketTotal, settings.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <button onClick={() => setEditing(true)} className={`w-full ${primaryButtonClass}`}>
              Edit entry
            </button>
            {confirmDelete ? (
              <div className="flex gap-2.5">
                <button onClick={() => setConfirmDelete(false)} className={`flex-1 ${ghostButtonClass}`}>
                  Keep it
                </button>
                <button
                  onClick={() => {
                    onDelete(transaction.id);
                    onClose();
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] transition-all cursor-pointer"
                >
                  Delete for good
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-2xl border-2 border-rose-200 hover:border-rose-600 transition-colors cursor-pointer"
              >
                Delete transaction
              </button>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
};

/* ======================== SUBSCRIPTION MANAGE ======================== */

export const SubscriptionManageModal: React.FC<{
  subscription: Subscription | null;
  settings: Settings;
  onClose: () => void;
  onUpdate: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (sub: Subscription) => void;
}> = ({ subscription, settings, onClose, onUpdate, onDelete, onMarkPaid }) => {
  const [draft, setDraft] = useState<Subscription | null>(subscription);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(subscription);
    setConfirmDelete(false);
  }, [subscription]);

  if (!subscription || !draft) return null;

  const days = daysUntil(subscription.nextRenewal);
  const progress = cycleProgress(subscription.cycleStart, subscription.nextRenewal);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...draft,
      cycleStart:
        draft.nextRenewal !== subscription.nextRenewal
          ? addMonths(draft.nextRenewal, draft.billingPeriod === 'yr' ? -12 : -1)
          : draft.cycleStart,
    });
    onClose();
  };

  return (
    <ModalShell isOpen onClose={onClose} title={subscription.name} icon="subscriptions" iconBg="bg-[#ede9fe]">
      <div className="flex items-center gap-4 mb-5 p-4 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
        <BrandTile name={subscription.name} imageUrl={subscription.imageUrl} size="w-14 h-14" />
        <div className="min-w-0">
          <p className="font-display font-black text-base text-slate-900 truncate">{subscription.plan || subscription.category}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {money(subscription.cost, settings.currency, 0)} / {subscription.billingPeriod}
            {subscription.billingPeriod === 'yr' &&
              ` • ≈ ${money(monthlyCost(subscription), settings.currency, 0)}/mo`}
          </p>
          <span
            className={`inline-block mt-1 px-2.5 py-0.5 font-black text-[10px] uppercase rounded-lg border border-slate-900 ${
              subscription.status === 'active' ? 'bg-[#f0fdf4] text-emerald-900' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {subscription.status}
          </span>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
          <span className={days <= 3 && subscription.status === 'active' ? 'text-rose-600' : 'text-slate-600'}>
            {days < 0 ? 'Overdue' : days === 0 ? 'Renews today' : `Renews in ${days} days`}
          </span>
          <span className="text-slate-600">{displayDate(subscription.nextRenewal)}</span>
        </div>
        <div className="h-2.5 bg-slate-100 border border-slate-900 rounded-full overflow-hidden p-0.5">
          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cost ({CURRENCY_SYMBOL[settings.currency]})</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={draft.cost}
              onChange={(e) => setDraft({ ...draft, cost: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
          <div>
            <Label>Next renewal</Label>
            <input
              type="date"
              required
              value={draft.nextRenewal}
              onChange={(e) => setDraft({ ...draft, nextRenewal: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label>Status</Label>
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as Subscription['status'] })}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <label className="flex items-center gap-3 p-3.5 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer">
          <input
            type="checkbox"
            checked={draft.autoLog ?? false}
            onChange={(e) => setDraft({ ...draft, autoLog: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 cursor-pointer"
          />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
            Auto-log renewals into the ledger
          </span>
        </label>

        {draft.notes !== undefined && (
          <div>
            <Label>Notes</Label>
            <input
              type="text"
              value={draft.notes ?? ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className={inputClass}
            />
          </div>
        )}

        <button type="submit" className={`w-full ${primaryButtonClass}`}>
          Save changes
        </button>
      </form>

      <div className="space-y-2.5 mt-4">
        <button
          onClick={() => {
            onMarkPaid(subscription);
            onClose();
          }}
          className="w-full py-3 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          Mark paid today &amp; roll cycle
        </button>

        {confirmDelete ? (
          <div className="flex gap-2.5">
            <button onClick={() => setConfirmDelete(false)} className={`flex-1 ${ghostButtonClass}`}>
              Keep it
            </button>
            <button
              onClick={() => {
                onDelete(subscription.id);
                onClose();
              }}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] transition-all cursor-pointer"
            >
              Remove for good
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-2xl border-2 border-rose-200 hover:border-rose-600 transition-colors cursor-pointer"
          >
            Remove from Vault
          </button>
        )}
      </div>
    </ModalShell>
  );
};

/* ======================== INVESTMENT DETAIL ======================== */

export const InvestmentDetailModal: React.FC<{
  investment: Investment | null;
  settings: Settings;
  onClose: () => void;
  onUpdate: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onBuyMore: (inv: Investment, units: number, price: number) => void;
  /** Allotment came through: `lots` may be fewer than applied for. */
  onAllot: (inv: Investment, lots: number) => void;
  onIpoLapsed: (inv: Investment) => void;
}> = ({ investment, settings, onClose, onUpdate, onDelete, onBuyMore, onAllot, onIpoLapsed }) => {
  const [priceDraft, setPriceDraft] = useState('');
  const [buyUnits, setBuyUnits] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [showBuy, setShowBuy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allottedLots, setAllottedLots] = useState('');

  useEffect(() => {
    if (!investment) return;
    setPriceDraft(String(investment.currentPrice));
    setBuyUnits('');
    setBuyPrice(String(investment.currentPrice));
    setShowBuy(false);
    setConfirmDelete(false);
    setAllottedLots(String(investment.ipo?.lots ?? 1));
  }, [investment]);

  if (!investment) return null;

  const pendingIpo = isPendingIpo(investment);
  const ipo = investment.ipo;
  const blocked = ipo ? ipo.lots * ipo.lotSize * ipo.cutoffPrice : 0;
  const allottedValue = Math.min(ipo?.lots ?? 0, Math.max(0, parseInt(allottedLots, 10) || 0));

  const ret = holdingReturn(investment);
  const pnl = holdingValue(investment) - holdingCost(investment);
  const up = pnl >= 0;

  const updatePrice = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(priceDraft);
    if (!Number.isFinite(price) || price < 0) return;
    onUpdate({ ...investment, currentPrice: price, priceUpdatedAt: todayISO() });
    onClose();
  };

  const submitBuy = (e: React.FormEvent) => {
    e.preventDefault();
    const units = parseFloat(buyUnits);
    const price = parseFloat(buyPrice);
    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price <= 0) return;
    onBuyMore(investment, units, price);
    onClose();
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={investment.name}
      icon="trending_up"
      iconBg={up ? 'bg-[#f0fdf4]' : 'bg-[#ffe4e6]'}
    >
      <div
        className={`rounded-2xl border-2 border-slate-900 p-5 mb-5 shadow-[3px_3px_0px_0px_#0f172a] ${
          pendingIpo ? 'bg-[#ede9fe]' : up ? 'bg-[#f0fdf4]' : 'bg-[#ffe4e6]'
        }`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
          {pendingIpo ? 'Blocked under ASBA' : 'Current value'}
        </p>
        <p className="font-display text-4xl font-black tracking-tighter text-slate-900">
          {money(pendingIpo ? blocked : holdingValue(investment), settings.currency)}
        </p>
        {pendingIpo ? (
          <p className="text-xs font-black uppercase tracking-wider mt-1 text-indigo-800">
            {ipo!.lots} lot{ipo!.lots === 1 ? '' : 's'} × {ipo!.lotSize} at {money(ipo!.cutoffPrice, settings.currency, 0)}
            {' '}— not in portfolio value yet
          </p>
        ) : (
          <p
            className={`text-xs font-black uppercase tracking-wider mt-1 ${up ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            {up ? '▲' : '▼'} {money(Math.abs(pnl), settings.currency, 0)} ({percent(ret, 1)})
          </p>
        )}
      </div>

      <div className="mb-5">
        <DetailRow label="Asset class">{investment.assetClass}</DetailRow>
        {ipo && (
          <>
            <DetailRow label="Application">
              {ipo.status === 'applied'
                ? 'Awaiting allotment'
                : ipo.status === 'allotted'
                  ? `Allotted ${ipo.allottedLots ?? ipo.lots} of ${ipo.lots} lots`
                  : 'Not allotted'}
            </DetailRow>
            <DetailRow label="Applied on">{displayDate(ipo.applicationDate)}</DetailRow>
            {ipo.allotmentDate && <DetailRow label="Allotment">{displayDate(ipo.allotmentDate)}</DetailRow>}
          </>
        )}
        {investment.symbol && <DetailRow label="Symbol">{investment.symbol}</DetailRow>}
        {!pendingIpo && (
          <>
            <DetailRow label="Units">{investment.units}</DetailRow>
            <DetailRow label="Avg cost">{money(investment.avgCost, settings.currency)}</DetailRow>
            <DetailRow label="Invested">{money(holdingCost(investment), settings.currency)}</DetailRow>
            <DetailRow label="First bought">{displayDate(investment.openedDate)}</DetailRow>
            <DetailRow label="Price updated">{displayDate(investment.priceUpdatedAt)}</DetailRow>
          </>
        )}
        {investment.notes && <DetailRow label="Notes">{investment.notes}</DetailRow>}
      </div>

      {pendingIpo ? (
        <div className="space-y-3 mb-4 p-4 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Basis of allotment out? Settle the application.
          </p>
          <div>
            <Label hint={`of ${ipo!.lots} applied`}>Lots allotted</Label>
            <input
              type="number"
              min="0"
              max={ipo!.lots}
              value={allottedLots}
              onChange={(e) => setAllottedLots(e.target.value)}
              className={inputClass}
            />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-relaxed">
            {allottedValue > 0
              ? `${money(allottedValue * ipo!.lotSize * ipo!.cutoffPrice, settings.currency)} debits and becomes ${
                  allottedValue * ipo!.lotSize
                } shares. The rest unblocks.`
              : 'Nothing allotted — the full amount unblocks, no debit is logged.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onIpoLapsed(investment);
                onClose();
              }}
              className={`flex-1 ${ghostButtonClass}`}
            >
              Not allotted
            </button>
            <button
              type="button"
              disabled={allottedValue <= 0}
              onClick={() => {
                onAllot(investment, allottedValue);
                onClose();
              }}
              className={`flex-1 ${primaryButtonClass} disabled:opacity-40 disabled:shadow-none`}
            >
              Mark allotted
            </button>
          </div>
        </div>
      ) : showBuy ? (
        <form onSubmit={submitBuy} className="space-y-4 mb-4 p-4 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Buy more — averages your cost and logs the outflow
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Units</Label>
              <input
                type="number"
                step="any"
                min="0"
                required
                autoFocus
                value={buyUnits}
                onChange={(e) => setBuyUnits(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <Label>Price / unit</Label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowBuy(false)} className={`flex-1 ${ghostButtonClass}`}>
              Cancel
            </button>
            <button type="submit" className={`flex-1 ${primaryButtonClass}`}>
              Record buy
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={updatePrice} className="space-y-3 mb-4">
          <div>
            <Label hint={`Last ${displayDate(investment.priceUpdatedAt)}`}>
              Update price ({CURRENCY_SYMBOL[settings.currency]})
            </Label>
            <div className="flex gap-2.5">
              <input
                type="number"
                step="any"
                min="0"
                required
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                className={`flex-1 ${inputClass}`}
              />
              <button type="submit" className={`px-6 ${primaryButtonClass}`}>
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-2.5">
        {!showBuy && !pendingIpo && (
          <button
            onClick={() => setShowBuy(true)}
            className="w-full py-3 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            Buy more units
          </button>
        )}

        {confirmDelete ? (
          <div className="flex gap-2.5">
            <button onClick={() => setConfirmDelete(false)} className={`flex-1 ${ghostButtonClass}`}>
              Keep it
            </button>
            <button
              onClick={() => {
                onDelete(investment.id);
                onClose();
              }}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] transition-all cursor-pointer"
            >
              Remove holding
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 rounded-2xl border-2 border-rose-200 hover:border-rose-600 transition-colors cursor-pointer"
          >
            Remove holding
          </button>
        )}
      </div>
    </ModalShell>
  );
};
