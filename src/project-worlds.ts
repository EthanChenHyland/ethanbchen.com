import type { ProjectWorldRenderer } from './project-worlds-webgl';

/** Project controls remain DOM; a single renderer owns all spatial work surfaces. */
export function setupProjectWorlds(parent: AbortSignal): void {
  const prompt = document.querySelector<HTMLElement>('.prompt-layout');
  const clarity = document.querySelector<HTMLElement>('.overlay-mat');
  const piano = document.querySelector<HTMLElement>('.piano-instrument');
  if (!prompt || !clarity || !piano) return;
  const makeSurface = (kind: string, title: string, caption: string) => {
    const figure = document.createElement('figure');
    figure.className = `project-volume ${kind}-volume`;
    figure.innerHTML = `<div class="volume-heading mono"><span>${title}</span><span class="volume-status">SPATIAL STUDY</span></div><div class="project-world" data-world="${kind}" aria-label="${caption}"><svg class="volume-fallback" viewBox="0 0 900 450" aria-hidden="true"><path d="M30 320H130V140H310V320H490V140H670V320H870"/><path d="M130 90V370M310 90V370M490 90V370M670 90V370"/></svg></div><figcaption class="volume-caption mono">${caption}</figcaption></figure>`;
    return figure;
  };
  const schema = makeSurface('schema', '01 / OPEN THE CONTRACT', 'DRAG TO TURN · SELECT A FINDING · KEYS 1–6 SELECT A FIELD');
  prompt.before(schema);
  clarity.classList.add('project-world');clarity.dataset.world = 'context';
  const music = makeSurface('music', '03 / WALK THROUGH THE SCORE', '69 EXPECTED MIDI NOTES · PLAY THE SCORE · SELECT A NOTE TO SEEK');
  piano.before(music);
  const schemaControl = document.createElement('label');
  schemaControl.className = 'volume-control mono';
  schemaControl.innerHTML = 'CONTRACT DEPTH <input type="range" min="0" max="1" step="0.01" value="0.35" aria-label="Separate the six finding planes"><span>CLOSED ↔ OPEN</span>';
  schema.append(schemaControl);
  const contextControl = document.createElement('label');
  contextControl.className = 'volume-control context-depth mono';
  contextControl.innerHTML = 'CONTEXT DEPTH <input type="range" min="0" max="1" step="0.01" value="0.55" aria-label="Separate Clarity context planes"><span>FLAT ↔ SPATIAL</span>';
  clarity.closest('figure')!.append(contextControl);
  const musicControl = document.createElement('label');
  musicControl.className = 'volume-control mono';
  musicControl.innerHTML = 'ANALYSIS HEAD <input type="range" min="0" max="12.3" step="0.01" value="0" aria-label="Seek the Minuet score"><output>0.00 SEC</output>';
  music.append(musicControl);
  const views = [schema.querySelector<HTMLElement>('.project-world')!, clarity, music.querySelector<HTMLElement>('.project-world')!];
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let attempt: AbortController | undefined, renderer: ProjectWorldRenderer | undefined, visible = false;
  const setFallback = () => views.forEach(view => view.closest('.project-volume')?.classList.remove('volume-live'));
  const cancel = () => { attempt?.abort();attempt = undefined;renderer?.dispose();renderer = undefined;setFallback(); };
  async function load() {
    if (attempt || renderer || reduced.matches || parent.aborted) return;
    const current = new AbortController();attempt = current;
    try {
      const { createProjectWorlds } = await import('./project-worlds-webgl');
      if (current.signal.aborted) return;
      const created = await createProjectWorlds(views, current.signal);
      if (current.signal.aborted || reduced.matches) { created.dispose();return; }
      renderer = created;
      views.forEach(view => view.closest('.project-volume')?.classList.add('volume-live'));
    } catch {
      if (attempt === current) {
        cancel();
        views.forEach(view => view.classList.add('world-unavailable'));
      }
    }
  }
  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting) || views.some(view => { const r = view.getBoundingClientRect();return r.bottom > -300 && r.top < innerHeight + 300; });if (visible) void load(); }, { rootMargin: '300px' });
  views.forEach(view => observer.observe(view));
  reduced.addEventListener('change', () => { if (reduced.matches) cancel();else if (visible) void load(); }, { signal: parent });
  parent.addEventListener('abort', () => { observer.disconnect();cancel(); }, { once: true });
}
