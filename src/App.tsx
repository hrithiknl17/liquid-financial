import { useCallback, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  Brief,
  CustomCategory,
  IncomeDue,
  IncomeSource,
  Investment,
  Loan,
  NavTab,
  Settings,
  Signal,
  Subscription,
  Transaction,
} from './types';
import { DEFAULT_SETTINGS, buildDemoData } from './data/initialData';
import { KEYS, clearAll, load, save, uid } from './lib/storage';
import { addDays, addMonths, currentMonthKey, daysUntil, rollRenewal, todayISO } from './lib/dates';
import { iconForCategory, summarize } from './lib/finance';
import { iconFor } from './lib/categories';
import {
  buildBrief,
  buildSignals,
  candidateToSubscription,
  frequentEntries,
  RecurringCandidate,
  safeToSpend,
} from './lib/insights';
import {
  dueBrief,
  markBriefSeen,
  registerBackgroundReminders,
  scheduleTodaysReminders,
} from './lib/reminders';
import { deleteReceipt } from './lib/receipts';
import { DueView, paymentTransaction, periodLabel, reconcileDues, viewDues } from './lib/income';
import {
  LoanView,
  hydrateLoans,
  loanTransaction,
  outstandingLoan,
  repaymentTransaction,
} from './lib/loans';
import { AgentState, ChatTurn, ProposedAction } from './lib/agent';
import { CloudData, useCloudSync } from './lib/useCloudSync';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HubScreen } from './components/HubScreen';
import { LedgerScreen } from './components/LedgerScreen';
import { VaultScreen } from './components/VaultScreen';
import { InvestScreen } from './components/InvestScreen';
import { IncomeScreen } from './components/IncomeScreen';
import { CollectModal, LoanModal, SettleLoanModal, SourceModal } from './components/IncomeModals';
import { AgentModal } from './components/AgentModal';
import { CategoryModal } from './components/CategoryModal';
import {
  AddInvestmentModal,
  AddSubscriptionModal,
  AddTransactionModal,
  AdjustCashModal,
  GlobalSearchModal,
} from './components/Modals';
import {
  InvestmentDetailModal,
  SubscriptionManageModal,
  TransactionDetailModal,
} from './components/DetailModals';
import { ProfileModal } from './components/ProfileModal';
import { QuickAddModal, ScanBillModal } from './components/CaptureModals';
import { BriefBanner, CaptureDial, SignalsSection } from './components/Signals';

