import { useEffect, useRef } from 'react';
import './EmailInvoiceModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceNumber: string | null;
  customerEmail: string;
}

// shown to a customer when they click the "your invoice has been emailed" notification.
// uses the message sent_02 lottie so it feels different from the admin's send confirmation.
const InvoiceEmailedModal = ({ open, onClose, invoiceNumber, customerEmail }: Props) => {
  const lottieRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let anim: { destroy: () => void } | null = null;
    let cancelled = false;
    const load = async () => {
      // wait a tick so the dom element is mounted before loading lottie
      await Promise.resolve();
      if (cancelled || !lottieRef.current) return;
      const lottie = (await import('lottie-web')).default;
      if (cancelled || !lottieRef.current) return;
      anim = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-message-sent-customer.json',
      });
    };
    load();
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="email-modal-backdrop" onClick={onClose}>
      <div className="email-modal" onClick={(e) => e.stopPropagation()}>
        <div className="email-modal-success">
          <div ref={lottieRef} className="email-modal-lottie" />
          <h3>Check your email</h3>
          <p>
            We just sent {invoiceNumber ? <>invoice <strong>{invoiceNumber}</strong></> : 'your invoice'}{' '}
            to <span className="email-modal-email">{customerEmail}</span>. The PDF is attached.
          </p>
          <div className="email-modal-actions email-modal-actions-center">
            <button className="email-modal-btn email-modal-btn-primary" onClick={onClose}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceEmailedModal;
