/** Narrow away `undefined`/`null` from an indexed read, failing loudly if the invariant is wrong. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to exist.`);
  return value;
}
