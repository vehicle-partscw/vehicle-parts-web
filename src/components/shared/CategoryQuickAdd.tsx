import { useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import './CategoryQuickAdd.css';

interface Props {
  /** Called after the new category is created. Receives the new id + name so the parent can refresh and select. */
  onCreated: (newId: string, newName: string) => void | Promise<void>;
  /** Optional label prefix for the trigger ("category" by default). */
  triggerLabel?: string;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const CategoryQuickAdd = ({ onCreated, triggerLabel = '+ New' }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setName('');
    setDescription('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/part-categories', {
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success('Category added.');
      await onCreated(res.data.id, name.trim());
      close();
    } catch (err) {
      toast.error(extractError(err, 'Could not add category.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="cqa-trigger" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && (
        <div className="cqa-backdrop" onClick={close}>
          <div className="cqa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cqa-header">
              <h4>New category</h4>
              <button type="button" className="cqa-close" onClick={close}>×</button>
            </div>
            <form onSubmit={onSubmit} className="cqa-form">
              <label className="cqa-field">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Suspension"
                  autoFocus
                />
              </label>
              <label className="cqa-field">
                <span>Description (optional)</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What goes in this category"
                />
              </label>
              <div className="cqa-actions">
                <button type="button" className="cqa-btn-ghost" onClick={close}>Cancel</button>
                <button type="submit" className="cqa-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Add category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default CategoryQuickAdd;
