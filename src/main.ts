import './style.css';
import { PHOTOS, PROJECTS, isProjectId } from './content';
import { TIERS, hasWebGL2, pickTier, readSignals } from './quality';
import { drawMiniBoard, setupBoard, setupCity, setupCopy, setupLab, setupMinuet, setupPhotos, setupScorer, setupStages } from './ui/demos';
import type { World } from './world/World';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const root = document.documentElement;
const controller = new AbortController();
const { signal } = controller;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// where a click on each desk object leads
const DESTINATION: Record<string, string> = {
  city: '#city-settlers', promptoff: '#prompt-off', towerlogic: '#towerlogic', piano: '#piano-mir', mosaic: '#mosaic',
  lab: '#lab', chess: '#lab',
};
const LABELS: { id: string; name: string; kind: string }[] = [
  ...PROJECTS.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
  { id: 'lab', name: 'The lab', kind: 'Nine smaller builds' },
];

const scrollToHash = (hash: string) => {
  const el = $<HTMLElement>(hash);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', hash);
};

const toastEl = $<HTMLElement>('.toast')!;
let toastTimer = 0;
const toast = (text: string) => {
  toastEl.textContent = text;
  toastEl.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('is-shown'), 2400);
};

// ---------- navigation that works with or without the desk ----------

function setupMenu() {
  const toggle = $<HTMLButtonElement>('.bar__toggle');
  const bar = $<HTMLElement>('.bar');
  if (!toggle || !bar) return;
  const close = () => { bar.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => {
    const open = !bar.classList.contains('is-open');
    bar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }, { signal });
  for (const a of $$<HTMLAnchorElement>('.bar__nav a')) a.addEventListener('click', close, { signal });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal });
  const solid = () => bar.classList.toggle('is-solid', scrollY > innerHeight * 0.6);
  window.addEventListener('scroll', solid, { passive: true, signal });
  solid();
}

function setupReveal() {
  // entrance for the parts of each section, once; content is visible without script or motion
  if (reduced.matches) return;
  const targets = $$<HTMLElement>('.work__intro > *, .chapter__panel > *, .lab__head > *, .ledger li, .roles li, .education > *, .about__grid > *, .about__record > *, .contact > *');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => {
    const siblings = el.parentElement ? [...el.parentElement.children] : [];
    el.style.setProperty('--i', String(Math.min(6, siblings.indexOf(el))));
    el.classList.add('reveal');
    io.observe(el);
  });
}

/** which [data-focus] section holds the middle of the viewport */
function watchFocus(onFocus: (id: string, el: HTMLElement) => void) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) onFocus((e.target as HTMLElement).dataset.focus!, e.target as HTMLElement);
  }, { rootMargin: '-62% 0px -37% 0px' });
  for (const el of $$<HTMLElement>('[data-focus]')) io.observe(el);
}

// ---------- the desk ----------

async function startWorld(): Promise<World | null> {
  const canvas = $<HTMLCanvasElement>('#world');
  if (!canvas || !hasWebGL2()) return null;
  const tier = TIERS[pickTier(readSignals())];
  const loading = $<HTMLElement>('.loading');
  const slow = window.setTimeout(() => loading && (loading.textContent = 'Setting up the desk…'), 500);
  try {
    const { World } = await import('./world/World');
    const world = new World(canvas, tier, {
      onProgress: (n, total) => {
        if (loading && loading.textContent) loading.textContent = `Setting up the desk: ${Math.min(n, total)} of ${total}`;
      },
    });
    await world.init();
    clearTimeout(slow);
    if (loading) loading.textContent = '';
    root.dataset.tier = world.tier.name;
    if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = world;
    return world;
  } catch (err) {
    clearTimeout(slow);
    console.error('The desk could not start; the page continues without it.', err);
    if (loading) loading.textContent = '';
    return null;
  }
}

