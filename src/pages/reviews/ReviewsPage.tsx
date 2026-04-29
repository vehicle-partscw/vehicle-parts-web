import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './ReviewsPage.css';

interface Review {
  id: string;
  customerUserId: string;
  customerName: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Pick a rating').max(5),
  comment: z.string().max(1000).optional().or(z.literal('')),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const Stars = ({ rating, size = 16 }: { rating: number; size?: number }) => {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'filled' : 'empty'}>★</span>
      ))}
    </span>
  );
};

const ReviewsPage = () => {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const isCustomer = user?.role === 'Customer';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [showWrite, setShowWrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, comment: '' },
  });

  const currentRating = form.watch('rating');

  const fetchReviews = async () => {
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      const res = await api.get<PagedResult<Review>>('/reviews', { params });
      setReviews(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load reviews.'));
    }
  };

  useEffect(() => { fetchReviews(); /* eslint-disable-next-line */ }, [page, pageSize]);

  const openWrite = () => {
    form.reset({ rating: 0, comment: '' });
    setHoverRating(0);
    setShowWrite(true);
  };

  const onSubmit = async (data: ReviewFormData) => {
    if (data.rating < 1) {
      toast.error('Pick a rating before submitting.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/reviews', {
        rating: data.rating,
        comment: data.comment || null,
      });
      toast.success('Thanks for the review.');
      setShowWrite(false);
      fetchReviews();
    } catch (err) {
      toast.error(extractError(err, 'Could not submit review.'));
    } finally {
      setLoading(false);
    }
  };

  const total = pageInfo?.totalCount ?? 0;
  const avg = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length)
    : 0;
  const fiveStars = reviews.filter((r) => r.rating === 5).length;

  return (
    <div className="reviews-page">
      <div className="page-header">
        <h1 className="page-title">Reviews</h1>
        <p className="page-subtitle">
          {isCustomer ? 'Tell us how the service went.' : 'Customer feedback on the service center.'}
        </p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>{isCustomer ? 'How was your visit?' : 'Voices from the lot.'}</h2>
          <p>
            {isCustomer
              ? 'A quick rating and a sentence helps us tune turnaround times, prices, and the parts we keep on the shelf.'
              : 'Customers leave a star rating and an optional note. Use it to spot trends — slow service, repeat issues, happy regulars.'}
          </p>
        </div>
        <div className="hero-illust">
          <img
            src={`/illust-communication-${isDark ? 'dark' : 'light'}.svg`}
            alt=""
            className="hero-img"
          />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Total reviews</div>
          <div className="stat-value">{total}</div>
          <div className="stat-change">{reviews.length} on this page</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average rating</div>
          <div className="stat-value">{avg > 0 ? avg.toFixed(1) : '—'}</div>
          <div className="stat-change">
            {avg > 0 ? <Stars rating={Math.round(avg)} size={14} /> : 'Need at least one review'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Five-star reviews</div>
          <div className="stat-value">{fiveStars}</div>
          <div className="stat-change" style={{ color: fiveStars > 0 ? 'var(--success)' : 'var(--neutral-9)' }}>
            {fiveStars > 0 ? `${Math.round((fiveStars / Math.max(reviews.length, 1)) * 100)}% of reviews` : 'On this page'}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All reviews</span>
          <div className="table-actions">
            {isCustomer && <button className="btn-primary" onClick={openWrite}>+ Write a review</button>}
          </div>
        </div>

        <div className="reviews-list">
          {reviews.length === 0 ? (
            <div className="empty-state">No reviews yet. Customers can leave one from this page.</div>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="review-card">
                <div className="review-head">
                  <Stars rating={r.rating} size={18} />
                  <span className="review-date">{fmtDate(r.createdAt)}</span>
                </div>
                {r.comment ? (
                  <p className="review-comment">{r.comment}</p>
                ) : (
                  <p className="review-comment muted">No comment left.</p>
                )}
                <div className="review-foot">
                  <span className="review-author">— {r.customerName || `customer ${r.customerUserId.slice(0, 8)}`}</span>
                </div>
              </article>
            ))
          )}
        </div>

        <Pagination
          meta={pageInfo}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>

      {/* Write modal */}
      {showWrite && (
        <div className="modal-backdrop" onClick={() => setShowWrite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Write a review</h3>
              <button className="modal-close" onClick={() => setShowWrite(false)}>×</button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="form">
              <label>
                <span>Rating</span>
                <div className="rating-picker">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`rating-star ${(hoverRating || currentRating) >= n ? 'filled' : ''}`}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => form.setValue('rating', n, { shouldValidate: true })}
                      aria-label={`${n} stars`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="rating-label">
                    {currentRating > 0
                      ? ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][currentRating]
                      : 'Pick a rating'}
                  </span>
                </div>
                {form.formState.errors.rating && <em>{form.formState.errors.rating.message}</em>}
              </label>
              <label>
                <span>Comment (optional)</span>
                <textarea
                  {...form.register('comment')}
                  rows={4}
                  placeholder="What went well or what could be better?"
                />
                {form.formState.errors.comment && <em>{form.formState.errors.comment.message}</em>}
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowWrite(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Posting…' : 'Post review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewsPage;
