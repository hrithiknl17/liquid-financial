import React, { useEffect, useState } from 'react';
import { googleSignInAvailable, signInWithGoogle } from '../lib/cloud';

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
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);

  useEffect(() => {
    void googleSignInAvailable().then(setGoogleReady);
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
          Your money, on every device.
        </h2>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-3 leading-relaxed">
          Sign in and your ledger, rent and holdings follow you from laptop to phone. Nobody else can
          see them — not other accounts, not the people who pay you rent.
        </p>

        <button
          onClick={() => void start()}
          disabled={busy || googleReady === false}
          className="mt-8 w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-900 shadow-[4px_4px_0px_0px_#4f46e5] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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

        {googleReady === false && (
          <p className="mt-4 text-xs font-bold text-amber-800 bg-amber-50 border-2 border-slate-900 rounded-2xl px-4 py-3 leading-relaxed">
            Google sign-in is not switched on for this project yet. Enable it in Supabase under
            Authentication → Providers → Google. Until then, use this device only.
          </p>
        )}

        {error && (
          <p className="mt-4 text-xs font-bold text-rose-700 bg-rose-50 border-2 border-slate-900 rounded-2xl px-4 py-3 leading-relaxed">
            {error}
          </p>
        )}

        <div className="mt-8 pt-6 border-t-2 border-slate-100 space-y-2.5">
          {!hasLocalData && (
            <button
              onClick={onTryDemo}
              className="w-full py-3 bg-[#ede9fe] border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:bg-[#ddd6fe] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              Try it with sample data
            </button>
          )}

          <button
            onClick={onStayLocal}
            className="w-full py-3 border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            Use this device only
          </button>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3 leading-relaxed text-center">
            {hasLocalData
              ? 'Keeps the data already in this browser. Nothing is uploaded. You can sign in later and bring it with you.'
              : 'No account, no sync. Everything stays in this browser, exactly as before.'}
          </p>
        </div>
      </div>
    </main>
  );
};