function wireWorld(world: World) {
  const canvas = $<HTMLCanvasElement>('#world')!;
  const labelsHost = $<HTMLElement>('.desk-labels')!;
  const tip = $<HTMLElement>('.pointer-tip')!;
  const fine = matchMedia('(pointer: fine)');
  let current = 'overview';
  const nameEl = $<HTMLElement>('.hero__name')!;
  const copyEl = $<HTMLElement>('.hero__copy')!;

  // hero labels: real buttons that follow their objects, the accessible twin of the 3D picking
  const labels = LABELS.map((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'desk-label';
    b.dataset.piece = l.id;
    b.innerHTML = `<span class="desk-label__name"></span><span class="desk-label__kind"></span>`;
    b.children[0].textContent = l.name;
    b.children[1].textContent = l.kind;
    b.addEventListener('click', () => scrollToHash(DESTINATION[l.id]), { signal });
    b.addEventListener('pointerenter', () => setHover(l.id), { signal });
    b.addEventListener('pointerleave', () => setHover(null), { signal });
    labelsHost.append(b);
    return b;
  });
  let hovered: string | null = null;
  const setHover = (id: string | null) => {
    hovered = id;
    for (const b of labels) b.classList.toggle('is-hot', b.dataset.piece === id);
    canvas.style.cursor = id ? 'pointer' : '';
  };

  // pointer picking on the canvas
  let down: { x: number; y: number; t: number } | null = null;
  let pointer = { x: 0, y: 0, dirty: false };
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; world.poke(); }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY, dirty: true };
    world.frog.lookAt = Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1));
  }, { signal });
  canvas.addEventListener('pointerleave', () => { setHover(null); tip.classList.remove('is-shown'); }, { signal });
  canvas.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 450) return;
    const id = world.pick(e.clientX, e.clientY);
    if (!id) return;
    if (id === 'frog') {
      world.frog.jump();
      toast('ribbit.');
    } else if (DESTINATION[id]) scrollToHash(DESTINATION[id]);
  }, { signal });

  const tipText = (id: string) => {
    if (id === 'frog') return 'The frog';
    if (id === 'chess') {
      const s = world.chess.status();
      const eval_ = s?.score != null ? `, engine eval ${(s.score / 100 >= 0 ? '+' : '')}${(s.score / 100).toFixed(2)}` : '';
      return s ? `FunChessEngine self-play: ${s.moveNumber}${s.white ? '.' : '…'} ${s.san}${eval_}` : 'FunChessEngine self-play';
    }
    const l = LABELS.find((x) => x.id === id);
    return l ? `Open ${l.name}` : '';
  };

  world.chess.onMove = (s) => {
    const fen = world.chess.fenAt(s.ply);
    if (fen) drawMiniBoard(fen, `FunChessEngine playing itself: move ${s.moveNumber}, ${s.san}.`);
  };

  // what the canvas is doing depends on where the reader is
  let inWorld = true;
  const zone = new IntersectionObserver((entries) => {
    for (const e of entries) (e.target as HTMLElement).dataset.visible = String(e.isIntersecting);
    inWorld = $$<HTMLElement>('[data-world]').some((el) => el.dataset.visible === 'true');
    world.setRunning(inWorld && !document.hidden);
    root.classList.toggle('world-off', !inWorld);
  });
  for (const el of $$<HTMLElement>('.hero, .chapter, .contact')) { el.dataset.world = ''; zone.observe(el); }
  document.addEventListener('visibilitychange', () => world.setRunning(inWorld && !document.hidden), { signal });

  watchFocus((id, el) => {
    for (const c of $$<HTMLElement>('.chapter')) c.classList.toggle('is-current', c === el);
    if (id === current) return;
    current = id;
    root.dataset.focus = id;
    world.focus(id);
    for (const a of $$<HTMLAnchorElement>('.desk-index a')) a.toggleAttribute('aria-current', a.dataset.piece === id);
  });

  const minuet = setupMinuet(world, signal, () => current === 'piano');

  // keyboard: 1-5 jump to projects, arrows step through them, Esc goes back to the overview
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable], .board')) return;
    const project = PROJECTS.find((p) => p.key === e.key);
    const order = PROJECTS.map((p) => p.id) as string[];
    const at = order.indexOf(current);
    if (project) scrollToHash(DESTINATION[project.id]);
    else if (e.key === 'Escape' || e.key === '0') scrollToHash('#top');
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && at >= 0) {
      const next = order[at + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) scrollToHash(DESTINATION[next]);
      else scrollToHash(e.key === 'ArrowRight' ? '#lab' : '#top');
    } else return;
    world.poke();
  }, { signal });

  // per frame: labels follow their objects, hover follows the pointer
  let hidden = false;
  world.setRunning(true);
  world.events.onFrame = () => {
    minuet.tick();
    const showLabels = current === 'overview' && !world.rig.busy && fine.matches && innerWidth >= 900;
    if (showLabels !== !hidden) {
      hidden = !showLabels;
      labelsHost.classList.toggle('is-hidden', hidden);
    }
    if (showLabels) {
      // a label never sits on the name or the copy: those win
      const blocks = [...nameEl.querySelectorAll('.line > span'), ...copyEl.children].map((el) => el.getBoundingClientRect());
      for (const b of labels) {
        const p = world.project(b.dataset.piece!);
        b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        // hidden labels measure 0, so keep their last real size
        if (b.offsetWidth) { b.dataset.w = String(b.offsetWidth); b.dataset.h = String(b.offsetHeight); }
        const w = Number(b.dataset.w ?? 160), h = Number(b.dataset.h ?? 44);
        const box = { l: p.x - w / 2 - 12, r: p.x + w / 2 + 12, t: p.y - h - 14, b: p.y + 12 };
        const covered = blocks.some((r) => box.l < r.right && box.r > r.left && box.t < r.bottom && box.b > r.top);
        const off = !p.visible || covered || box.t < 64 || box.r > innerWidth - 8;
        if (b.hidden !== off) b.hidden = off;
      }
    }
    if (pointer.dirty && !down && fine.matches && !world.rig.busy) {
      pointer.dirty = false;
      const id = world.pick(pointer.x, pointer.y);
      if (id !== hovered) setHover(id);
      if (id) {
        tip.textContent = tipText(id);
        tip.style.transform = `translate(${pointer.x + 16}px, ${pointer.y + 14}px)`;
        tip.classList.add('is-shown');
      } else tip.classList.remove('is-shown');
    }
  };

  return { minuet };
}

