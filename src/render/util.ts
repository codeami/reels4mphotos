// Indexing under noUncheckedIndexedAccess: an out-of-range read is a bug worth a loud failure,
// not a silent `undefined` and not a non-null assertion.
export function at<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`index ${index} is outside 0..${items.length - 1}`);
  return item;
}
