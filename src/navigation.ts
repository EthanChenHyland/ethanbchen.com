/** Keep a requested chapter aligned while fonts and lazy project surfaces establish layout. */
export function setupChapterNavigation(signal: AbortSignal): void {
  let target: HTMLElement | null = null;
  let frame = 0;
  let expiry = 0;
  let lastTop: number | null = null;
  const stop = () => {
    target = null;lastTop = null;
    cancelAnimationFrame(frame);frame = 0;
    clearTimeout(expiry);
  };
  const align = () => {
    frame = 0;
    if (!target || signal.aborted) return;
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const top = Math.max(0, target.getBoundingClientRect().top + scrollY - inset);
    // Correct layout shifts, not the browser’s own in-progress smooth anchor scroll.
    if (lastTop === null || Math.abs(lastTop - top) > 1) {
      if (Math.abs(scrollY - top) > 1) window.scrollTo({ top, behavior: 'instant' });
    }
    lastTop = top;
  };
  const schedule = () => { if (target && !frame) frame = requestAnimationFrame(align); };
  const follow = (initial = false) => {
    stop();
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const section = document.getElementById(id);
    if (!section?.matches('main > section, footer')) return;
    target = section;
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    lastTop = initial ? null : Math.max(0, section.getBoundingClientRect().top + scrollY - inset);
    schedule();
    // This is a bounded loading window, never a scroll lock. Any user input releases it.
    expiry = window.setTimeout(stop, 10000);
  };
  const observer = new ResizeObserver(schedule);observer.observe(document.body);
  window.addEventListener('hashchange', () => follow(), { signal });
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(event, stop, { passive: true, signal });
  }
  document.fonts.ready.then(schedule);
  signal.addEventListener('abort', () => { stop();observer.disconnect(); }, { once: true });
  follow(true);
}
