import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import './GlobalSearchModal.css';

type Part = {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockOnHand: number;
};

type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
};

type Vehicle = {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  customerName?: string | null;
};

type Vendor = {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Staff = {
  userId: string;
  fullName: string;
  email?: string | null;
  role?: string | null;
};

type HitKind = 'part' | 'customer' | 'vehicle' | 'vendor' | 'staff';

type Hit = {
  kind: HitKind;
  id: string;
  primary: string;
  secondary: string;
  tertiary?: string;
  navigateTo: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const GlobalSearchModal = ({ open, onClose }: Props) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isStaff = user?.role === 'Staff' || user?.role === 'Admin';
  const isAdmin = user?.role === 'Admin';

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const idleLottieRef = useRef<HTMLDivElement | null>(null);
  const emptyLottieRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setDebounced('');
      setParts([]);
      setCustomers([]);
      setVehicles([]);
      setVendors([]);
      setStaff([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!debounced) {
      setParts([]); setCustomers([]); setVehicles([]); setVendors([]); setStaff([]); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const needle = debounced.toLowerCase();

    const partsReq = api.get('/parts', { params: { search: debounced, page: 1, pageSize: 6 } })
      .then((r) => (r.data?.items ?? []) as Part[])
      .catch(() => [] as Part[]);

    const customersReq = isStaff
      ? api.get('/customers')
          .then((r) => {
            const all = (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])) as Customer[];
            return all
              .filter((c) =>
                (c.fullName ?? '').toLowerCase().includes(needle) ||
                (c.phone ?? '').toLowerCase().includes(needle) ||
                (c.email ?? '').toLowerCase().includes(needle))
              .slice(0, 6);
          })
          .catch(() => [] as Customer[])
      : Promise.resolve([] as Customer[]);

    const vehiclesReq = isStaff
      ? api.get('/vehicles', { params: { search: debounced, page: 1, pageSize: 6 } })
          .then((r) => (r.data?.items ?? []) as Vehicle[])
          .catch(() => [] as Vehicle[])
      : Promise.resolve([] as Vehicle[]);

    const vendorsReq = isStaff
      ? api.get('/vendors', { params: { search: debounced, page: 1, pageSize: 6 } })
          .then((r) => (r.data?.items ?? []) as Vendor[])
          .catch(() => [] as Vendor[])
      : Promise.resolve([] as Vendor[]);

    const staffReq = isAdmin
      ? api.get('/staff')
          .then((r) => {
            const all = (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])) as Staff[];
            return all
              .filter((s) =>
                (s.fullName ?? '').toLowerCase().includes(needle) ||
                (s.email ?? '').toLowerCase().includes(needle) ||
                (s.role ?? '').toLowerCase().includes(needle))
              .slice(0, 6);
          })
          .catch(() => [] as Staff[])
      : Promise.resolve([] as Staff[]);

    Promise.all([partsReq, customersReq, vehiclesReq, vendorsReq, staffReq])
      .then(([p, c, v, vd, st]) => {
        if (cancelled) return;
        setParts(p); setCustomers(c); setVehicles(v); setVendors(vd); setStaff(st);
        setActiveIndex(0);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [debounced, open, isStaff, isAdmin]);

  const flatHits = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    parts.forEach((p) => out.push({
      kind: 'part',
      id: p.id,
      primary: p.name,
      secondary: p.sku,
      tertiary: `Rs. ${Number(p.unitPrice ?? 0).toFixed(0)} • ${p.stockOnHand} in stock`,
      navigateTo: `/inventory?search=${encodeURIComponent(p.sku || p.name)}`,
    }));
    customers.forEach((c) => out.push({
      kind: 'customer',
      id: c.id,
      primary: c.fullName,
      secondary: c.phone ?? c.email ?? '—',
      navigateTo: `/customers?search=${encodeURIComponent(c.fullName)}`,
    }));
    vehicles.forEach((v) => out.push({
      kind: 'vehicle',
      id: v.id,
      primary: v.registrationNumber,
      secondary: `${v.make} ${v.model}`,
      tertiary: v.customerName ?? undefined,
      navigateTo: `/customers?search=${encodeURIComponent(v.customerName ?? v.registrationNumber)}`,
    }));
    vendors.forEach((vd) => out.push({
      kind: 'vendor',
      id: vd.id,
      primary: vd.name,
      secondary: vd.contactPerson ?? vd.phone ?? vd.email ?? '—',
      tertiary: vd.phone ?? undefined,
      navigateTo: `/vendors`,
    }));
    staff.forEach((s) => out.push({
      kind: 'staff',
      id: s.userId,
      primary: s.fullName,
      secondary: s.email ?? '—',
      tertiary: s.role ?? undefined,
      navigateTo: `/staff`,
    }));
    return out;
  }, [parts, customers, vehicles, vendors, staff]);

  const totalHits = flatHits.length;
  const isIdle = open && !debounced;
  const isEmpty = open && !!debounced && !loading && totalHits === 0;

  useEffect(() => {
    if (!isIdle || !idleLottieRef.current) return;
    let anim: { destroy: () => void } | null = null;
    (async () => {
      const lottie = (await import('lottie-web')).default;
      if (!idleLottieRef.current) return;
      anim = lottie.loadAnimation({
        container: idleLottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-search-modal.json',
      });
    })();
    return () => { if (anim) anim.destroy(); };
  }, [isIdle]);

  useEffect(() => {
    if (!isEmpty || !emptyLottieRef.current) return;
    let anim: { destroy: () => void } | null = null;
    (async () => {
      const lottie = (await import('lottie-web')).default;
      if (!emptyLottieRef.current) return;
      anim = lottie.loadAnimation({
        container: emptyLottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-not-found.json',
      });
    })();
    return () => { if (anim) anim.destroy(); };
  }, [isEmpty]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (totalHits === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % totalHits);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + totalHits) % totalHits);
      } else if (e.key === 'Enter') {
        const hit = flatHits[activeIndex];
        if (hit) {
          navigate(hit.navigateTo);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, totalHits, flatHits, activeIndex, navigate, onClose]);

  if (!open) return null;

  const goTo = (hit: Hit) => {
    navigate(hit.navigateTo);
    onClose();
  };

  const groups: { label: string; kind: HitKind }[] = [
    { label: 'Parts', kind: 'part' },
    { label: 'Customers', kind: 'customer' },
    { label: 'Vehicles', kind: 'vehicle' },
    { label: 'Vendors', kind: 'vendor' },
    { label: 'Staff', kind: 'staff' },
  ];

  const renderGroup = (label: string, hits: Hit[]) => {
    if (hits.length === 0) return null;
    return (
      <div className="gs-group" key={label}>
        <div className="gs-group-label">{label}</div>
        <ul className="gs-list">
          {hits.map((h) => {
            const flatIdx = flatHits.findIndex((x) => x.kind === h.kind && x.id === h.id);
            const active = flatIdx === activeIndex;
            return (
              <li
                key={`${h.kind}-${h.id}`}
                className={active ? 'gs-item active' : 'gs-item'}
                onMouseEnter={() => setActiveIndex(flatIdx)}
                onClick={() => goTo(h)}
              >
                <span className={`gs-pill gs-pill-${h.kind}`}>{h.kind}</span>
                <div className="gs-item-body">
                  <div className="gs-primary">{h.primary}</div>
                  <div className="gs-secondary">
                    <span className="gs-mono">{h.secondary}</span>
                    {h.tertiary && <span className="gs-tertiary"> · {h.tertiary}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div className="gs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gs-input-wrap">
          <svg className="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            className="gs-input"
            type="text"
            placeholder={isStaff ? 'Search parts, customers, vehicles, vendors…' : 'Search parts…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="gs-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
          )}
        </div>

        <div className="gs-body">
          {isIdle && (
            <div className="gs-state">
              <div ref={idleLottieRef} className="gs-lottie" />
              <div className="gs-state-title">Search across everything</div>
              <div className="gs-state-sub">
                {isStaff
                  ? 'Find parts by SKU, customers by name or phone, vehicles by plate, or vendors by name.'
                  : 'Find parts by name or SKU.'}
              </div>
            </div>
          )}

          {loading && debounced && (
            <div className="gs-loading">Searching…</div>
          )}

          {isEmpty && (
            <div className="gs-state">
              <div ref={emptyLottieRef} className="gs-lottie" />
              <div className="gs-state-title">Nothing found</div>
              <div className="gs-state-sub">
                Couldn't find anything matching <span className="gs-quote">"{debounced}"</span>. Try a different keyword.
              </div>
            </div>
          )}

          {!loading && totalHits > 0 && (
            <>
              {groups.map((g) => renderGroup(g.label, flatHits.filter((h) => h.kind === g.kind)))}
            </>
          )}
        </div>

        {totalHits > 0 && (
          <div className="gs-footer">
            <span>{totalHits} result{totalHits === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearchModal;
