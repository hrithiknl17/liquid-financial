import React, { useCallback, useEffect, useState } from 'react';
import {
  ApprovedAccount,
  PendingAccount,
  approveAccount,
  fetchApproved,
  fetchPending,
  revokeAccount,
} from '../lib/cloud';
import { ModalShell, inputClass, primaryButtonClass } from './ui';

interface AccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const when = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Who is waiting, and who is already in. Admin-only — the functions behind it
 * check that server-side, so opening this modal without the right account
 * simply shows two empty lists.
 */
export const AccessModal: React.FC<AccessModalProps> = ({ isOpen, onClose }) => {
  const [pending, setPending] = useState<PendingAccount[]>([]);
  const [approved, setApproved] = useState<ApprovedAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [waiting, allowed] = await Promise.all([fetchPending(), fetchApproved()]);
    setPending(waiting);
    setApproved(allowed);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setInvite('');
    void refresh();
  }, [isOpen, refresh]);

  const act = async (email: string, approve: boolean) => {
    setBusy(email);
    setError(null);
    try {
      if (approve) await approveAccount(email);
      else await revokeAccount(email);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = invite.trim().toLowerCase();
    if (!email) return;
    await act(email, true);
    setInvite('');
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Who can get in" icon="key" iconBg="bg-[#fef3c7]" wide>
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Waiting</p>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 py-4 text-center bg-slate-50 border-2 border-slate-900 rounded-2xl">
            Nobody waiting
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((account) => (
              <div
                key={account.email}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-[#fffbeb] border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]"
              >
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{account.email}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {account.displayName ?? 'No name'} · asked {when(account.requestedAt)}
                  </p>
                </div>
                <button
                  onClick={() => void act(account.email, true)}
                  disabled={busy === account.email}
                  className={`px-4 shrink-0 ${primaryButtonClass} disabled:opacity-50`}
                >
                  {busy === account.email ? 'Working' : 'Let in'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Has access</p>
        <div className="flex flex-col gap-2">
          {approved.map((account) => (
            <div
              key={account.email}
              className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900 truncate">{account.email}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {account.isAdmin ? 'Admin' : `Added ${when(account.addedAt)}`}
                </p>
              </div>
              {!account.isAdmin && (
                <button
                  onClick={() => void act(account.email, false)}
                  disabled={busy === account.email}
                  className="px-3 py-2 shrink-0 border-2 border-rose-300 rounded-xl text-[10px] font-black uppercase tracking-wider text-rose-600 hover:border-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={(e) => void sendInvite(e)} className="pt-5 border-t-2 border-slate-100">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
          Invite ahead of time
        </p>
        <div className="flex gap-2.5">
          <input
            type="email"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="friend@gmail.com"
            className={`flex-1 ${inputClass}`}
          />
          <button type="submit" className={`px-5 ${primaryButtonClass}`}>
            Add
          </button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2 leading-relaxed">
          They are let straight in when they first sign in, without waiting.
        </p>
      </form>

      {error && (
        <p className="mt-4 text-xs font-bold text-rose-700 bg-rose-50 border-2 border-slate-900 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}
    </ModalShell>
  );
};
