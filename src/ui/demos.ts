import { SAMPLE_KEY, SAMPLE_OUTPUTS, pitchName, scoreOutput, type FieldResult } from '../content';
import type { World } from '../world/World';

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Toggle aria-pressed across a group and return the chosen button's data value. */
function choiceGroup(buttons: HTMLButtonElement[], attr: string, onPick: (value: string) => void, signal: AbortSignal) {
  for (const b of buttons) {
    b.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      onPick(b.dataset[attr] ?? '');
    }, { signal });
  }
}

export function setupCity(world: World | null, signal: AbortSignal) {
  const out = $<HTMLElement>('#city-out');
  const say = () => {
    if (!world || !out) return;
    const s = world.city.stats();
    out.textContent = `The miniature holds ${s.homes} homes, ${s.parks} parks and ${s.stations} transit stops.`;
  };
  choiceGroup($$<HTMLButtonElement>('[data-policy]'), 'policy', (p) => {
    world?.city.setPolicy(p as 'housing' | 'transit' | 'parks');
    say();
  }, signal);
  if (world) world.city.onChange = say;
  say();
}

export function setupScorer(world: World | null, signal: AbortSignal) {
  const list = $<HTMLOListElement>('#score-out');
  if (!list) return;
  const render = (results: FieldResult[]) => {
    list.replaceChildren(...results.map((r) => {
      const li = document.createElement('li');
      li.className = r.ok ? 'is-ok' : 'is-miss';
      li.innerHTML = `<code class="score__field"></code><code class="score__given"></code><span class="score__verdict"></span>`;
      li.children[0].textContent = r.field;
      li.children[1].textContent = r.given;
      li.children[2].textContent = r.ok ? 'match' : r.reason;
      return li;
    }));
    const total = results.filter((r) => r.ok).length;
    list.setAttribute('aria-label', `${total} of 6 fields correct`);
    list.dataset.total = `${total} of 6 fields`;
    world?.promptoff.drawScore(results);
  };
  choiceGroup($$<HTMLButtonElement>('[data-output]'), 'output', (kind) => {
    const output = SAMPLE_OUTPUTS[kind as keyof typeof SAMPLE_OUTPUTS];
    if (output) render(scoreOutput(output, SAMPLE_KEY));
  }, signal);
}

const STAGE_TEXT: Record<string, string> = {
  pixels: 'A frame comes off the BlueStacks emulator over ADB, with colour and region checks for which screen the game is on.',
  perception: 'A 640×640 YOLO-style detector, run in ONNX Runtime, finds units and towers; a compact classifier reads the four cards in hand.',
  state: 'Everything becomes one normalised vector: 26 values from the field and 4 for the hand, 30 inputs in all.',
  decision: 'Rule masks remove illegal plays; the policy network scores candidate placements and picks a card and a coordinate, or logs a dry run.',
};

export function setupStages(world: World | null, signal: AbortSignal) {
  const out = $<HTMLElement>('#stage-out');
  choiceGroup($$<HTMLButtonElement>('[data-stage]'), 'stage', (stage) => {
    if (out) out.textContent = STAGE_TEXT[stage] ?? '';
    world?.towerlogic.setStage(stage as 'pixels' | 'perception' | 'state' | 'decision');
  }, signal);
}

