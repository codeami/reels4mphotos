import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from './deadline';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('within', () => {
  it('passes through a promise that settles in time', async () => {
    await expect(within(Promise.resolve(7), 1000, 'the thing')).resolves.toBe(7);
    await expect(within(Promise.reject(new Error('no')), 1000, 'the thing')).rejects.toThrow('no');
  });

  it('gives up on a promise that never settles, naming what it was waiting for', async () => {
    const waiting = within(new Promise<never>(() => {}), 1000, 'AudioContext.resume()');
    const expectation = expect(waiting).rejects.toMatchObject({
      code: 'encoder-failed',
      message: 'AudioContext.resume() did not finish within 1000 ms',
    });
    await vi.advanceTimersByTimeAsync(1001);
    await expectation;
  });

  it('stops waiting when cancelled', async () => {
    const controller = new AbortController();
    const waiting = within(new Promise<never>(() => {}), 1000, 'the thing', controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects at once when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      within(Promise.resolve(1), 1000, 'the thing', controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('leaves no timer behind once settled', async () => {
    await within(Promise.resolve(1), 1000, 'the thing');
    expect(vi.getTimerCount()).toBe(0);
  });
});