export default function App({ session }: { session?: Session | null }) {
  // The account this browser is writing as. `null` means local-only mode.
  const userId = session?.user.id ?? null;

  const [activeTab, setActiveTab] = useState<NavTab>('hub');

  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...load<Partial<Settings>>(KEYS.settings, {}),
  }));
  const [transactions, setTransactions] = useState<Transaction[]>(() => load<Transaction[]>(KEYS.transactions, []));
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() =>
    load<Subscription[]>(KEYS.subscriptions, [])
  );
  const [investments, setInvestments] = useState<Investment[]>(() => load<Investment[]>(KEYS.investments, []));
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>(() =>
    load<IncomeSource[]>(KEYS.incomeSources, [])
  );
  const [incomeDues, setIncomeDues] = useState<IncomeDue[]>(() => load<IncomeDue[]>(KEYS.incomeDues, []));
  const [loans, setLoans] = useState<Loan[]>(() => load<Loan[]>(KEYS.loans, []));
  const [chat, setChat] = useState<ChatTurn[]>(() => load<ChatTurn[]>(KEYS.chat, []));
  const [categories, setCategories] = useState<CustomCategory[]>(() =>
    load<CustomCategory[]>(KEYS.categories, [])
  );

  // Which month the Ledger and Hub headline numbers describe.
  const [activeMonth, setActiveMonth] = useState<string>(currentMonthKey());

  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  /** A bill handed over by the OS share sheet, waiting to be scanned. */
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [dismissedSignals, setDismissedSignals] = useState<string[]>(() =>
    load<string[]>(KEYS.dismissedSignals, [])
  );
  const [briefKind, setBriefKind] = useState<Brief['kind'] | null>(null);
  /** Basket item the Ledger should show a price history for. */
  const [itemFocus, setItemFocus] = useState<string | null>(null);
  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [isAddInvOpen, setIsAddInvOpen] = useState(false);
  const [isCashOpen, setIsCashOpen] = useState<'in' | 'out' | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [collecting, setCollecting] = useState<DueView | null>(null);
  const [isLoanOpen, setIsLoanOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [settlingLoan, setSettlingLoan] = useState<LoanView | null>(null);

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [selectedInv, setSelectedInv] = useState<Investment | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /** What sync compares against; every collection the cloud mirrors. */
  const snapshot = useMemo(
    () => ({ transactions, subscriptions, investments, incomeSources, incomeDues, loans }),
    [transactions, subscriptions, investments, incomeSources, incomeDues, loans]
  );

  /** Replaces local state with whatever the account holds. */
  const handlePulled = useCallback((data: CloudData) => {
    setTransactions([...data.transactions].sort((a, b) => b.date.localeCompare(a.date)));
    setSubscriptions(data.subscriptions);
    setInvestments(data.investments);
    setIncomeSources(data.incomeSources);
    setIncomeDues(data.incomeDues);
    setLoans(data.loans);
  }, []);

  const { status: syncStatus } = useCloudSync(userId, snapshot, handlePulled);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 2600);
  }, []);

  useEffect(() => save(KEYS.settings, settings), [settings]);
  useEffect(() => save(KEYS.transactions, transactions), [transactions]);
  useEffect(() => save(KEYS.subscriptions, subscriptions), [subscriptions]);
  useEffect(() => save(KEYS.investments, investments), [investments]);
  useEffect(() => save(KEYS.incomeSources, incomeSources), [incomeSources]);
  useEffect(() => save(KEYS.incomeDues, incomeDues), [incomeDues]);
  useEffect(() => save(KEYS.loans, loans), [loans]);
  useEffect(() => save(KEYS.chat, chat), [chat]);
  useEffect(() => save(KEYS.categories, categories), [categories]);

  /**
   * Materialise the periods every source owes, and roll arrears forward. Runs
   * whenever the sources change and once per load, so a month that passed with
   * the app closed still produces its due.
   */
  useEffect(() => {
    setIncomeDues((prev) => {
      const next = reconcileDues(incomeSources, prev, transactions);
      // Only replace when something actually moved; the array is rebuilt every call.
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [incomeSources, transactions]);

  /**
   * One-time migration for data written before payments were links.
   *
   * Loan repayments were always one entry per settlement, so those can simply
   * be tagged. Rent was not: a single entry could be split across June and July,
   * and a tag cannot express that. For those, each period's stored `received`
   * is the only unambiguous record, so the old entries are replaced by one
   * entry per period — same money, same dates, now attributable.
   */
  useEffect(() => {
    if (load<boolean>(KEYS.countersMigrated, false)) return;

    const legacyDues = load<(IncomeDue & { transactionIds?: string[] })[]>(KEYS.incomeDues, []);
    const legacyLoans = load<Loan[]>(KEYS.loans, []);
    const sources = load<IncomeSource[]>(KEYS.incomeSources, []);

    // Entries the old dues owned; they get rebuilt below.
    const supersededIds = new Set<string>();
    for (const due of legacyDues) {
      for (const txId of due.transactionIds ?? []) supersededIds.add(txId);
    }

    const rebuilt: Transaction[] = [];
    for (const due of legacyDues) {
      if (!(due.received > 0)) continue;
      const source = sources.find((entry) => entry.id === due.sourceId);
      if (!source) continue;
      const date = due.lastReceivedDate ?? due.dueDate;
      rebuilt.push({
        ...paymentTransaction(source, due.received, date),
        id: uid('tx'),
        dueId: due.id,
        note: `Rent collection — ${source.name} (${periodLabel(due.periodKey)})`,
      });
    }

    const loanOf = new Map<string, string>();
    for (const loan of legacyLoans) {
      // The first id is the original movement of money, not a repayment.
      for (const txId of (loan.transactionIds ?? []).slice(1)) loanOf.set(txId, loan.id);
    }

    if (supersededIds.size > 0 || rebuilt.length > 0 || loanOf.size > 0) {
      setTransactions((prev) =>
        sortTx([
          ...rebuilt,
          ...prev
            .filter((tx) => !supersededIds.has(tx.id))
            .map((tx) => {
              const loanId = loanOf.get(tx.id);
              return loanId ? { ...tx, loanId } : tx;
            }),
        ])
      );
    }

    save(KEYS.countersMigrated, true);
    // Runs once per browser; the flag makes it idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * `repaid` and open/settled are read back off the ledger rather than stored,
   * so nothing has to be kept in step by hand — deleting a repayment entry
   * reopens the loan on its own.
   */
  const liveLoans = useMemo(() => hydrateLoans(loans, transactions), [loans, transactions]);

  /**
   * Catch up any renewal that fell due while the app was closed: roll the
   * cycle forward and, for auto-log entries, drop the charge into the ledger.
   */
  useEffect(() => {
    setSubscriptions((prevSubs) => {
      const logged: Transaction[] = [];
      let changed = false;

      const rolled = prevSubs.map((sub) => {
        if (sub.status !== 'active' || daysUntil(sub.nextRenewal) >= 0) return sub;

        const { cycleStart, nextRenewal, cyclesPassed } = rollRenewal(
          sub.cycleStart,
          sub.nextRenewal,
          sub.billingPeriod
        );
        if (cyclesPassed === 0) return sub;
        changed = true;

        if (sub.autoLog) {
          const step = sub.billingPeriod === 'mo' ? 1 : 12;
          for (let i = 0; i < cyclesPassed; i++) {
            const chargeDate = addMonths(sub.nextRenewal, step * i);
            logged.push({
              id: `auto-${sub.id}-${chargeDate}`,
              merchant: sub.name,
              category: sub.kind === 'recharge' ? 'Recharge' : 'Subscription',
              date: chargeDate,
              amount: -sub.cost,
              iconName: sub.kind === 'recharge' ? 'smartphone' : 'subscriptions',
              type: 'fixed',
              note: `${sub.plan} — auto-logged renewal`,
              sourceId: sub.id,
            });
          }
        }
        return { ...sub, cycleStart, nextRenewal };
      });

      if (logged.length > 0) {
        setTransactions((prevTxs) => {
          const existing = new Set(prevTxs.map((t) => t.id));
          const fresh = logged.filter((t) => !existing.has(t.id));
          if (fresh.length === 0) return prevTxs;
          return [...fresh, ...prevTxs].sort((a, b) => b.date.localeCompare(a.date));
        });
      }

      return changed ? rolled : prevSubs;
    });
    // Runs once per app load; renewals are date-driven, not render-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => save(KEYS.dismissedSignals, dismissedSignals), [dismissedSignals]);

  /** Re-arm today's notification timers whenever the reminder settings move. */
  useEffect(() => {
    scheduleTodaysReminders(settings);
    if (settings.remindersEnabled) void registerBackgroundReminders(settings);
  }, [settings]);

  /** Surface the brief that is due, unless it was already acknowledged today. */
  useEffect(() => {
    setBriefKind(dueBrief(settings));
    const timer = window.setInterval(() => setBriefKind(dueBrief(settings)), 60_000);
    return () => window.clearInterval(timer);
  }, [settings]);

  /**
   * A bill shared in from another app lands in a cache the service worker
   * writes to; collect it and open the scanner.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Home-screen shortcuts jump straight into a capture flow.
    const action = params.get('action');
    if (action === 'scan') setIsScanOpen(true);
    if (action === 'quick') setIsQuickAddOpen(true);
    if (action) window.history.replaceState({}, '', window.location.pathname);

    if (!params.has('share')) return;

    void (async () => {
      try {
        const cache = await caches.open('liquid-share');
        const response = await cache.match('/shared-bill');
        if (response) {
          const blob = await response.blob();
          setSharedFile(new File([blob], 'shared-bill', { type: blob.type || 'image/jpeg' }));
          setIsScanOpen(true);
          await cache.delete('/shared-bill');
        }
      } catch {
        // Nothing shared, or caches unavailable — ignore.
      }
      window.history.replaceState({}, '', window.location.pathname);
    })();
  }, []);

  const summary = useMemo(() => summarize(transactions, settings, activeMonth), [
    transactions,
    settings,
    activeMonth,
  ]);

  const safe = useMemo(
    () => safeToSpend(transactions, subscriptions, settings, summary),
    [transactions, subscriptions, settings, summary]
  );

  const signals = useMemo(
    () =>
      buildSignals(transactions, subscriptions, investments, settings, summary).filter(
        (signal) => !dismissedSignals.includes(signal.id)
      ),
    [transactions, subscriptions, investments, settings, summary, dismissedSignals]
  );

  const brief = useMemo(
    () => (briefKind ? buildBrief(briefKind, transactions, subscriptions, settings, summary) : null),
    [briefKind, transactions, subscriptions, settings, summary]
  );

  const quickSuggestions = useMemo(() => frequentEntries(transactions), [transactions]);

  const sortTx = (list: Transaction[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

  const handleAddTransaction = (data: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = { ...data, id: uid('tx') };
    setTransactions((prev) => sortTx([newTx, ...prev]));
    showToast(`Logged ${newTx.merchant}`);
  };

  const handleAddMany = (entries: Omit<Transaction, 'id'>[]) => {
    if (entries.length === 0) return;
    const created = entries.map((entry) => ({ ...entry, id: uid('tx') }));
    setTransactions((prev) => sortTx([...created, ...prev]));
    showToast(`Logged ${created.length} entr${created.length === 1 ? 'y' : 'ies'}`);
  };

  const handleUpdateTransaction = (updated: Transaction) => {
    setTransactions((prev) => sortTx(prev.map((t) => (t.id === updated.id ? updated : t))));
    showToast('Transaction updated');
  };

  const handleDeleteTransaction = (id: string) => {
    const target = transactions.find((t) => t.id === id);
    if (target?.receiptId) void deleteReceipt(target.receiptId);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    showToast('Transaction removed');
  };

  const handleDismissSignal = (id: string) => setDismissedSignals((prev) => [...prev, id]);

  /** Every signal's one-tap follow-through lands here. */
  const handleSignalAction = (signal: Signal) => {
    switch (signal.kind) {
      case 'recurring-candidate': {
        const candidate = signal.action?.payload as RecurringCandidate | undefined;
        if (!candidate) return;
        handleAddSubscription(candidateToSubscription(candidate));
        setDismissedSignals((prev) => [...prev, signal.id]);
        setActiveTab('vault');
        break;
      }
      case 'anomaly': {
        const txId = signal.action?.payload as string | undefined;
        const target = transactions.find((t) => t.id === txId);
        if (target) {
          setSelectedTx(target);
          setActiveTab('ledger');
        }
        break;
      }
      case 'basket-price': {
        setItemFocus((signal.action?.payload as string) ?? null);
        setActiveTab('ledger');
        break;
      }
      case 'stale-price':
        setActiveTab('invest');
        break;
      default:
        break;
    }
  };

  const dismissBrief = () => {
    if (!briefKind) return;
    markBriefSeen(briefKind);
    setBriefKind(null);
  };

  const handleAdjustCash = (direction: 'in' | 'out', amount: number, label: string, note: string) => {
    const isIn = direction === 'in';
    handleAddTransaction({
      merchant: label,
      category: isIn ? 'Other Income' : 'Other',
      date: todayISO(),
      amount: isIn ? amount : -amount,
      iconName: isIn ? 'account_balance' : 'arrow_outward',
      type: isIn ? 'income' : 'discretionary',
      note,
      paymentMethod: 'Cash / Bank',
    });
  };

  const handleAddSubscription = (data: Omit<Subscription, 'id'>) => {
    const newSub: Subscription = { ...data, id: uid('sub') };
    setSubscriptions((prev) => [newSub, ...prev]);
    showToast(`${newSub.name} added to Vault`);
  };

  const handleUpdateSubscription = (updated: Subscription) => {
    setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    showToast(`Updated ${updated.name}`);
  };

  const handleDeleteSubscription = (id: string) => {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    showToast('Removed from Vault');
  };

  /** "Mark as paid": log the charge now and push the cycle forward. */
  const handlePaySubscription = (sub: Subscription) => {
    handleAddTransaction({
      merchant: sub.name,
      category: sub.kind === 'recharge' ? 'Recharge' : 'Subscription',
      date: todayISO(),
      amount: -sub.cost,
      iconName: sub.kind === 'recharge' ? 'smartphone' : 'subscriptions',
      type: 'fixed',
      note: sub.plan,
      sourceId: sub.id,
    });
    const step = sub.billingPeriod === 'mo' ? 1 : 12;
    handleUpdateSubscription({
      ...sub,
      cycleStart: todayISO(),
      nextRenewal: addMonths(todayISO(), step),
    });
  };

  const handleAddInvestment = (data: Omit<Investment, 'id'>) => {
    const newInv: Investment = { ...data, id: uid('inv') };
    setInvestments((prev) => [newInv, ...prev]);
    showToast(`Tracking ${newInv.name}`);
  };

  const handleUpdateInvestment = (updated: Investment) => {
    setInvestments((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    showToast(`Updated ${updated.name}`);
  };

  const handleDeleteInvestment = (id: string) => {
    setInvestments((prev) => prev.filter((i) => i.id !== id));
    showToast('Holding removed');
  };

  /** Records a buy against a holding: averages the cost and logs the outflow. */
  const handleBuyMore = (inv: Investment, units: number, price: number) => {
    const totalUnits = inv.units + units;
    const avgCost = totalUnits === 0 ? price : (inv.units * inv.avgCost + units * price) / totalUnits;
    handleUpdateInvestment({ ...inv, units: totalUnits, avgCost, currentPrice: price, priceUpdatedAt: todayISO() });
    handleAddTransaction({
      merchant: inv.name,
      category: 'Investment',
      date: todayISO(),
      amount: -(units * price),
      iconName: iconForCategory('Investment'),
      type: 'fixed',
      note: `Bought ${units} @ ${price}`,
    });
  };

  /* ====================== CATEGORIES ====================== */

  const handleAddCategory = (data: Omit<CustomCategory, 'id'>) => {
    setCategories((prev) => [...prev, { ...data, id: uid('cat') }]);
    showToast(`${data.name} added`);
  };

  const handleUpdateCategory = (updated: CustomCategory) => {
    const previous = categories.find((entry) => entry.id === updated.id);
    setCategories((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));

    // A rename has to follow the transactions filed under the old name, or
    // they end up orphaned under a category nothing offers any more.
    if (previous && previous.name !== updated.name) {
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.category === previous.name
            ? { ...tx, category: updated.name, iconName: updated.iconName }
            : tx
        )
      );
    }
    showToast(`${updated.name} updated`);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((entry) => entry.id !== id));
    showToast('Category removed');
  };

  /* ===================== INCOME SOURCES ===================== */

  const handleAddSource = (data: Omit<IncomeSource, 'id'>) => {
    const source: IncomeSource = { ...data, id: uid('src') };
    setIncomeSources((prev) => [source, ...prev]);
    showToast(`Tracking ${source.name}`);
  };

  const handleUpdateSource = (updated: IncomeSource) => {
    setIncomeSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    showToast(`Updated ${updated.name}`);
  };

  const handleDeleteSource = (id: string) => {
    setIncomeSources((prev) => prev.filter((s) => s.id !== id));
    setIncomeDues((prev) => prev.filter((due) => due.sourceId !== id));
    showToast('Source removed');
  };

  /**
   * Books a payment against one period and re-rolls the arrears chain, so a
   * late payment entered against an old month clears next month's carry-over.
   */
  const handleCollect = (view: DueView, amount: number, date: string, method: string) => {
    // Oldest period first: paying the ₹24,000 shown on August must also close
    // the June and July shortfalls that were rolled into it.
    applyIncomePayment(view.source.id, amount, date, method);
    showToast(`Collected from ${view.source.name}`);
  };

  const handleWaiveDue = (view: DueView) => {
    setIncomeDues((prev) =>
      reconcileDues(
        incomeSources,
        prev.map((due) => (due.id === view.due.id ? { ...due, status: 'waived' as const } : due)),
        transactions
      )
    );
    showToast('Period waived');
  };

  /**
   * Settles `amount` across a source's open periods, oldest first — what the
   * agent uses when told "Sanjay paid 8,000". Anything over the outstanding
   * balance lands on the newest period as credit.
   */
  const applyIncomePayment = (
    sourceId: string,
    amount: number | undefined,
    date: string,
    method?: string
  ): string => {
    const source = incomeSources.find((entry) => entry.id === sourceId);
    if (!source) return 'That income source is gone';

    const open = viewDues(incomeDues, incomeSources)
      .filter((view) => view.due.sourceId === sourceId && view.outstanding > 0)
      .sort((a, b) => a.due.periodKey.localeCompare(b.due.periodKey));

    const total = amount ?? open.reduce((sum, view) => sum + view.outstanding, 0);
    if (total <= 0) return `Nothing outstanding for ${source.name}`;

    const allocation = new Map<string, number>();
    let left = total;
    for (const view of open) {
      if (left <= 0) break;
      const take = Math.min(left, view.outstanding);
      allocation.set(view.due.id, take);
      left -= take;
    }
    // Overpayment (or no open period) rides on the newest due as credit.
    if (left > 0) {
      const target = open[open.length - 1]?.due.id ?? incomeDues.find((due) => due.sourceId === sourceId)?.id;
      if (!target) return `No period to book this against for ${source.name}`;
      allocation.set(target, (allocation.get(target) ?? 0) + left);
    }

    // One entry per period settled. Nothing is written to the due itself: the
    // reconcile pass sums these back up, which is what makes two offline
    // devices merge instead of overwriting each other's total.
    const entries: Transaction[] = [...allocation.entries()].map(([dueId, share]) => {
      const period = incomeDues.find((due) => due.id === dueId);
      const base = paymentTransaction(source, share, date, method);
      return {
        ...base,
        id: uid('tx'),
        dueId,
        note: period ? `${base.note} (${periodLabel(period.periodKey)})` : base.note,
      };
    });

    setTransactions((prev) => sortTx([...entries, ...prev]));
    return `Recorded ${total} from ${source.name}`;
  };

  /* ========================= LOANS ========================= */

  /** The money changing hands is a transfer, never spending. */
  const handleAddLoan = (data: Omit<Loan, 'id'>) => {
    const tx: Transaction = { ...loanTransaction(data, data.date), id: uid('tx') };
    setTransactions((prev) => sortTx([tx, ...prev]));
    setLoans((prev) => [{ ...data, id: uid('loan'), transactionIds: [tx.id] }, ...prev]);
    showToast(data.direction === 'lent' ? `Lent to ${data.person}` : `Borrowed from ${data.person}`);
  };

  const handleUpdateLoan = (updated: Loan) => {
    setLoans((prev) => prev.map((loan) => (loan.id === updated.id ? updated : loan)));
    showToast('Loan updated');
  };

  const handleDeleteLoan = (id: string) => {
    setLoans((prev) => prev.filter((loan) => loan.id !== id));
    showToast('Loan removed');
  };

  const settleLoanBy = (loan: Loan, amount: number, date: string): string => {
    const tx: Transaction = { ...repaymentTransaction(loan, amount, date), id: uid('tx') };
    setTransactions((prev) => sortTx([tx, ...prev]));
    return `Settled ${amount} with ${loan.person}`;
  };

  const handleSettleLoan = (view: LoanView, amount: number, date: string) => {
    settleLoanBy(view.loan, amount, date);
    showToast(`${view.loan.person} — settlement recorded`);
  };

  /* ====================== SMART AGENT ====================== */

  const agentState: AgentState = useMemo(
    () => ({
      transactions,
      subscriptions,
      investments,
      incomeSources,
      loans: liveLoans,
      categories,
      settings,
    }),
    [transactions, subscriptions, investments, incomeSources, liveLoans, categories, settings]
  );

  /** Turns one confirmed proposal into real state. Nothing here runs unasked. */
  const applyAgentAction = (action: ProposedAction): string => {
    const args = action.args;
    const str = (key: string): string => String(args[key] ?? '');
    const num = (key: string): number => Number(args[key] ?? 0);
    const optionalNum = (key: string): number | undefined =>
      args[key] === undefined ? undefined : Number(args[key]);
    const dateAt = (key = 'dayOffset'): string => addDays(todayISO(), Math.min(0, num(key)));

    switch (action.tool) {
      case 'add_transaction': {
        const out = str('direction') !== 'in';
        const category = (str('category') || (out ? 'Other' : 'Other Income')) as Transaction['category'];
        handleAddTransaction({
          merchant: str('merchant'),
          category,
          date: dateAt(),
          amount: out ? -Math.abs(num('amount')) : Math.abs(num('amount')),
          iconName: iconFor(category, categories),
          type: (str('type') || (out ? 'discretionary' : 'income')) as Transaction['type'],
          paymentMethod: args.paymentMethod === undefined ? undefined : str('paymentMethod'),
          note: args.note === undefined ? undefined : str('note'),
          origin: 'agent',
        });
        return 'Logged';
      }
      case 'delete_transaction':
        handleDeleteTransaction(str('id'));
        return 'Deleted';
      case 'add_vault_plan': {
        const renewal = args.renewalInDays === undefined ? 30 : num('renewalInDays');
        handleAddSubscription({
          name: str('name'),
          plan: args.plan === undefined ? '' : str('plan'),
          category: args.category === undefined ? 'Other' : str('category'),
          kind: (str('kind') || 'subscription') as Subscription['kind'],
          cost: num('cost'),
          billingPeriod: (str('billingPeriod') || 'mo') as Subscription['billingPeriod'],
          nextRenewal: addDays(todayISO(), Math.max(0, renewal)),
          cycleStart: todayISO(),
          status: 'active',
        });
        return 'Added to Vault';
      }
      case 'update_vault_plan': {
        const target = subscriptions.find((sub) => sub.id === str('id'));
        if (!target) return 'That plan is gone';
        handleUpdateSubscription({
          ...target,
          cost: args.cost === undefined ? target.cost : num('cost'),
          status: args.status === undefined ? target.status : (str('status') as Subscription['status']),
          nextRenewal:
            args.renewalInDays === undefined
              ? target.nextRenewal
              : addDays(todayISO(), Math.max(0, num('renewalInDays'))),
        });
        return 'Vault updated';
      }
      case 'remove_vault_plan':
        handleDeleteSubscription(str('id'));
        return 'Removed';
      case 'add_holding':
        handleAddInvestment({
          name: str('name'),
          symbol: args.symbol === undefined ? undefined : str('symbol'),
          assetClass: (str('assetClass') || 'Other') as Investment['assetClass'],
          units: num('units'),
          avgCost: num('avgCost'),
          currentPrice: args.currentPrice === undefined ? num('avgCost') : num('currentPrice'),
          openedDate: todayISO(),
          priceUpdatedAt: todayISO(),
        });
        return 'Holding tracked';
      case 'update_holding_price': {
        const target = investments.find((inv) => inv.id === str('id'));
        if (!target) return 'That holding is gone';
        handleUpdateInvestment({ ...target, currentPrice: num('currentPrice'), priceUpdatedAt: todayISO() });
        return 'Price updated';
      }
      case 'add_income_source':
        handleAddSource({
          name: str('name'),
          kind: (str('kind') || 'Other') as IncomeSource['kind'],
          payer: args.payer === undefined ? undefined : str('payer'),
          amount: num('amount'),
          frequency: (str('frequency') || 'mo') as IncomeSource['frequency'],
          dueDay: Math.min(31, Math.max(1, num('dueDay') || 1)),
          startDate: todayISO(),
          status: 'active',
        });
        return 'Source added';
      case 'record_rent_payment':
        return applyIncomePayment(str('sourceId'), optionalNum('amount'), dateAt());
      case 'add_loan': {
        const date = dateAt();
        handleAddLoan({
          person: str('person'),
          direction: (str('direction') || 'lent') as Loan['direction'],
          principal: Math.abs(num('amount')),
          date,
          expectedBack:
            args.expectedInDays === undefined ? undefined : addDays(date, Math.max(0, num('expectedInDays'))),
          repaid: 0,
          status: 'open',
          transactionIds: [],
          note: args.note === undefined ? undefined : str('note'),
        });
        return 'Loan recorded';
      }
      case 'record_loan_repayment': {
        const target = liveLoans.find((loan) => loan.id === str('id'));
        if (!target) return 'That loan is gone';
        const amount = optionalNum('amount') ?? outstandingLoan(target);
        if (amount <= 0) return 'Nothing outstanding on that loan';
        return settleLoanBy(target, amount, dateAt());
      }
      default:
        return 'Nothing to do';
    }
  };

  const handleApplyAgentAction = (action: ProposedAction): string => {
    const receipt = applyAgentAction(action);
    showToast(receipt);
    return receipt;
  };

  /**
   * Allotment day. Only the allotted lots turn into shares, and only that much
   * money actually leaves the account — the rest of the ASBA block simply
   * unblocks, which is why no refund entry is needed.
   */
  const handleAllotIpo = (inv: Investment, lots: number) => {
    if (!inv.ipo) return;
    const units = lots * inv.ipo.lotSize;
    const paid = units * inv.ipo.cutoffPrice;

    handleUpdateInvestment({
      ...inv,
      units,
      avgCost: inv.ipo.cutoffPrice,
      currentPrice: inv.ipo.cutoffPrice,
      priceUpdatedAt: todayISO(),
      ipo: { ...inv.ipo, status: 'allotted', allottedLots: lots, allotmentDate: todayISO() },
    });

    handleAddTransaction({
      merchant: inv.name,
      category: 'Investment',
      date: todayISO(),
      amount: -paid,
      iconName: iconForCategory('Investment'),
      type: 'fixed',
      note: `IPO allotment — ${lots} lot${lots === 1 ? '' : 's'} (${units} shares)`,
    });
  };

  /** No allotment: the block is released, nothing was ever spent. */
  const handleIpoLapsed = (inv: Investment) => {
    if (!inv.ipo) return;
    handleUpdateInvestment({
      ...inv,
      units: 0,
      avgCost: 0,
      currentPrice: 0,
      ipo: { ...inv.ipo, status: 'not-allotted', allottedLots: 0, allotmentDate: todayISO() },
    });
    showToast('Application closed — funds unblocked');
  };

  const handleLoadDemo = () => {
    const demo = buildDemoData();
    setTransactions(sortTx(demo.transactions));
    setSubscriptions(demo.subscriptions);
    setInvestments(demo.investments);
    setSettings(demo.settings);
    setActiveMonth(currentMonthKey());
    showToast('Sample data loaded');
  };

  const handleResetData = () => {
    clearAll(Object.values(KEYS));
    setTransactions([]);
    setSubscriptions([]);
    setInvestments([]);
    setIncomeSources([]);
    setIncomeDues([]);
    setLoans([]);
    setChat([]);
    setSettings(DEFAULT_SETTINGS);
    setActiveMonth(currentMonthKey());
    showToast('All data cleared');
  };

  const handleImport = (payload: {
    transactions?: Transaction[];
    subscriptions?: Subscription[];
    investments?: Investment[];
    incomeSources?: IncomeSource[];
    incomeDues?: IncomeDue[];
    loans?: Loan[];
    settings?: Partial<Settings>;
  }) => {
    if (payload.transactions) setTransactions(sortTx(payload.transactions));
    if (payload.subscriptions) setSubscriptions(payload.subscriptions);
    if (payload.investments) setInvestments(payload.investments);
    if (payload.incomeSources) setIncomeSources(payload.incomeSources);
    if (payload.incomeDues) setIncomeDues(payload.incomeDues);
    if (payload.loans) setLoans(payload.loans);
    if (payload.settings) setSettings((prev) => ({ ...prev, ...payload.settings }));
    showToast('Backup restored');
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-slate-900 flex flex-col selection:bg-indigo-500 selection:text-white font-sans">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenAgent={() => setIsAgentOpen(true)}
        sync={syncStatus}
      />

      <div className="flex-1">
        {activeTab === 'hub' && (
          <HubScreen
            summary={summary}
            settings={settings}
            transactions={transactions}
            subscriptions={subscriptions}
            investments={investments}
            activeMonth={activeMonth}
            safe={safe}
            signals={signals}
            brief={brief}
            onDismissBrief={dismissBrief}
            onSignalAction={handleSignalAction}
            onDismissSignal={handleDismissSignal}
            onOpenCashIn={() => setIsCashOpen('in')}
            onOpenCashOut={() => setIsCashOpen('out')}
            onOpenAddTransaction={() => setIsAddTxOpen(true)}
            onOpenScan={() => setIsScanOpen(true)}
            onOpenQuickAdd={() => setIsQuickAddOpen(true)}
            onOpenSettings={() => setIsProfileOpen(true)}
            onNavigate={setActiveTab}
            onSelectSubscription={setSelectedSub}
            onSelectTransaction={setSelectedTx}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerScreen
            summary={summary}
            settings={settings}
            transactions={transactions}
            activeMonth={activeMonth}
            itemFocus={itemFocus}
            onClearItemFocus={() => setItemFocus(null)}
            onChangeMonth={setActiveMonth}
            onOpenAddTransaction={() => setIsAddTxOpen(true)}
            onOpenScan={() => setIsScanOpen(true)}
            onSelectTransaction={setSelectedTx}
          />
        )}

        {activeTab === 'income' && (
          <IncomeScreen
            sources={incomeSources}
            dues={incomeDues}
            loans={liveLoans}
            settings={settings}
            onAddSource={() => {
              setEditingSource(null);
              setIsSourceOpen(true);
            }}
            onAddLoan={() => {
              setEditingLoan(null);
              setIsLoanOpen(true);
            }}
            onCollect={setCollecting}
            onEditSource={(source) => {
              setEditingSource(source);
              setIsSourceOpen(true);
            }}
            onSettleLoan={setSettlingLoan}
            onEditLoan={(loan) => {
              setEditingLoan(loan);
              setIsLoanOpen(true);
            }}
          />
        )}

        {activeTab === 'vault' && (
          <VaultScreen
            subscriptions={subscriptions}
            settings={settings}
            onOpenAddSubscription={() => setIsAddSubOpen(true)}
            onSelectSubscription={setSelectedSub}
          />
        )}

        {activeTab === 'invest' && (
          <InvestScreen
            investments={investments}
            settings={settings}
            onOpenAddInvestment={() => setIsAddInvOpen(true)}
            onSelectInvestment={setSelectedInv}
          />
        )}
      </div>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Vault and Invest have their own add buttons; don't stack two FABs. */}
      {(activeTab === 'hub' || activeTab === 'ledger') && (
        <CaptureDial
          onScan={() => setIsScanOpen(true)}
          onQuickAdd={() => setIsQuickAddOpen(true)}
          onManual={() => setIsAddTxOpen(true)}
        />
      )}

      {toastMessage && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border-2 border-slate-900 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-[4px_4px_0px_0px_#4f46e5] flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="material-symbols-outlined text-emerald-400 text-[18px] font-bold">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        settings={settings}
        categories={categories}
        onAddTransaction={handleAddTransaction}
      />

      <CategoryModal
        isOpen={isCategoriesOpen}
        onClose={() => setIsCategoriesOpen(false)}
        custom={categories}
        transactions={transactions}
        onAdd={handleAddCategory}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
      />

      <ScanBillModal
        isOpen={isScanOpen}
        categories={categories}
        onClose={() => {
          setIsScanOpen(false);
          setSharedFile(null);
        }}
        settings={settings}
        incomingFile={sharedFile}
        onAddTransaction={handleAddTransaction}
        onOpenSettings={() => setIsProfileOpen(true)}
      />

      <QuickAddModal
        isOpen={isQuickAddOpen}
        categories={categories}
        onClose={() => setIsQuickAddOpen(false)}
        settings={settings}
        suggestions={quickSuggestions}
        onAddMany={handleAddMany}
      />

      <AddSubscriptionModal
        isOpen={isAddSubOpen}
        onClose={() => setIsAddSubOpen(false)}
        settings={settings}
        onAddSubscription={handleAddSubscription}
      />

      <AddInvestmentModal
        isOpen={isAddInvOpen}
        onClose={() => setIsAddInvOpen(false)}
        settings={settings}
        onAddInvestment={handleAddInvestment}
      />

      <AdjustCashModal
        direction={isCashOpen}
        onClose={() => setIsCashOpen(null)}
        settings={settings}
        cashBalance={summary.cashBalance}
        onSubmit={handleAdjustCash}
      />

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        settings={settings}
        transactions={transactions}
        subscriptions={subscriptions}
        investments={investments}
        onSelectTx={(tx) => {
          setSelectedTx(tx);
          setActiveTab('ledger');
        }}
        onSelectSub={(sub) => {
          setSelectedSub(sub);
          setActiveTab('vault');
        }}
        onSelectInv={(inv) => {
          setSelectedInv(inv);
          setActiveTab('invest');
        }}
      />

      <TransactionDetailModal
        transaction={selectedTx}
        settings={settings}
        categories={categories}
        onClose={() => setSelectedTx(null)}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
      />

      <SubscriptionManageModal
        subscription={selectedSub}
        settings={settings}
        onClose={() => setSelectedSub(null)}
        onUpdate={handleUpdateSubscription}
        onDelete={handleDeleteSubscription}
        onMarkPaid={handlePaySubscription}
      />

      <InvestmentDetailModal
        investment={selectedInv}
        settings={settings}
        onClose={() => setSelectedInv(null)}
        onUpdate={handleUpdateInvestment}
        onDelete={handleDeleteInvestment}
        onBuyMore={handleBuyMore}
        onAllot={handleAllotIpo}
        onIpoLapsed={handleIpoLapsed}
      />

      <SourceModal
        isOpen={isSourceOpen}
        editing={editingSource}
        settings={settings}
        onClose={() => {
          setIsSourceOpen(false);
          setEditingSource(null);
        }}
        onSave={handleAddSource}
        onUpdate={handleUpdateSource}
        onDelete={handleDeleteSource}
      />

      <CollectModal
        view={collecting}
        settings={settings}
        onClose={() => setCollecting(null)}
        onCollect={handleCollect}
        onWaive={handleWaiveDue}
      />

      <LoanModal
        isOpen={isLoanOpen}
        editing={editingLoan}
        settings={settings}
        onClose={() => {
          setIsLoanOpen(false);
          setEditingLoan(null);
        }}
        onSave={handleAddLoan}
        onUpdate={handleUpdateLoan}
        onDelete={handleDeleteLoan}
      />

      <SettleLoanModal
        view={settlingLoan}
        settings={settings}
        onClose={() => setSettlingLoan(null)}
        onSettle={handleSettleLoan}
      />

      <AgentModal
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        state={agentState}
        history={chat}
        onHistoryChange={setChat}
        onApply={handleApplyAgentAction}
        onOpenSettings={() => {
          setIsAgentOpen(false);
          setIsProfileOpen(true);
        }}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        settings={settings}
        onUpdateSettings={(next) => setSettings((prev) => ({ ...prev, ...next }))}
        summary={summary}
        transactions={transactions}
        subscriptions={subscriptions}
        investments={investments}
        incomeSources={incomeSources}
        incomeDues={incomeDues}
        loans={liveLoans}
        onOpenCategories={() => {
          setIsProfileOpen(false);
          setIsCategoriesOpen(true);
        }}
        onLoadDemo={handleLoadDemo}
        onResetData={handleResetData}
        onImport={handleImport}
      />
    </div>
  );
}
