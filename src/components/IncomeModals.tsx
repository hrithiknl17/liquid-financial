import React, { useEffect, useState } from 'react';
import {
  INCOME_SOURCE_KINDS,
  IncomeSource,
  IncomeSourceKind,
  Loan,
  Settings,
} from '../types';
import { money } from '../lib/format';
import { displayDate, todayISO } from '../lib/dates';
import { DueView, periodLabel } from '../lib/income';
import { LoanView } from '../lib/loans';
import {
  FormActions,
  Label,
  ModalShell,
  bigInputClass,
  ghostButtonClass,
  inputClass,
} from './ui';

const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Cheque', 'Card'];

/* ======================== INCOME SOURCE ======================== */

interface SourceModalProps {
  isOpen: boolean;
  /** Set when editing an existing source; null when adding a new one. */
  editing: IncomeSource | null;
  settings: Settings;
  onClose: () => void;
  onSave: (data: Omit<IncomeSource, 'id'>) => void;
  onUpdate: (source: IncomeSource) => void;
  onDelete: (id: string) => void;
}

export const SourceModal: React.FC<SourceModalProps> = ({
  isOpen,
  editing,
  settings,
  onClose,
  onSave,
  onUpdate,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IncomeSourceKind>('House rent');
  const [payer, setPayer] = useState('');
  const [payerContact, setPayerContact] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeSource['frequency']>('mo');
  const [dueDay, setDueDay] = useState('5');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [depositHeld, setDepositHeld] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? '');
    setKind(editing?.kind ?? 'House rent');
    setPayer(editing?.payer ?? '');
    setPayerContact(editing?.payerContact ?? '');
    setAmount(editing ? String(editing.amount) : '');
    setFrequency(editing?.frequency ?? 'mo');
    setDueDay(String(editing?.dueDay ?? 5));
    setStartDate(editing?.startDate ?? todayISO());
    setEndDate(editing?.endDate ?? '');
    setNotes(editing?.notes ?? '');
    setDepositHeld(editing?.depositHeld ? String(editing.depositHeld) : '');
  }, [isOpen, editing]);

  const amountValue = parseFloat(amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || amountValue <= 0) return;

    const data: Omit<IncomeSource, 'id'> = {
      name: name.trim(),
      kind,
      payer: payer.trim() || undefined,
      payerContact: payerContact.trim() || undefined,
      amount: amountValue,
      frequency,
      dueDay: Math.min(31, Math.max(1, parseInt(dueDay, 10) || 1)),
      startDate,
      endDate: endDate || undefined,
      status: editing?.status ?? 'active',
      depositHeld: parseFloat(depositHeld) || undefined,
      notes: notes.trim() || undefined,
    };

    if (editing) onUpdate({ ...data, id: editing.id });
    else onSave(data);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Source' : 'Add Income Source'}
      icon="real_estate_agent"
      iconBg="bg-[#f0fdf4]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>What is it</Label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Flat 301, Shop 2 — MG Road"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kind</Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as IncomeSourceKind)}
              className={inputClass}
            >
              {INCOME_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Who pays</Label>
            <input
              type="text"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              placeholder="Tenant name"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label hint={`per ${frequency === 'mo' ? 'month' : frequency === 'qtr' ? 'quarter' : 'year'}`}>
            Expected amount
          </Label>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={bigInputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Frequency</Label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as IncomeSource['frequency'])}
              className={inputClass}
            >
              <option value="mo">Monthly</option>
              <option value="qtr">Quarterly</option>
              <option value="yr">Yearly</option>
            </select>
          </div>
          <div>
            <Label hint="of the month">Due day</Label>
            <input
              type="number"
              min="1"
              max="31"
              required
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="first due">Starts</Label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <Label hint="optional">Ends</Label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="not income">Deposit held</Label>
            <input
              type="number"
              step="any"
              min="0"
              value={depositHeld}
              onChange={(e) => setDepositHeld(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
          <div>
            <Label>Phone / note</Label>
            <input
              type="text"
              value={payerContact}
              onChange={(e) => setPayerContact(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Agreement terms, hike date…"
            className={inputClass}
          />
        </div>

        {amountValue > 0 && (
          <div className="flex justify-between items-center px-4 py-3 bg-[#f0fdf4] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Per month equivalent
            </span>
            <span className="font-display font-black text-lg text-slate-900">
              {money(amountValue / (frequency === 'yr' ? 12 : frequency === 'qtr' ? 3 : 1), settings.currency)}
            </span>
          </div>
        )}

        {editing && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onUpdate({ ...editing, status: editing.status === 'active' ? 'ended' : 'active' });
                onClose();
              }}
              className={`flex-1 ${ghostButtonClass}`}
            >
              {editing.status === 'active' ? 'Mark ended' : 'Reactivate'}
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(editing.id);
                onClose();
              }}
              className="flex-1 py-3 border-2 border-rose-600 rounded-2xl text-xs font-black uppercase tracking-wider text-rose-700 hover:bg-rose-50 cursor-pointer transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        <FormActions onCancel={onClose} submitLabel={editing ? 'Save Source' : 'Add Source'} />
      </form>
    </ModalShell>
  );
};

