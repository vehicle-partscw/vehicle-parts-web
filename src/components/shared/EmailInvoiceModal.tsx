import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import './EmailInvoiceModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  alreadySent: boolean;
  onSent?: () => void;
}

type Step = 'confirm' | 'sending' | 'success';

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const EmailInvoiceModal = ({ open, onClose, invoiceId, invoiceNumber, customerName, customerEmail, alreadySent, onSent }: Props) => {
  const [step, setStep] = useState<Step>('confirm');
  const lottieRef = useRef<HTMLDivElement>(null);

  // reset to confirm whenever the modal is reopened
  useEffect(() => {
    if (open) setStep('confirm');
  }, [open]);

  // play the admin lottie when we hit the success step. it loops so the user always sees it animating.
  useEffect(() => {
    if (step !== 'success' || !lottieRef.current) return;
    let anim: { destroy: () => void } | null = null;
    const load = async () => {
      const lottie = (await import('lottie-web')).default;
      if (!lottieRef.current) return;
      anim = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-message-sent-admin.json',
      });
    };
    load();
    return () => {
      anim?.destroy();
    };
  }, [step]);

  if (!open) return null;

  const send = async () => {
    setStep('sending');
    try {
      await api.post(`/sales-invoices/${invoiceId}/email`);
      onSent?.();
      setStep('success');
    } catch (err) {
      toast.error(extractError(err, 'Could not send the invoice email.'));
      setStep('confirm');
    }
  };

  return (
    <div className="email-modal-backdrop" onClick={step === 'sending' ? undefined : onClose}>
      <div className="email-modal" onClick={(e) => e.stopPropagation()}>
        {step === 'confirm' && (
          <>
            <h2 className="email-modal-title">{alreadySent ? 'Re-send invoice' : 'Send invoice'}</h2>
            <p className="email-modal-body">
              Send invoice <strong>{invoiceNumber}</strong> to <strong>{customerName}</strong> at{' '}
              <span className="email-modal-email">{customerEmail}</span>?
            </p>
            <p className="email-modal-hint">A PDF copy will be attached to the email.</p>
            <div className="email-modal-actions">
              <button className="email-modal-btn email-modal-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="email-modal-btn email-modal-btn-primary" onClick={send}>
                {alreadySent ? 'Re-send' : 'Send email'}
              </button>
            </div>
          </>
        )}

        {step === 'sending' && (
          <div className="email-modal-sending">
            <div className="email-modal-spinner" />
            <p>Sending invoice {invoiceNumber}…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="email-modal-success">
            <div ref={lottieRef} className="email-modal-lottie" />
            <h3>Email sent</h3>
            <p>
              Invoice <strong>{invoiceNumber}</strong> is on its way to{' '}
              <span className="email-modal-email">{customerEmail}</span>.
            </p>
            <div className="email-modal-actions email-modal-actions-center">
              <button className="email-modal-btn email-modal-btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailInvoiceModal;
