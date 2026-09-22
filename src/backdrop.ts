/** A single lazy background renderer follows native scrolling with automatic ambient motion. */
export function setupBackdrop(parent: AbortSignal): void {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let attempt: AbortController | undefined;
  const stop = () => { attempt?.abort();attempt = undefined; };
  async function start() {
    if (parent.aborted || reduced.matches || attempt) return;
    const controller = new AbortController();attempt = controller;
    try { const { createBackdrop } = await import('./backdrop-webgl');if (!controller.signal.aborted) createBackdrop(controller.signal); }
    catch { if (attempt === controller) stop(); }
  }
  reduced.addEventListener('change', () => { if (reduced.matches) stop();else void start(); }, { signal: parent });
  parent.addEventListener('abort', stop, { once: true });void start();
}
