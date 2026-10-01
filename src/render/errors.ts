export type RenderErrorCode =
  | 'invalid-plan'
  | 'missing-photo'
  | 'photo-decode-failed'
  | 'track-fetch-failed'
  | 'track-decode-failed'
  | 'encoder-failed'
  | 'unsupported';

export class RenderError extends Error {
  readonly code: RenderErrorCode;

  constructor(code: RenderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RenderError';
    this.code = code;
  }
}

export function abortError(): DOMException {
  return new DOMException('Render cancelled', 'AbortError');
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
