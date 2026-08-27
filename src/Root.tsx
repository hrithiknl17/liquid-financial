import { Fragment } from 'react';
import App from './App';
import { SignInScreen } from './components/SignInScreen';
import { KEYS, load } from './lib/storage';
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
    return <SignInScreen onStayLocal={stayLocal} hasLocalData={hasLocalData} />;
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
