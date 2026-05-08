import { useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import './CategoryQuickAdd.css';

interface Props {
  // called after the new service type is created so the parent can refresh + select it
  onCreated: (newId: string, newName: string) => void | Promise<void>;
  triggerLabel?: string;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

// Lets the customer / staff propose a new service type from inside the booking modal
// without leaving the form. Falls back to the standard /service-types POST.
const ServiceTypeQuickAdd = ({ onCreated, triggerLabel = '+ New' }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('60');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setName('');
    setDescription('');
    setEstimatedMinutes('60');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Service name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/service-types', {
        name: name.trim(),
        description: description.trim() || null,
        estimatedDurationMinutes: Number(estimatedMinutes) || 60,
        basePrice: 0,
      });
      toast.success('Service type added.');
      await onCreated(res.data.id, name.trim());
      close();
    } catch (err) {
      toast.error(extractError(err, 'Could not add service type.'));
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
              <h4>New service type</h4>
              <button type="button" className="cqa-close" onClick={close}>×</button>
            </div>
            <form onSubmit={onSubmit} className="cqa-form">
              <label className="cqa-field">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wheel alignment"
                  autoFocus
                />
              </label>
              <label className="cqa-field">
                <span>Description (optional)</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this service includes"
                />
              </label>
              <label className="cqa-field">
                <span>Estimated time (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                />
              </label>
              <div className="cqa-actions">
                <button type="button" className="cqa-btn-ghost" onClick={close}>Cancel</button>
                <button type="submit" className="cqa-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Add service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ServiceTypeQuickAdd;