const stamp = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** The audio element is the clock; the desk keyboard follows it. */
export function setupMinuet(world: World | null, signal: AbortSignal, isPianoOpen: () => boolean) {
  const audio = $<HTMLAudioElement>('#minuet-audio');
  const button = $<HTMLButtonElement>('#minuet-play');
  const time = $<HTMLOutputElement>('#minuet-time');
  const label = $<HTMLElement>('#minuet-notes');
  if (!audio || !button || !time || !label) return { tick: () => {} };
  let notes: { start: number; duration: number; pitch: number }[] = [];
  fetch('/data/minuet-full-notes.json').then((r) => r.json()).then((d) => (notes = d.notes)).catch(() => {});
  const sync = () => {
    const playing = !audio.paused;
    button.textContent = playing ? 'Pause' : audio.currentTime > 0 && !audio.ended ? 'Resume' : 'Play';
    button.setAttribute('aria-pressed', String(playing));
    if (world) world.piano.time = playing ? audio.currentTime : null;
  };
  button.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, { signal });
  for (const evt of ['play', 'pause', 'ended']) audio.addEventListener(evt, sync, { signal });
  audio.addEventListener('ended', () => { audio.currentTime = 0; }, { signal });

  // the A..K row plays the desk piano while its chapter is open
  const keys = 'asdfghjk';
  const whites = [60, 62, 64, 65, 67, 69, 71, 72];
  let ac: AudioContext | null = null;
  const tone = (pitch: number) => {
    ac ??= new AudioContext();
    const f = 440 * Math.pow(2, (pitch - 69) / 12);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const t = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g); o2.connect(g); g.connect(ac.destination);
    o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || !isPianoOpen()) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    const k = keys.indexOf(e.key.toLowerCase());
    if (k < 0) return;
    tone(whites[k]);
    world?.piano.tap(whites[k]);
    label.textContent = pitchName(whites[k]);
  }, { signal });

  return {
    tick: () => {
      if (audio.paused) return;
      if (world) world.piano.time = audio.currentTime;
      time.textContent = `${stamp(audio.currentTime)} / 0:42`;
      const t = audio.currentTime;
      const sounding = notes.filter((n) => t >= n.start && t < n.start + n.duration).map((n) => pitchName(n.pitch));
      label.textContent = sounding.join(' ');
    },
  };
}

/** Mosaic's Canvas in miniature: drag prints with a pointer or move them with the arrow keys. */
export function setupBoard(signal: AbortSignal) {
  const board = $<HTMLElement>('#board');
  if (!board) return;
  const photos = [
    ['/media/nashville/nashville-skyline-at-night-i-65.jpg', 'Nashville skyline at night from the I-65 overpass', 1000, 666],
    ['/media/nashville/parthenon-in-nashville-2025.jpg', 'The Parthenon in Centennial Park', 1000, 750],
    ['/media/nashville/tennessee-state-capitol-2009.jpg', 'The Tennessee State Capitol', 1000, 1000],
    ['/media/nashville/rymanauditorium1.jpg', 'The Ryman Auditorium', 841, 1000],
    ['/media/nashville/kirkland-hall-at-vanderbilt-university.jpg', 'Kirkland Hall at Vanderbilt University', 927, 1000],
    ['/media/nashville/nashville-skyline-2009.jpg', 'Nashville skyline across the Cumberland River', 1000, 625],
  ] as const;
  const prints = photos.map(([src, alt, w, h], k) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'print';
    el.setAttribute('aria-label', `${alt}. Arrow keys move it.`);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.width = w;
    img.height = h;
    img.loading = 'lazy';
    img.draggable = false;
    el.append(img);
    el.style.setProperty('--ratio', String(w / h));
    el.style.zIndex = String(k + 1);
    board.append(el);
    return el;
  });
  let z = prints.length;
  const place = (el: HTMLElement, x: number, y: number, r = 0) => {
    const bw = board.clientWidth, bh = board.clientHeight;
    const cx = Math.max(0, Math.min(bw - el.offsetWidth, x));
    const cy = Math.max(0, Math.min(bh - el.offsetHeight, y));
    el.dataset.x = String(cx);
    el.dataset.y = String(cy);
    el.style.transform = `translate(${cx}px, ${cy}px) rotate(${r}deg)`;
  };
  const scatter = () => prints.forEach((el, k) => {
    const bw = board.clientWidth, bh = board.clientHeight;
    place(el, ((k * 0.37 + 0.08) % 1) * (bw - el.offsetWidth), ((k * 0.61 + 0.15) % 1) * (bh - el.offsetHeight), ((k * 47) % 17) - 8);
  });
  const tidy = () => prints.forEach((el, k) => {
    const bw = board.clientWidth;
    const cols = bw < 420 ? 2 : 3;
    const cw = bw / cols;
    place(el, (k % cols) * cw + (cw - el.offsetWidth) / 2, Math.floor(k / cols) * (board.clientHeight / Math.ceil(prints.length / cols)) + 6, 0);
  });
  requestAnimationFrame(scatter);
  $('#board-tidy')?.addEventListener('click', () => { board.classList.add('is-settling'); tidy(); }, { signal });
  $('#board-scatter')?.addEventListener('click', () => { board.classList.add('is-settling'); scatter(); }, { signal });

  for (const el of prints) {
    let start: { px: number; py: number; x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      board.classList.remove('is-settling');
      el.setPointerCapture(e.pointerId);
      el.style.zIndex = String(++z);
      start = { px: e.clientX, py: e.clientY, x: Number(el.dataset.x), y: Number(el.dataset.y) };
      el.classList.add('is-lifted');
    }, { signal });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      place(el, start.x + e.clientX - start.px, start.y + e.clientY - start.py, 0);
    }, { signal });
    const end = () => { start = null; el.classList.remove('is-lifted'); };
    el.addEventListener('pointerup', end, { signal });
    el.addEventListener('pointercancel', end, { signal });
    el.addEventListener('keydown', (e) => {
      const d = e.shiftKey ? 40 : 12;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      el.style.zIndex = String(++z);
      place(el, Number(el.dataset.x) + m[0], Number(el.dataset.y) + m[1], 0);
    }, { signal });
  }
  window.addEventListener('resize', () => scatter(), { signal });
}

