const fields = new WeakMap<HTMLElement, () => void>();

/** The name is the first signal: typeset ink becomes a spatial field under pressure. */
export function setupHeroField(signal: AbortSignal): void {
  if (signal.aborted) return;
  const hero = document.querySelector<HTMLElement>('.hero');
  const stage = document.querySelector<HTMLElement>('.name-stage');
  const trigger = document.querySelector<HTMLButtonElement>('.disturb-identity');
  if (!hero || !stage || !trigger) return;
  fields.get(stage)?.();
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let attempt: AbortController | undefined;
  let dispose: (() => void) | undefined;
  let stopped = false;

  function cancel() {
    const previous = attempt;
    attempt = undefined;
    previous?.abort();
    const cleanup = dispose;
    dispose = undefined;
    cleanup?.();
    trigger!.textContent = 'SIGNAL / TRACE';
  }
  async function start() {
    if (stopped || reduced.matches || attempt || signal.aborted) return;
    const current = new AbortController();
    attempt = current;
    try {
      const module = await import('./hero-webgl');
      if (current.signal.aborted) return;
      const cleanup = await module.createIdentityField(hero!, stage!, trigger!, current.signal);
      if (stopped || current.signal.aborted || reduced.matches || attempt !== current) cleanup();
      else dispose = cleanup;
    } catch {
      if (attempt === current) {
        cancel();
        stage!.classList.remove('identity-ready');
      }
    }
  }
  const preference = () => { if (reduced.matches) cancel(); else void start(); };
  function stop() {
    if (stopped) return;
    stopped = true;
    reduced.removeEventListener('change', preference);
    signal.removeEventListener('abort', stop);
    cancel();
    if (fields.get(stage!) === stop) fields.delete(stage!);
  }
  fields.set(stage, stop);
  reduced.addEventListener('change', preference);
  signal.addEventListener('abort', stop, { once: true });
  void start();
}