// ---------- boot ----------

async function boot() {
  setupMenu();
  setupReveal();
  setupLab(signal);
  setupBoard(signal);
  setupCopy(signal, toast);
  setupPhotos(PHOTOS);
  fetch('/github/chess-demo.json').then((r) => r.json()).then((d: { moves: { fen: string; san: string }[] }) => {
    const m = d.moves[17];
    if (m) drawMiniBoard(m.fen, `FunChessEngine playing itself: after ${m.san}.`);
  }).catch(() => {});

  for (const a of $$<HTMLAnchorElement>('.desk-index a')) {
    a.addEventListener('click', (e) => { e.preventDefault(); scrollToHash(a.getAttribute('href')!); }, { signal });
  }

  const world = await startWorld();
  root.classList.add(world ? 'has-world' : 'no-world');
  setupCity(world, signal);
  setupScorer(world, signal);
  setupStages(world, signal);
  if (world) {
    wireWorld(world);
    const hash = location.hash.slice(1);
    const focus = hash ? $(`#${CSS.escape(hash)}`)?.getAttribute('data-focus') : null;
    if (isProjectId(focus)) world.focus(focus, { instant: true });
  } else {
    setupMinuet(null, signal, () => false);
  }
  requestAnimationFrame(() => root.classList.add('is-ready'));
}

boot();
