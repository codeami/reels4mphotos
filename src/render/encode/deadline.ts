import { RenderError, abortError } from '../errors';

// Waits for `promise`, but no longer than `ms`, and stops waiting when `signal` aborts. For calls
// that can hang without ever rejecting (AudioContext.resume() on iOS until a gesture unlocks it).
export function within<T>(
  promise: Promise<T>,
  ms: number,
  what: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      finish();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      finish();
      reject(new RenderError('encoder-failed', `${what} did not finish within ${ms} ms`));
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error: unknown) => {
        finish();
        reject(error);
      },
    );
  });
}
