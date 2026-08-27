import { Fragment } from 'react';
import App from './App';
import { SignInScreen } from './components/SignInScreen';
import { KEYS, load, save } from './lib/storage';
import { buildDemoData } from './data/initialData';
import { useSession } from './lib/useSession';

/**
 * Decides whether this browser runs against an account or stays local, and
 * keeps that decision out of App — which owns enough already.
 */
export default function Root() {
  const { status, session, stayLocal } = useSession();

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
    const tryDemo = () => {
      const demo = buildDemoData();
      save(KEYS.transactions, demo.transactions);
      save(KEYS.subscriptions, demo.subscriptions);
      save(KEYS.investments, demo.investments);
      save(KEYS.settings, demo.settings);
      stayLocal();
    };

    return <SignInScreen onStayLocal={stayLocal} onTryDemo={tryDemo} hasLocalData={hasLocalData} />;
  }

  // "Use this device only" means exactly that: even with a valid session in
  // this browser, App is handed nothing, so nothing syncs.
  const activeSession = status === 'signed-in' ? session : null;

  // Keying the subtree on the account id remounts App on a switch, so no data
  // from the previous account can survive in component state.
  return (
    <Fragment key={activeSession?.user.id ?? 'local'}>
      <App session={activeSession} />
    </Fragment>
  );
}
