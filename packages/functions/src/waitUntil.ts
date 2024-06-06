/**
 * Extends the lifetime of the request handler for the lifetime of the given {@link Promise}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil
 *
 * @param promise The promise to wait for.
 * @example
 *
 * ```
 * import { waitUntil } from '@vercel/functions';
 *
 * export function GET(request) {
 *   waitUntil(fetch('https://vercel.com'));
 *   return new Response('OK');
 * }
 * ```
 */
export const waitUntil = (promise: Promise<any>) => {
  if (
    promise === null ||
    typeof promise !== 'object' ||
    typeof promise.then !== 'function'
  ) {
    throw new TypeError(
      `waitUntil can only be called with a Promise, got ${typeof promise}`
    );
  }

  const ctx =
    globalThis[
      Symbol.for(
        '@vercel/request-context'
      ) as unknown as keyof typeof globalThis
    ]?.get?.() ?? {};
  ctx.waitUntil?.(promise);
};
