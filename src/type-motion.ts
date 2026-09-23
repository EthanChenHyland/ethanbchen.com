/** Editorial motion that leaves the original content readable if enhancement fails. */
export function setupTypeMotion(signal: AbortSignal): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || signal.aborted) return;

  const headings = [...document.querySelectorAll<HTMLElement>(
    '.intro h2,.prompt-scene>h2,.clarity-title-row h2,.piano-heading h2,.avoid-heading h2,.experiment-intro h2,.about-layout h2,.human-note p,.contact-scene>h2'
  )];
  const copy = [...document.querySelectorAll<HTMLElement>(
    '.hero-bottom>p,.intro-copy>p,.project-thesis,.prompt-copy>p:not(.project-tech),.clarity-aside,.clarity-summary>p,.piano-heading p,.piano-details p,.avoid-caption p,.experiment-intro>p,.about-copy>p,.contact-bottom>p'
  )];
  const details = [...document.querySelectorAll<HTMLElement>(
    '.work-index a,.lab-heading,.clarity-image figcaption,.instrument-top,.avoid-caption h3,.experiment-index summary,.context-spine>*,.contact-links a,.footer-baseline'
  )];
  const headers = [...document.querySelectorAll<HTMLElement>('.section-rule,.project-metadata')];
  const animations = new Set<Animation>();
  const play = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(frames, options);
    animations.add(animation);
    void animation.finished.then(() => { animation.cancel();animations.delete(animation); }, () => animations.delete(animation));
  };

  // Preserve semantic headings and their inline emphasis; only text nodes are split.
  for (const heading of headings) {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      if (!node.textContent?.trim()) continue;
      const fragment = document.createDocumentFragment();
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
        else {
          const word = document.createElement('span');
          word.className = 'kinetic-word';
          word.textContent = part;
          fragment.append(word);
        }
      }
      node.replaceWith(fragment);
    }
    heading.classList.add('kinetic-heading');
  }

  // Scroll position drives these entrances in both directions. The light
  // interpolation takes the edge off wheel and touch-scroll jumps.
  const scrubbed = [...headings, ...headers].map(element => ({
    element, words: [...element.querySelectorAll<HTMLElement>('.kinetic-word')], current: 1, target: 1
  }));
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  let frame = 0;
  const measure = () => {
    for (const item of scrubbed) {
      const top = item.element.getBoundingClientRect().top;
      item.target = clamp((innerHeight * .9 - top) / (innerHeight * .48));
    }
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  };
  const render = (item: typeof scrubbed[number]) => {
    if (item.words.length) {
      item.words.forEach((word, index) => {
        const start = Math.min(.4, index * .055);
        const local = clamp((item.current - start) / (1 - start));
        const eased = local * local * (3 - 2 * local);
        word.style.opacity = String(.7 + .3 * eased);
        word.style.transform = `translate3d(0,${((1 - eased) * .16).toFixed(3)}em,0) rotateX(${(-(1 - eased) * 18).toFixed(1)}deg)`;
      });
    } else {
      item.element.style.opacity = String(.6 + .4 * item.current);
      item.element.style.translate = `0 ${((1 - item.current) * 10).toFixed(1)}px`;
    }
  };
  function draw() {
    frame = 0;
    if (reduced.matches || signal.aborted || document.hidden) return;
    let moving = false;
    for (const item of scrubbed) {
      item.current += (item.target - item.current) * .22;
      if (Math.abs(item.target - item.current) < .002) item.current = item.target;
      else moving = true;
      render(item);
    }
    if (moving) frame = requestAnimationFrame(draw);
  }
  measure();
  scrubbed.forEach(item => { item.current = item.target;render(item); });
  window.addEventListener('scroll', measure, { passive: true, signal });
  window.addEventListener('resize', measure, { passive: true, signal });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) measure(); }, { signal });

  const all = [...copy, ...details];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || reduced.matches || signal.aborted) continue;
      const element = entry.target as HTMLElement;
      observer.unobserve(element);
      if (copy.includes(element)) {
        play(element, [
          { opacity: .25, transform: 'translate3d(0,22px,0)', filter: 'blur(3px)' },
          { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0)' }
        ], { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)' });
      } else {
        play(element, [
          { opacity: .35, transform: 'translate3d(0,15px,0)' },
          { opacity: 1, transform: 'translate3d(0,0,0)' }
        ], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });
  all.forEach(element => observer.observe(element));

  const stop = () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    animations.forEach(animation => animation.cancel());
    animations.clear();
    scrubbed.forEach(item => {
      item.element.style.removeProperty('opacity');
      item.element.style.removeProperty('translate');
      item.words.forEach(word => { word.style.removeProperty('opacity');word.style.removeProperty('transform'); });
    });
  };
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); }, { signal });

  signal.addEventListener('abort', () => {
    stop();
  }, { once: true });
}
