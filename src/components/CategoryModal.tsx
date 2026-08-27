import React, { useEffect, useMemo, useState } from 'react';
import { CustomCategory, Transaction } from '../types';
import {
  CATEGORY_ICON_CHOICES,
  allCategories,
  categoryExists,
  usageCount,
} from '../lib/categories';
import { FormActions, Label, ModalShell, inputClass, primaryButtonClass } from './ui';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  custom: CustomCategory[];
  transactions: Transaction[];
  onAdd: (data: Omit<CustomCategory, 'id'>) => void;
  onUpdate: (category: CustomCategory) => void;
  onDelete: (id: string) => void;
}

type Draft = { name: string; kind: 'expense' | 'income'; iconName: string };

const EMPTY: Draft = { name: '', kind: 'expense', iconName: 'shopping_cart' };

/**
 * Manage the categories transactions can be filed under.
 *
 * Built-ins are shown but not editable as entries — adding a custom category
 * with the same name overrides its icon instead, which keeps the list free of
 * near-duplicates.
 */
export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  custom,
  transactions,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(EMPTY);
    setEditingId(null);
    setError(null);
    setConfirmDelete(null);
  }, [isOpen]);

  const options = useMemo(() => allCategories(custom), [custom]);
  const shown = useMemo(() => options.filter((option) => option.kind === draft.kind), [options, draft.kind]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;

    if (categoryExists(name, custom, editingId ?? undefined)) {
      setError(`"${name}" already exists.`);
      return;
    }

    if (editingId) onUpdate({ id: editingId, name, kind: draft.kind, iconName: draft.iconName });
    else onAdd({ name, kind: draft.kind, iconName: draft.iconName });

    setDraft({ ...EMPTY, kind: draft.kind });
    setEditingId(null);
    setError(null);
  };

  const startEdit = (category: CustomCategory) => {
    setDraft({ name: category.name, kind: category.kind, iconName: category.iconName });
    setEditingId(category.id);
    setError(null);
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Categories" icon="sell" iconBg="bg-[#fef3c7]" wide>
      <div className="flex gap-2 p-1.5 bg-slate-100 border-2 border-slate-900 rounded-2xl mb-5">
        {(['expense', 'income'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, kind }))}
            className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
              draft.kind === kind
                ? 'bg-white text-slate-900 border border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]'
                : 'text-slate-500'
            }`}
          >
            {kind === 'expense' ? 'Spending' : 'Income'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {shown.map((option) => {
          const entry = custom.find((c) => c.name.toLowerCase() === option.name.toLowerCase());
          const uses = usageCount(option.name, transactions);

          return (
            <div
              key={option.name}
              className={`flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-2xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] ${
                option.custom ? 'bg-[#ede9fe]' : 'bg-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] text-slate-700">{option.iconName}</span>
              <span className="text-xs font-black text-slate-900">{option.name}</span>
              {uses > 0 && (
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{uses}</span>
              )}

              {entry && (
                <span className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => startEdit(entry)}
                    aria-label={`Edit ${entry.name}`}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(entry.id)}
                    aria-label={`Delete ${entry.name}`}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-rose-600 hover:bg-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <div className="mb-5 p-4 bg-rose-50 border-2 border-slate-900 rounded-2xl shadow-[2px_2px_0px_0px_#0f172a]">
          <p className="text-xs font-bold text-rose-900 leading-relaxed">
            Delete this category? Transactions already filed under it keep the name — they are not moved or
            deleted, the category just stops being offered.
          </p>
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => setConfirmDelete(null)}
              className="flex-1 py-2.5 border-2 border-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-wider text-slate-600 hover:bg-white cursor-pointer"
            >
              Keep it
            </button>
            <button
              onClick={() => {
                onDelete(confirmDelete);
                if (editingId === confirmDelete) {
                  setEditingId(null);
                  setDraft({ ...EMPTY, kind: draft.kind });
                }
                setConfirmDelete(null);
              }}
              className="flex-1 py-2.5 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider border-2 border-slate-900 cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 pt-5 border-t-2 border-slate-100">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {editingId ? 'Edit category' : `New ${draft.kind === 'expense' ? 'spending' : 'income'} category`}
        </p>

        <div>
          <Label>Name</Label>
          <input
            type="text"
            required
            value={draft.name}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, name: e.target.value }));
              setError(null);
            }}
            placeholder={draft.kind === 'expense' ? 'e.g. Tuition, Temple, Fuel' : 'e.g. Rent, Consulting'}
            className={inputClass}
          />
        </div>

        <div>
          <Label hint={draft.iconName.replace(/_/g, ' ')}>Icon</Label>
          <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-40 overflow-y-auto p-1">
            {CATEGORY_ICON_CHOICES.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, iconName: icon }))}
                aria-label={icon.replace(/_/g, ' ')}
                aria-pressed={draft.iconName === icon}
                className={`aspect-square rounded-xl border-2 border-slate-900 flex items-center justify-center cursor-pointer transition-all ${
                  draft.iconName === icon
                    ? 'bg-slate-900 text-white shadow-[2px_2px_0px_0px_#4f46e5]'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-[11px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border-2 border-slate-900 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}

        {editingId ? (
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY, kind: draft.kind });
              }}
              className="flex-1 py-3 border-2 border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel edit
            </button>
            <button type="submit" className={`flex-1 ${primaryButtonClass}`}>
              Save category
            </button>
          </div>
        ) : (
          <FormActions onCancel={onClose} submitLabel="Add category" />
        )}
      </form>
    </ModalShell>
  );
};
