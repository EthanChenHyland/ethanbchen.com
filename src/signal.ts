import { boundedProgress } from './content';

/** A single scroll listener, one scheduled frame, and no perpetual animation loop. */
export function setupSignal(signal: AbortSignal): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 700px)');
  const hero = document.querySelector<HTMLElement>('.hero');
  const heroPaths = document.querySelectorAll<SVGPathElement>('.hero-trace path');
  const origin = document.querySelector<SVGCircleElement>('.hero-trace circle');
  const contact = document.querySelector<HTMLElement>('.contact-scene');
  const pipeline = document.querySelector<HTMLOListElement>('.evaluation-path');
  const steps = [...document.querySelectorAll<HTMLLIElement>('.evaluation-path li')];
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (reduced.matches) {
      heroPaths.forEach(path => path.style.strokeDashoffset = '0');
      contact?.style.setProperty('--resolve', '1');
      pipeline?.style.setProperty('--pipeline-progress', '1');
      steps.forEach(step => step.classList.add('is-current'));
      return;
    }
    if (contact) {
      const rect = contact.getBoundingClientRect();
      contact.style.setProperty('--resolve', String(boundedProgress(innerHeight - rect.top, innerHeight * .2, innerHeight * 1.1)));
    }
    if (hero) {
      const rect = hero.getBoundingClientRect();
      const progress = boundedProgress(innerHeight - rect.top, innerHeight * .65, innerHeight + rect.height * .5);
      heroPaths[1]?.style.setProperty('stroke-dashoffset', String(1 - progress));
    }
    if (pipeline) {
      const rect = pipeline.getBoundingClientRect();
      const progress = boundedProgress(innerHeight * .62 - rect.top, 0, rect.height - 45);
      pipeline.style.setProperty('--pipeline-progress', String(progress));
      steps.forEach((step, index) => step.classList.toggle('is-current', progress >= index / 3));
    }
  };
  const schedule = () => {
    if (!reduced.matches && !signal.aborted && !frame && !document.hidden) frame = requestAnimationFrame(draw);
  };
  const preference = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (reduced.matches) draw();
    else schedule();
  };
  const geometry = () => {
    const path = small.matches
      ? 'M 970 10 V 112 Q 970 125 950 125 H 18 V 445 Q 18 470 45 470 H 130 V 480'
      : 'M 795 25 V 135 Q 795 155 775 155 H 107 Q 87 155 87 175 V 330 Q 87 350 107 350 H 225 Q 245 350 245 370 V 480';
    heroPaths.forEach(item => item.setAttribute('d', path));
    origin?.setAttribute('cx', small.matches ? '970' : '795');
    origin?.setAttribute('cy', small.matches ? '10' : '25');
    schedule();
  };
  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', schedule, { passive: true, signal });
  document.addEventListener('visibilitychange', schedule, { signal });
  reduced.addEventListener('change', preference, { signal });
  small.addEventListener('change', geometry, { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
  geometry();
  preference();
}
