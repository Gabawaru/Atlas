/**
 * Rate limit simple en mémoire par source de feed.
 * Pas de scan agressif — plafonne les appels sortants live.
 */
export class FeedRateLimiter {
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** true si l'appel est autorisé */
  tryAcquire(source: string): boolean {
    const t = this.now();
    const cutoff = t - 60_000;
    const prev = (this.windows.get(source) ?? []).filter((x) => x > cutoff);
    if (prev.length >= this.maxPerMinute) {
      this.windows.set(source, prev);
      return false;
    }
    prev.push(t);
    this.windows.set(source, prev);
    return true;
  }

  remaining(source: string): number {
    const t = this.now();
    const cutoff = t - 60_000;
    const prev = (this.windows.get(source) ?? []).filter((x) => x > cutoff);
    return Math.max(0, this.maxPerMinute - prev.length);
  }
}

/** Limites MVP par source (live) */
export const DEFAULT_FEED_RATE_LIMITS: Record<string, number> = {
  osv: 30,
  nvd: 5,
  kev: 10,
};
