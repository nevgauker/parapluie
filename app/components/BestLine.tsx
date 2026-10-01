import type { BestResult } from '../_lib/bests';

/** Under an end screen's score: a new best, or the best and how far short this run fell. */
export default function BestLine({ result, score }: { result: BestResult | null; score: number }) {
  // no best yet, and this run didn't set one (it scored nothing): nothing to say
  if (!result || (!result.isNew && !result.previous)) return null;
  if (result.isNew) {
    const gain = result.previous ? score - result.previous.score : 0;
    return (
      <p role="status" style={{ fontSize: 13, fontWeight: 700, color: 'var(--umbrella)', letterSpacing: '.06em', margin: '0 0 18px' }}>
        ★ NEW BEST{gain > 0 ? ` · +${gain}` : ''}
      </p>
    );
  }
  return (
    <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.5)', margin: '0 0 18px' }}>
      Best {result.best.score} · {result.best.score - score} short
    </p>
  );
}
