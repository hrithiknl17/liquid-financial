import { Fragment, useCallback, useEffect, useState } from 'react';
import App from './App';
import { SignInScreen } from './components/SignInScreen';
import { PendingApproval } from './components/PendingApproval';
import { AccessState, fetchAccess, signOut } from './lib/cloud';
import { KEYS, clearAll, load, save } from './lib/storage';
import { buildDemoData } from './data/initialData';
import { useSession } from './lib/useSession';

/**
 * Decides whether this browser runs against an account or stays local, and
 * keeps that decision out of App — which owns enough already.
 */
export default function Root() {
  const { status, session, stayLocal, leaveLocal } = useSession();
  const [access, setAccess] = useState<AccessState | null>(null);
  const [demoSeeded, setDemoSeeded] = useState<boolean>(() => load<boolean>(KEYS.demo, false));

  /**
   * An account exists the moment someone signs in, but it may not be allowed
   * in yet. Row level security already isolates it; this decides what the
   * person actually sees.
   */
  const refreshAccess = useCallback(async () => {
    if (status !== 'signed-in') {
      setAccess(null);
      return;
    }
    setAccess(await fetchAccess());
  }, [status]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  const seedDemo = () => {
    const demo = buildDemoData();
    save(KEYS.transactions, demo.transactions);
    save(KEYS.subscriptions, demo.subscriptions);
    save(KEYS.investments, demo.investments);
    save(KEYS.settings, demo.settings);
    // Remembering that this browser is *only* looking around is what makes the
    // way back out possible: without it the sample is indistinguishable from
    // someone's real device-only ledger, and there is nothing safe to erase.
    save(KEYS.demo, true);
    setDemoSeeded(true);
    stayLocal();
  };

  // The sample belongs to nobody, so leaving it wipes this browser and returns
  // to the front door — no fake rows survive to be adopted by a real account.
  const exitDemo = () => {
    clearAll(Object.values(KEYS));
    window.location.reload();
  };

  /**
   * Leaves device-only mode with the data intact. The sign-in screen comes
   * back, so someone who chose "this device only" can still get an account
   * later and bring what they already typed with them.
   */
  const exitLocal = () => {
    leaveLocal();
    window.location.reload();
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="material-symbols-outlined text-[22px] animate-spin">progress_activity</span>
          <span className="text-xs font-black uppercase tracking-[0.2em]">Checking your session</span>
        </div>
      </div>
    );
  }

  if (status === 'signed-out') {
    const hasLocalData = load<unknown[]>(KEYS.transactions, []).length > 0;

    // A stranger should be able to look around in one click: seed the sample
    // ledger into this browser and open it, no account, nothing uploaded.
    return <SignInScreen onStayLocal={stayLocal} onTryDemo={seedDemo} hasLocalData={hasLocalData} />;
  }

  // Signed in but not let in yet: the account is real and isolated, it just
  // has nothing to show until someone approves it.
  if (status === 'signed-in') {
    if (!access) {
      return (
        <div className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500">
            <span className="material-symbols-outlined text-[22px] animate-spin">progress_activity</span>
            <span className="text-xs font-black uppercase tracking-[0.2em]">Checking your access</span>
          </div>
        </div>
      );
    }

    if (!access.approved) {
      return (
        <PendingApproval
          email={access.email}
          onRecheck={refreshAccess}
          onSignOut={() => void signOut().then(() => window.location.reload())}
          onTryDemo={seedDemo}
        />
      );
    }
  }

  // "Use this device only" means exactly that: even with a valid session in
  // this browser, App is handed nothing, so nothing syncs.
  const activeSession = status === 'signed-in' ? session : null;

  // The flag outlives local-only mode in storage, so the sample banner is only
  // true while this browser is actually still running on the sample.
  const inDemo = demoSeeded && status === 'local-only';

  // Keying the subtree on the account id remounts App on a switch, so no data
  // from the previous account can survive in component state.
  return (
    <Fragment key={activeSession?.user.id ?? 'local'}>
      <App
        session={activeSession}
        isAdmin={Boolean(access?.admin)}
        isDemo={inDemo}
        onExitDemo={exitDemo}
        onExitLocal={exitLocal}
      />
    </Fragment>
  );
}
