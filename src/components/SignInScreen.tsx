import React, { useEffect, useState } from 'react';
import { googleSignInAvailable, initialAuthError, signInWithGoogle } from '../lib/cloud';

interface SignInScreenProps {
  /** Keeps this browser on the original local-only app, no account at all. */
  onStayLocal: () => void;
  /** Fills this browser with sample data and opens it, no account either. */
  onTryDemo: () => void;
  /** True when there is already data in this browser to bring along. */
  hasLocalData: boolean;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onStayLocal, onTryDemo, hasLocalData }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialAuthError);
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);

  useEffect(() => {
    void googleSignInAvailable().then(setGoogleReady);

    // Belt and braces: the fragment is cleared when the error is captured at
    // import time, but a reload that races the client would otherwise leave
    // the message stuck on screen forever.
    if (window.location.hash.includes('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Google.');
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border-2 border-slate-900 rounded-[2.5rem] p-8 sm:p-10 shadow-[8px_8px_0px_0px_#0f172a]">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#4f46e5]">
            L
          </div>
          <h1 className="font-display text-2xl font-black tracking-tighter text-slate-900">
            LIQUID<span className="text-indigo-600">.OS</span>
          </h1>
        </div>

        <h2 className="font-display text-3xl font-black tracking-tight text-slate-900 leading-tight">
          Photograph a bill.
          <br />
          It fills itself in.
        </h2>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-3 leading-relaxed">
          Spending, subscriptions, investments, rent you are owed and money you lent — with an assistant
          you can just talk to.
        </p>

        {/* The demo is the front door: no account, nothing uploaded, works now. */}
        <button
          onClick={onTryDemo}
          className="mt-8 w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[4px_4px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          Try it with sample data
        </button>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2.5 text-center leading-relaxed">
          A full ledger to poke at. Stays in this browser, nothing is uploaded.
        </p>

        {error && (
          <p className="mt-5 text-xs font-bold text-amber-900 bg-amber-50 border-2 border-slate-900 rounded-2xl px-4 py-3 leading-relaxed">
            {error}
          </p>
        )}

        <div className="mt-8 pt-6 border-t-2 border-slate-100 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">
            Want your own?
          </p>

          <button
            onClick={() => void start()}
            disabled={busy || googleReady === false}
            className="w-full py-3 border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 shadow-[3px_3px_0px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Opening Google
              </>
            ) : (
              'Continue with Google'
            )}
          </button>

          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center leading-relaxed">
            Accounts are approved by hand while this is small — sign in and you go on the list. Your data
            syncs across your devices and nobody else can see it.
          </p>

          {googleReady === false && (
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 border-2 border-slate-900 rounded-2xl px-4 py-3 leading-relaxed">
              Google sign-in is not switched on for this project yet.
            </p>
          )}

          <button
            onClick={onStayLocal}
            className="w-full py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-900 cursor-pointer transition-colors"
          >
            {hasLocalData ? 'Keep using this device only' : 'Start empty on this device'}
          </button>
        </div>
      </div>
    </main>
  );
};
