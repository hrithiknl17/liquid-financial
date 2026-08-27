import React, { useState } from 'react';

interface PendingApprovalProps {
  email: string | null;
  /** Re-checks whether approval has come through since the page loaded. */
  onRecheck: () => Promise<void>;
  onSignOut: () => void;
  onTryDemo: () => void;
}

/**
 * What an account sees between signing in and being let in.
 *
 * Deliberately not an error: nothing has gone wrong, the request is simply
 * waiting. The demo is offered right here so the visit is not wasted.
 */
export const PendingApproval: React.FC<PendingApprovalProps> = ({
  email,
  onRecheck,
  onSignOut,
  onTryDemo,
}) => {
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const recheck = async () => {
    setChecking(true);
    await onRecheck();
    setCheckedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    setChecking(false);
  };

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border-2 border-slate-900 rounded-[2.5rem] p-8 sm:p-10 shadow-[8px_8px_0px_0px_#0f172a]">
        <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] border-2 border-slate-900 flex items-center justify-center shadow-[2px_2px_0px_0px_#0f172a] mb-6">
          <span className="material-symbols-outlined text-[24px] text-slate-900">hourglass_top</span>
        </div>

        <h1 className="font-display text-3xl font-black tracking-tight text-slate-900 leading-tight">
          You're on the list.
        </h1>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-3 leading-relaxed">
          Accounts are approved by hand while this is small. Your request is in — nothing else to do.
        </p>

        {email && (
          <p className="mt-5 px-4 py-3 bg-slate-50 border-2 border-slate-900 rounded-2xl text-xs font-black text-slate-900 truncate shadow-[2px_2px_0px_0px_#0f172a]">
            {email}
          </p>
        )}

        <button
          onClick={() => void recheck()}
          disabled={checking}
          className="mt-5 w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[4px_4px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {checking ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              Checking
            </>
          ) : (
            'Check again'
          )}
        </button>

        {checkedAt && (
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-2 text-center">
            Last checked {checkedAt} — still waiting
          </p>
        )}

        <div className="mt-8 pt-6 border-t-2 border-slate-100 space-y-2.5">
          <button
            onClick={onTryDemo}
            className="w-full py-3 bg-[#ede9fe] border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-[#ddd6fe] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            Look around with sample data
          </button>
          <button
            onClick={onSignOut}
            className="w-full py-3 border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
};
