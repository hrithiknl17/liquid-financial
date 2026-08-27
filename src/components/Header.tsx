import React from 'react';
import { NavTab } from '../types';
import { SyncStatus } from '../lib/useCloudSync';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenSearch: () => void;
  onOpenProfile: () => void;
  onOpenAgent: () => void;
  sync: SyncStatus;
}

export const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: 'hub', label: 'Hub', icon: 'grid_view' },
  { id: 'ledger', label: 'Ledger', icon: 'receipt_long' },
  { id: 'income', label: 'Income', icon: 'real_estate_agent' },
  { id: 'vault', label: 'Vault', icon: 'subscriptions' },
  { id: 'invest', label: 'Invest', icon: 'trending_up' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenSearch,
  onOpenProfile,
  onOpenAgent,
  sync,
}) => {
  // One badge, four truths: local-only, talking to the cloud, up to date, or
  // holding writes until the network comes back.
  const badge =
    sync.state === 'off'
      ? { label: 'Saved locally', dot: 'bg-emerald-500', tone: 'bg-[#f0fdf4]' }
      : sync.state === 'loading'
        ? { label: 'Syncing', dot: 'bg-amber-500 animate-pulse', tone: 'bg-amber-50' }
        : sync.state === 'offline'
          ? {
              label: sync.pending > 0 ? `Offline · ${sync.pending} queued` : 'Offline',
              dot: 'bg-slate-400',
              tone: 'bg-slate-100',
            }
          : sync.state === 'error'
            ? { label: 'Sync failed', dot: 'bg-rose-500', tone: 'bg-rose-50' }
            : {
                label: sync.pending > 0 ? `${sync.pending} queued` : 'Synced',
                dot: 'bg-emerald-500',
                tone: 'bg-[#f0fdf4]',
              };

  return (
    <header className="w-full top-0 bg-[#fcfcfc] border-b-2 border-slate-900 sticky z-40 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 max-w-[1280px] mx-auto w-full">
        <div className="flex items-center gap-8 md:gap-12">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg border-2 border-slate-900 shadow-[2px_2px_0px_0px_#4f46e5]">
              L
            </div>
            <h1 className="font-display text-xl md:text-2xl font-black tracking-tighter text-slate-900">
              LIQUID<span className="text-indigo-600">.OS</span>
            </h1>
          </div>

          <nav className="hidden md:flex gap-6 text-xs font-black uppercase tracking-widest text-slate-400">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-slate-900 bg-slate-100 border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]'
                    : 'hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div
            className={`hidden sm:flex items-center gap-2 ${badge.tone} border-2 border-slate-900 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider text-slate-800 shadow-[2px_2px_0px_0px_#0f172a]`}
            title={sync.message ?? undefined}
          >
            <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
            <span>{badge.label}</span>
          </div>

          <button
            onClick={onOpenAgent}
            id="agent-launcher"
            aria-label="Ask Liquid"
            title="Ask Liquid — add, change or remove anything by typing it"
            className="h-10 pl-2.5 pr-3 sm:px-3 flex items-center gap-1.5 rounded-xl bg-[#ede9fe] border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-[#ddd6fe] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-slate-900 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">auto_awesome</span>
            <span className="hidden sm:inline text-[11px] font-black uppercase tracking-wider">Ask</span>
          </button>

          <button
            onClick={onOpenSearch}
            aria-label="Search transactions, vault entries and holdings"
            id="global-search-button"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-slate-900"
            title="Search anything"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">search</span>
          </button>

          <button
            onClick={onOpenProfile}
            id="user-profile-button"
            aria-label="Settings and data"
            className="w-10 h-10 rounded-xl bg-[#ede9fe] flex items-center justify-center shrink-0 border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] cursor-pointer hover:bg-[#ddd6fe] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-slate-900"
            title="Settings, backup & sample data"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
