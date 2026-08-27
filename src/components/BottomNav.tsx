import React from 'react';
import { NavTab } from '../types';
import { TABS } from './Header';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      id="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 left-0 w-full bg-[#fcfcfc] border-t-2 border-slate-900 flex justify-around items-center pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] px-3 shadow-[0_-4px_0px_0px_#0f172a] z-50"
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`mobile-tab-${tab.id}`}
            onClick={() => onSelectTab(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
              active
                ? 'bg-slate-900 text-white border border-slate-900 shadow-[2px_2px_0px_0px_#4f46e5]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span
              className="material-symbols-outlined text-[22px] mb-0.5"
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