/** The lab ledger: hovering or focusing a row shows its preview beside the list. */
export function setupLab(signal: AbortSignal) {
  const lab = $<HTMLElement>('.lab');
  const rows = $$<HTMLLIElement>('.ledger li');
  const figures = $$<HTMLElement>('.preview figure');
  if (!lab) return;
  const show = (row: HTMLLIElement | null) => {
    const key = row?.dataset.preview ?? 'clarity';
    for (const r of rows) r.classList.toggle('is-current', r === row);
    lab.classList.toggle('has-current', !!row);
    for (const f of figures) f.classList.toggle('is-shown', f.dataset.for === key);
    lab.classList.toggle('is-avoid', key === 'avoid');
  };
  for (const row of rows) {
    row.addEventListener('pointerenter', () => show(row), { signal });
    row.addEventListener('focusin', () => show(row), { signal });
  }
  $('.ledger')?.addEventListener('pointerleave', () => show(null), { signal });
  show(null);
}


/** A flat board for the lab preview, drawn from the same recorded game the desk replays. */
export function drawMiniBoard(fen: string, caption?: string) {
  const host = $<HTMLElement>('#mini-board');
  if (!host) return;
  const parts: string[] = [];
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const white = ch === ch.toUpperCase();
      const x = f * 50 + 25, y = r * 50 + 25;
      parts.push(`<circle cx="${x}" cy="${y}" r="17" fill="${white ? '#f3efe6' : '#141414'}"/>`);
      parts.push(`<text x="${x}" y="${y + 6}" text-anchor="middle" fill="${white ? '#141414' : '#f3efe6'}">${ch.toUpperCase()}</text>`);
      f++;
    }
  });
  const squares: string[] = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if ((r + f) % 2) squares.push(`<rect x="${f * 50}" y="${r * 50}" width="50" height="50"/>`);
  host.innerHTML = `<svg viewBox="0 0 400 400" role="img" aria-label="Chess position"><rect width="400" height="400" fill="#c8b28e"/><g fill="#6b4d36">${squares.join('')}</g><g font-family="Switzer, sans-serif" font-weight="600" font-size="17">${parts.join('')}</g></svg>`;
  const cap = $<HTMLElement>('#mini-board-caption');
  if (cap && caption) cap.textContent = caption;
}

export function setupCopy(signal: AbortSignal, toast: (text: string) => void) {
  for (const b of $$<HTMLButtonElement>('[data-copy]')) {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy ?? '');
        toast('Email copied.');
      } catch {
        toast('Copy failed: the address is ethan.b.chen@vanderbilt.edu');
      }
    }, { signal });
  }
}

export function setupPhotos(photos: { src: string; width: number; height: number; alt: string; caption: string }[]) {
  const host = $<HTMLElement>('#photos');
  if (!host || !photos.length) return;
  host.hidden = false;
  host.dataset.count = String(photos.length);
  for (const p of photos) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    Object.assign(img, { src: p.src, width: p.width, height: p.height, alt: p.alt, loading: 'lazy' });
    const cap = document.createElement('figcaption');
    cap.textContent = p.caption;
    fig.append(img, cap);
    host.append(fig);
  }
}
