import React, { useEffect } from 'react';
import { accentFor, initials } from '../lib/format';

/** Shared modal shell: same bordered card, close button and Esc handling everywhere. */
export const ModalShell: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  iconBg?: string;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, icon, iconBg = 'bg-slate-100', wide = false, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white border-2 border-slate-900 rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full ${
          wide ? 'max-w-2xl' : 'max-w-md'
        } p-6 sm:p-8 sm:shadow-[8px_8px_0px_0px_#0f172a] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in sm:slide-in-from-bottom-0 duration-150 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]`}
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl ${iconBg} border-2 border-slate-900 flex items-center justify-center text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] shrink-0`}
            >
              <span className="material-symbols-outlined text-[20px] font-bold">{icon}</span>
            </div>
            <h3 className="font-display text-xl font-black text-slate-900 truncate">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 shrink-0 rounded-xl border-2 border-slate-900 flex items-center justify-center text-slate-900 hover:bg-slate-100 cursor-pointer shadow-[2px_2px_0px_0px_#0f172a]"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Label: React.FC<{ children: React.ReactNode; hint?: React.ReactNode }> = ({ children, hint }) => (
  <div className="flex justify-between items-center mb-1">
    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{children}</label>
    {hint && <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">{hint}</span>}
  </div>
);

export const inputClass =
  'w-full bg-slate-50 border-2 border-slate-900 rounded-2xl px-3.5 py-3 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a]';

export const bigInputClass =
  'w-full bg-slate-50 border-2 border-slate-900 rounded-2xl px-4 py-3 text-2xl font-black text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a]';

export const primaryButtonClass =
  'py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[3px_3px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer';

export const ghostButtonClass =
  'py-3 border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors';

export const FormActions: React.FC<{ onCancel: () => void; submitLabel: string }> = ({ onCancel, submitLabel }) => (
  <div className="pt-3 flex gap-3">
    <button type="button" onClick={onCancel} className={`flex-1 ${ghostButtonClass}`}>
      Cancel
    </button>
    <button type="submit" className={`flex-1 ${primaryButtonClass}`}>
      {submitLabel}
    </button>
  </div>
);

/** Logo tile that degrades to a coloured initial block — no network needed. */
export const BrandTile: React.FC<{
  name: string;
  imageUrl?: string;
  size?: string;
  rounded?: string;
}> = ({ name, imageUrl, size = 'w-12 h-12', rounded = 'rounded-2xl' }) => (
  <div
    className={`${size} ${rounded} border-2 border-slate-900 overflow-hidden shrink-0 shadow-[2px_2px_0px_0px_#0f172a] flex items-center justify-center`}
    style={{ backgroundColor: imageUrl ? undefined : accentFor(name) }}
  >
    {imageUrl ? (
      <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
    ) : (
      <span className="font-display font-black text-slate-900 text-sm tracking-tight">{initials(name)}</span>
    )}
  </div>
);

export const EmptyState: React.FC<{
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, body, actionLabel, onAction }) => (
  <div className="bg-white border-2 border-slate-900 rounded-[2rem] p-10 text-center shadow-[6px_6px_0px_0px_#0f172a]">
    <span className="material-symbols-outlined text-[48px] text-slate-300 mb-2 block">{icon}</span>
    <p className="font-display font-black text-lg text-slate-900">{title}</p>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
      {body}
    </p>
    {actionLabel && onAction && (
      <button onClick={onAction} className={`mt-5 px-6 ${primaryButtonClass}`}>
        {actionLabel}
      </button>
    )}
  </div>
);

export const SectionHeading: React.FC<{ eyebrow: string; title: string; sub?: string }> = ({
  eyebrow,
  title,
  sub,
}) => (
  <div>
    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{eyebrow}</p>
    <h2 className="font-display text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h2>
    {sub && <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1 block">{sub}</span>}
  </div>
);

export const Pill: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}> = ({ active, onClick, children, size = 'md' }) => (
  <button
    onClick={onClick}
    className={`${
      size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs'
    } rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer ${
      active
        ? 'bg-slate-900 text-white border border-slate-900 shadow-[2px_2px_0px_0px_#4f46e5]'
        : 'bg-slate-100 text-slate-700 border border-slate-300 hover:border-slate-900'
    }`}
  >
    {children}
  </button>
);
