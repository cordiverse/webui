/**
 * Shim for `node:timers/promises`. The cordis loader and include import
 * `setTimeout` from it to wait between retries of a file operation.
 */

export function setTimeout<T = void>(delay?: number, value?: T): Promise<T> {
  return new Promise(resolve => globalThis.setTimeout(resolve, delay, value))
}

export default { setTimeout }
