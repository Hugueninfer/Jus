/**
 * Narrows a value that may be missing (a query that found nothing, an indexed access) to the value itself, failing the
 * test with a clear message instead of a type assertion when it is not there.
 */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}
