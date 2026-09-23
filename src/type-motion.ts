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
    '.section-rule,.project-metadata,.work-index a,.lab-heading,.clarity-image figcaption,.instrument-top,.avoid-caption h3,.experiment-index summary,.context-spine>*,.contact-links a,.footer-baseline'
  )];
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

  const all = [...headings, ...copy, ...details];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || reduced.matches || signal.aborted) continue;
      const element = entry.target as HTMLElement;
      observer.unobserve(element);
      if (headings.includes(element)) {
        element.querySelectorAll<HTMLElement>('.kinetic-word').forEach((word, index) => {
          play(word, [
            { opacity: .2, transform: 'translate3d(0,.48em,0) rotateX(-48deg)', filter: 'blur(6px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) rotateX(0)', filter: 'blur(0)' }
          ], { duration: 780, delay: index * 68, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
        });
      } else if (copy.includes(element)) {
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
    observer.disconnect();
    animations.forEach(animation => animation.cancel());
    animations.clear();
  };
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); }, { signal });

  signal.addEventListener('abort', () => {
    stop();
  }, { once: true });
}
