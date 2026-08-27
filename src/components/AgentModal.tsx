import React, { useEffect, useRef, useState } from 'react';
import { AgentState, ChatTurn, ProposedAction, runAgent } from '../lib/agent';
import { AiUnavailableError } from '../lib/ai';
import { ModalShell, ghostButtonClass, primaryButtonClass } from './ui';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AgentState;
  history: ChatTurn[];
  onHistoryChange: (history: ChatTurn[]) => void;
  /** Applies one confirmed proposal and returns what to show as the receipt. */
  onApply: (action: ProposedAction) => string;
  onOpenSettings: () => void;
}

/** A staged batch of writes, shown as one confirmation card under the reply. */
interface Pending {
  actions: ProposedAction[];
  /** Ids already applied or skipped, so a card never fires twice. */
  done: Record<string, 'applied' | 'skipped'>;
}

const EXAMPLES = [
  'Add 50 paise as my grocery bill',
  'Remove Airtel Fiber and add Jio Fiber at 999 a month',
  'Sanjay paid 8000 rent today',
  'I lent 5000 to Ravi, expected back in 30 days',
];

export const AgentModal: React.FC<AgentModalProps> = ({
  isOpen,
  onClose,
  state,
  history,
  onHistoryChange,
  onApply,
  onOpenSettings,
}) => {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  /** Keyed by the index of the model turn the proposals belong to. */
  const [pending, setPending] = useState<Record<number, Pending>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInput('');
    setError(null);
    setNeedsKey(false);
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, pending, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;

    const next: ChatTurn[] = [...history, { role: 'user', text: message }];
    onHistoryChange(next);
    setInput('');
    setBusy(true);
    setError(null);
    setNeedsKey(false);

    try {
      const result = await runAgent(next, state);
      const reply =
        result.reply ??
        (result.actions.length > 0
          ? `${result.actions.length} change${result.actions.length === 1 ? '' : 's'} ready — confirm below.`
          : 'Nothing to change.');

      const withReply: ChatTurn[] = [...next, { role: 'model', text: reply }];
      onHistoryChange(withReply);

      if (result.actions.length > 0) {
        setPending((prev) => ({
          ...prev,
          [withReply.length - 1]: { actions: result.actions, done: {} },
        }));
      }
    } catch (err) {
      if (err instanceof AiUnavailableError) setNeedsKey(true);
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
      onHistoryChange(next);
    } finally {
      setBusy(false);
    }
  };

  const decide = (turnIndex: number, action: ProposedAction, accept: boolean) => {
    if (accept) onApply(action);
    setPending((prev) => {
      const entry = prev[turnIndex];
      if (!entry) return prev;
      return {
        ...prev,
        [turnIndex]: { ...entry, done: { ...entry.done, [action.id]: accept ? 'applied' : 'skipped' } },
      };
    });
  };

  const applyAll = (turnIndex: number) => {
    const entry = pending[turnIndex];
    if (!entry) return;
    const done = { ...entry.done };
    for (const action of entry.actions) {
      if (done[action.id]) continue;
      onApply(action);
      done[action.id] = 'applied';
    }
    setPending((prev) => ({ ...prev, [turnIndex]: { ...entry, done } }));
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Ask Liquid" icon="auto_awesome" iconBg="bg-[#ede9fe]" wide>
      <div className="flex flex-col h-[70vh] sm:h-[62vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 space-y-4">
          {history.length === 0 && (
            <div className="text-center py-6">
              <p className="font-display font-black text-lg text-slate-900">Tell it what changed.</p>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1 mb-5">
                Plain words. It proposes, you confirm.
              </p>
              <div className="flex flex-col gap-2 max-w-md mx-auto">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => void send(example)}
                    className="text-left px-4 py-3 bg-slate-50 border-2 border-slate-900 rounded-2xl text-xs font-bold text-slate-700 hover:bg-white shadow-[2px_2px_0px_0px_#0f172a] cursor-pointer"
                  >
                    “{example}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((turn, index) => (
            <div key={index} className="space-y-3">
              <div className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl border-2 border-slate-900 text-xs font-bold leading-relaxed whitespace-pre-wrap ${
                    turn.role === 'user'
                      ? 'bg-slate-900 text-white shadow-[3px_3px_0px_0px_#4f46e5]'
                      : 'bg-white text-slate-800 shadow-[3px_3px_0px_0px_#0f172a]'
                  }`}
                >
                  {turn.text}
                </div>
              </div>

              {pending[index] && (
                <div className="space-y-2">
                  {pending[index].actions.map((action) => {
                    const status = pending[index].done[action.id];
                    return (
                      <div
                        key={action.id}
                        className={`border-2 border-slate-900 rounded-2xl px-4 py-3 shadow-[3px_3px_0px_0px_#0f172a] ${
                          status === 'applied'
                            ? 'bg-[#f0fdf4]'
                            : status === 'skipped'
                              ? 'bg-slate-100 opacity-60'
                              : action.destructive
                                ? 'bg-rose-50'
                                : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              {action.destructive ? 'Removes data' : 'Proposed change'}
                            </p>
                            <p className="text-xs font-bold text-slate-900 mt-0.5 break-words">{action.summary}</p>
                          </div>

                          {status ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0 pt-1">
                              {status}
                            </span>
                          ) : (
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => decide(index, action, false)}
                                aria-label="Skip this change"
                                className="w-9 h-9 rounded-xl border-2 border-slate-900 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[18px] font-bold">close</span>
                              </button>
                              <button
                                onClick={() => decide(index, action, true)}
                                aria-label="Apply this change"
                                className="w-9 h-9 rounded-xl border-2 border-slate-900 bg-slate-900 text-white flex items-center justify-center shadow-[2px_2px_0px_0px_#4f46e5] cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {pending[index].actions.length > 1 &&
                    pending[index].actions.some((action) => !pending[index].done[action.id]) && (
                      <button
                        onClick={() => applyAll(index)}
                        className={`w-full px-4 ${primaryButtonClass}`}
                      >
                        Apply all
                      </button>
                    )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl border-2 border-slate-900 bg-white text-xs font-black uppercase tracking-wider text-slate-500 shadow-[3px_3px_0px_0px_#0f172a] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Thinking
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border-2 border-slate-900 rounded-2xl px-4 py-3 shadow-[3px_3px_0px_0px_#0f172a]">
              <p className="text-xs font-bold text-rose-800 leading-relaxed">{error}</p>
              {needsKey && (
                <button onClick={onOpenSettings} className={`mt-3 w-full px-4 ${ghostButtonClass}`}>
                  Add a Gemini key
                </button>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="pt-4 flex gap-2 items-end"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Add 250 for groceries at More…"
            className="flex-1 resize-none bg-slate-50 border-2 border-slate-900 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#0f172a] max-h-32"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-12 h-12 shrink-0 rounded-2xl bg-slate-900 text-white border-2 border-slate-900 flex items-center justify-center shadow-[3px_3px_0px_0px_#4f46e5] disabled:opacity-40 disabled:shadow-none cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">arrow_upward</span>
          </button>
        </form>

        {history.length > 0 && (
          <button
            onClick={() => {
              onHistoryChange([]);
              setPending({});
              setError(null);
            }}
            className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 cursor-pointer self-center"
          >
            Clear chat
          </button>
        )}
      </div>
    </ModalShell>
  );
};
