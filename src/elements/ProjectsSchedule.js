// The Projects console's long-idle program.
//
// PROJECTS defines each work once: its tier, its title beat (the name in holographic type and the
// visual it turns into), and when the deck and the space in front of the screen are free of its
// physical events (so the ambient portal life may use them). The works themselves (their visual
// states, portal events, artifacts and sounds) live in their own modules; adding a project is a
// work module, an entry here, and entries in the program.
//
// Tiers: flagship and featured works run 22–54 s and carry a full title; cameos run 9–14 s with a
// small title; micro cameos run a few seconds. A showcase beat (the PROJECTS hologram) opens each
// half of the program: the console settles into a clean pose, the ambient portals calm, the
// hologram comes through the glass, and the next project's title follows.
//
// PROGRAM entries may begin a few seconds before the previous one ends (its screen scene wakes deep
// in the screen while the last object is still going back in). Every work keeps its physical events
// away from its first and last few seconds, so an overlap never puts two physical events in the
// station at once; a title waits until the previous entry has finished.

// `free`: when (work time) neither the deck nor the space in front of the screen holds any of the
// work's physical events, measured from the works themselves (physical windows, 0.5 s margin).
export const PROJECTS = {
  showcase: { tier: 'showcase' },
  towerlogic: { tier: 'flagship', title: ['TOWERLOGIC'], mode: 'grid', free: { default: [[43.0, 50]] } },
  mosaic: { tier: 'flagship', title: ['MOSAIC'], mode: 'tiles', free: { default: [[16.2, 30.9]] } },
  promptoff: { tier: 'flagship', title: ['THE GREAT', 'PROMPT-OFF'], mode: 'slices', free: { default: [[0, 4.7]] } },
  visualjava: { tier: 'featured', title: ['VISUAL JAVA'], mode: 'extrude', free: { default: [[23.8, 30]], rewind: [[0, 5.6]] } },
  bugmuseum: { tier: 'featured', title: ['BUGMUSEUM'], mode: 'glitch' },
  wincodex: { tier: 'cameo', title: ['WINCODEX'], mode: 'fade', small: true },
  chess: { tier: 'cameo', title: ['FUNCHESSENGINE'], mode: 'fade', small: true, free: { default: [[0, 6.6]] } },
  pianomir: { tier: 'cameo', title: ['PIANOMIR'], mode: 'fade', small: true, screenOnly: true },
  clarity: { tier: 'cameo', title: ['CLARITY'], mode: 'fade', small: true, screenOnly: true },
  'micro:avoid': { tier: 'micro', title: ['AVOID.LOVE'], mode: 'fade', small: true, screenOnly: true },
  'micro:notes': { tier: 'micro', title: ['NITRO NOTES'], mode: 'fade', small: true, screenOnly: true },
  'micro:kitco': { tier: 'micro', title: ['KITCOSCRAPER'], mode: 'fade', small: true, screenOnly: true },
  'micro:hub': { tier: 'micro', title: ['ETHANBCHEN.COM'], mode: 'fade', small: true, screenOnly: true },
  'micro:profile': { tier: 'micro', title: ['GITHUB PROFILE'], mode: 'fade', small: true, screenOnly: true },
  cloudline: { tier: 'featured', title: ['CLOUDLINE'], mode: 'rails', free: { default: [[0, 4.0]] } },
};

/** The registry entry for a program entry (micro cameos are keyed by variant). */
export const defFor = (name, variant) => PROJECTS[name === 'micro' ? `micro:${variant ?? 'avoid'}` : name] ?? {};

// `variants` rotate from one cycle of the program to the next, so repeated appearances differ.
export const PROGRAM = [
  { work: 'towerlogic', overlap: 2 }, // (its overlap applies where the program wraps onto it)
  { work: 'micro', variants: ['avoid', 'hub'], overlap: 1.5 },
  { work: 'visualjava', overlap: 2 },
  { work: 'pianomir', overlap: 2 },
  { work: 'mosaic', variants: [undefined, 'rows'], overlap: 2 },
  { work: 'wincodex', overlap: 0 }, // Mosaic's board is on the deck until its last moment
  { work: 'bugmuseum', variants: ['fence', 'overflow'], overlap: 2 },
  { work: 'micro', variants: ['notes', 'profile'], overlap: 1.5 },
  { work: 'promptoff', variants: [undefined, 'strict'], overlap: 2 },
  { work: 'cloudline', overlap: 2 },
  { work: 'visualjava', variant: 'rewind', overlap: 2 },
  { work: 'chess', overlap: 2 },
  { work: 'towerlogic', overlap: 2 },
  { work: 'clarity', overlap: 2 },
  { work: 'bugmuseum', variants: ['deadlock', 'stairs'], overlap: 2 },
  { work: 'micro', variants: ['kitco', 'hub'], overlap: 1.5 },
  { work: 'mosaic', variants: ['rows', undefined], overlap: 2 },
  { work: 'promptoff', variants: ['strict', undefined], overlap: 2 },
];

export class Schedule {
  constructor(works, program = PROGRAM) {
    this.works = works;
    this.items = [];
    let at = 0;
    program.forEach((p, i) => {
      const work = works.find((w) => w.name === p.work);
      if (!work) return;
      const overlap = i === 0 ? 0 : p.overlap ?? 0;
      at -= overlap;
      const v0 = p.variant ?? p.variants?.[0];
      this.items.push({ ...p, variant: v0, work, start: at, length: work.lengthFor?.(v0) ?? work.length, overlap: p.overlap ?? 0, def: defFor(p.work, v0) });
      at += this.items.at(-1).length;
    });
    // the program wraps onto its first entry with that entry's own overlap
    this.total = at - (program[0].overlap ?? 2);
  }

  /** Every entry running at `time`: { item, t, show, primary }. */
  at(time) {
    const T = ((time % this.total) + this.total) % this.total;
    const cycle = Math.floor(time / this.total);
    const running = [];
    this.items.forEach((item, i) => {
      for (const shift of [0, this.total, -this.total]) {
        const t = T + shift - item.start;
        if (t >= 0 && t < item.length) {
          if (item.variants) {
            // the cycle this entry belongs to (an entry that wrapped began in the previous one)
            const c = cycle - (shift > 0 ? 1 : shift < 0 ? -1 : 0);
            const v = item.variants[((c % item.variants.length) + item.variants.length) % item.variants.length];
            item = { ...item, variant: v, def: defFor(item.work.name, v) };
          }
          const next = this.items[(i + 1) % this.items.length];
          const fadeIn = Math.max(item.overlap, 1.5), fadeOut = Math.max(next.overlap, 1.5);
          const k = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
          const e = (x) => x * x * (3 - 2 * x);
          running.push({ item, t, show: e(k(0, fadeIn, t)) * (1 - e(k(item.length - fadeOut, item.length, t))) });
        }
      }
    });
    running.sort((a, b) => a.t - b.t); // the most recently started first
    if (running[0]) running[0].primary = true;
    return running;
  }

  /** When (program time) each entry starts, for timeline reports. */
  timeline() {
    return this.items.map((i) => ({ work: i.work.name, variant: i.variants ? i.variants.join('|') : i.variant ?? null, tier: i.def.tier, start: +i.start.toFixed(1), end: +(i.start + i.length).toFixed(1) }));
  }
}
