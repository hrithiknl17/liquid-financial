import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { cloudConfigured, supabase } from './cloud';
import { KEYS, load, save } from './storage';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'local-only';

export interface SessionState {
  status: SessionStatus;
  session: Session | null;
  /** True while the app should read and write this browser only. */
  local: boolean;
}

/**
 * Resolves how this browser is running: signed into an account, signed out, or
 * deliberately local-only. "Local-only" is a real choice, not a fallback —
 * someone who never wants an account keeps the original offline app.
 */
export function useSession(): SessionState & { stayLocal: () => void; leaveLocal: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [local, setLocal] = useState<boolean>(() => load<boolean>(KEYS.localOnly, false));

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const stayLocal = () => {
    save(KEYS.localOnly, true);
    setLocal(true);
  };

  const leaveLocal = () => {
    save(KEYS.localOnly, false);
    setLocal(false);
  };

  const status: SessionStatus = !cloudConfigured
    ? 'local-only'
    : local
      ? 'local-only'
      : !ready
        ? 'loading'
        : session
          ? 'signed-in'
          : 'signed-out';

  return { status, session, local, stayLocal, leaveLocal };
}
