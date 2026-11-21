export function retryDelayMs(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(baseMs) || baseMs < 0 || !Number.isFinite(maxMs) || maxMs < 0) {
    throw new RangeError("Invalid retry delay parameters.");
  }
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new RangeError("Random source must return a value between 0 and 1.");
  const exponential = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(exponential * (0.5 + sample * 0.5));
}