/* ======================== COLLECT A PAYMENT ======================== */

interface CollectModalProps {
  view: DueView | null;
  settings: Settings;
  onClose: () => void;
  onCollect: (view: DueView, amount: number, date: string, method: string) => void;
  onWaive: (view: DueView) => void;
}

export const CollectModal: React.FC<CollectModalProps> = ({
  view,
  settings,
  onClose,
  onCollect,
  onWaive,
}) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('UPI');

  useEffect(() => {
    if (!view) return;
    setAmount(String(view.outstanding));
    setDate(todayISO());
    setMethod('UPI');
  }, [view]);

  if (!view) return null;

  const amountValue = parseFloat(amount) || 0;
  const remaining = Math.max(0, view.outstanding - amountValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amountValue <= 0) return;
    onCollect(view, amountValue, date, method);
    onClose();
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Collect — ${view.source.name}`}
      icon="payments"
      iconBg="bg-[#f0fdf4]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="px-4 py-3 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] space-y-1">
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
            <span>{periodLabel(view.due.periodKey)} rent</span>
            <span className="text-slate-900">{money(view.due.expected, settings.currency)}</span>
          </div>
          {view.due.carriedOver > 0 && (
            <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-rose-600">
              <span>Carried over</span>
              <span>+{money(view.due.carriedOver, settings.currency)}</span>
            </div>
          )}
          {view.due.received > 0 && (
            <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-emerald-700">
              <span>Already received</span>
              <span>−{money(view.due.received, settings.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t-2 border-slate-200 text-xs font-black uppercase tracking-wider text-slate-900">
            <span>Outstanding</span>
            <span>{money(view.outstanding, settings.currency)}</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Due {displayDate(view.due.dueDate)}
            {view.overdue ? ` · ${view.daysLate} days late` : ''}
          </p>
        </div>

        <div>
          <Label hint="part payments allowed">Received</Label>
          <input
            type="number"
            step="any"
            min="0"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={bigInputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>On</Label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <Label>Via</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {remaining > 0 && amountValue > 0 && (
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border-2 border-slate-900 rounded-2xl px-4 py-3">
            {money(remaining, settings.currency)} stays owed and rolls into next month.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            onWaive(view);
            onClose();
          }}
          className={`w-full ${ghostButtonClass}`}
        >
          Waive this period
        </button>

        <FormActions onCancel={onClose} submitLabel="Record Payment" />
      </form>
    </ModalShell>
  );
};

/* ============================ LOANS ============================ */

interface LoanModalProps {
  isOpen: boolean;
  editing: Loan | null;
  settings: Settings;
  onClose: () => void;
  onSave: (data: Omit<Loan, 'id'>) => void;
  onUpdate: (loan: Loan) => void;
  onDelete: (id: string) => void;
}

export const LoanModal: React.FC<LoanModalProps> = ({
  isOpen,
  editing,
  settings,
  onClose,
  onSave,
  onUpdate,
  onDelete,
}) => {
  const [person, setPerson] = useState('');
  const [direction, setDirection] = useState<Loan['direction']>('lent');
  const [principal, setPrincipal] = useState('');
  const [date, setDate] = useState(todayISO());
  const [expectedBack, setExpectedBack] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPerson(editing?.person ?? '');
    setDirection(editing?.direction ?? 'lent');
    setPrincipal(editing ? String(editing.principal) : '');
    setDate(editing?.date ?? todayISO());
    setExpectedBack(editing?.expectedBack ?? '');
    setNote(editing?.note ?? '');
  }, [isOpen, editing]);

  const principalValue = parseFloat(principal) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!person.trim() || principalValue <= 0) return;

    const data: Omit<Loan, 'id'> = {
      person: person.trim(),
      direction,
      principal: principalValue,
      date,
      expectedBack: expectedBack || undefined,
      repaid: editing?.repaid ?? 0,
      status: editing?.status ?? 'open',
      transactionIds: editing?.transactionIds ?? [],
      note: note.trim() || undefined,
    };

    if (editing) onUpdate({ ...data, id: editing.id });
    else onSave(data);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Loan' : 'Money Lent or Borrowed'}
      icon="handshake"
      iconBg="bg-[#fef3c7]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(['lent', 'borrowed'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider border-2 border-slate-900 cursor-pointer transition-all ${
                direction === d
                  ? 'bg-slate-900 text-white shadow-[3px_3px_0px_0px_#4f46e5]'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {d === 'lent' ? 'I lent it' : 'I borrowed it'}
            </button>
          ))}
        </div>

        <div>
          <Label>{direction === 'lent' ? 'Who owes you' : 'Who you owe'}</Label>
          <input
            type="text"
            required
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
        </div>

        <div>
          <Label>Amount</Label>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="0.00"
            className={bigInputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>On</Label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <Label hint="optional">Expected back</Label>
            <input
              type="date"
              value={expectedBack}
              onChange={(e) => setExpectedBack(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <Label>Note</Label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What it was for"
            className={inputClass}
          />
        </div>

        {!editing && principalValue > 0 && (
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-600 bg-slate-50 border-2 border-slate-900 rounded-2xl px-4 py-3">
            Logged as a transfer — {money(principalValue, settings.currency)} moves your balance but never counts as
            spending.
          </p>
        )}

        {editing && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onUpdate({ ...editing, status: editing.status === 'written-off' ? 'open' : 'written-off' });
                onClose();
              }}
              className={`flex-1 ${ghostButtonClass}`}
            >
              {editing.status === 'written-off' ? 'Reopen' : 'Write off'}
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(editing.id);
                onClose();
              }}
              className="flex-1 py-3 border-2 border-rose-600 rounded-2xl text-xs font-black uppercase tracking-wider text-rose-700 hover:bg-rose-50 cursor-pointer transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        <FormActions onCancel={onClose} submitLabel={editing ? 'Save Loan' : 'Record It'} />
      </form>
    </ModalShell>
  );
};

interface SettleLoanModalProps {
  view: LoanView | null;
  settings: Settings;
  onClose: () => void;
  onSettle: (view: LoanView, amount: number, date: string) => void;
}

export const SettleLoanModal: React.FC<SettleLoanModalProps> = ({ view, settings, onClose, onSettle }) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (!view) return;
    setAmount(String(view.outstanding));
    setDate(todayISO());
  }, [view]);

  if (!view) return null;

  const lent = view.loan.direction === 'lent';
  const amountValue = parseFloat(amount) || 0;
  const remaining = Math.max(0, view.outstanding - amountValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amountValue <= 0) return;
    onSettle(view, amountValue, date);
    onClose();
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={lent ? `${view.loan.person} repaid` : `Repay ${view.loan.person}`}
      icon={lent ? 'call_received' : 'call_made'}
      iconBg="bg-[#fef3c7]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="px-4 py-3 bg-slate-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a] space-y-1">
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
            <span>Principal</span>
            <span className="text-slate-900">{money(view.loan.principal, settings.currency)}</span>
          </div>
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-emerald-700">
            <span>Settled so far</span>
            <span>{money(view.loan.repaid, settings.currency)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t-2 border-slate-200 text-xs font-black uppercase tracking-wider text-slate-900">
            <span>Outstanding</span>
            <span>{money(view.outstanding, settings.currency)}</span>
          </div>
          {view.loan.expectedBack && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Expected {displayDate(view.loan.expectedBack)}
              {view.overdue ? ` · ${view.daysLate} days late` : ''}
            </p>
          )}
        </div>

        <div>
          <Label hint="part payments allowed">Amount</Label>
          <input
            type="number"
            step="any"
            min="0"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={bigInputClass}
          />
        </div>

        <div>
          <Label>On</Label>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {remaining > 0 && amountValue > 0 && (
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border-2 border-slate-900 rounded-2xl px-4 py-3">
            {money(remaining, settings.currency)} still {lent ? 'owed to you' : 'owed by you'}.
          </p>
        )}

        <FormActions onCancel={onClose} submitLabel="Record Settlement" />
      </form>
    </ModalShell>
  );
};
