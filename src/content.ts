// Facts here come from Ethan's general resume (November 2026) and each project's own README.
// The DOM in index.html is the readable source of truth; this module carries what scripts need.

export type ProjectId = 'city' | 'promptoff' | 'towerlogic' | 'piano' | 'mosaic';

export interface ProjectDef {
  id: ProjectId;
  key: string;
  name: string;
  kind: string;
  /** colour used by the world and the chapter accent */
  color: string;
}

export const PROJECTS: ProjectDef[] = [
  { id: 'city', key: '1', name: 'City Settlers', kind: 'Multiplayer city game', color: '#f2b45c' },
  { id: 'promptoff', key: '2', name: 'The Great Prompt-Off', kind: 'LLM evaluation platform', color: '#e2ded5' },
  { id: 'towerlogic', key: '3', name: 'TowerLogic', kind: 'Vision to decision', color: '#c5f04e' },
  { id: 'piano', key: '4', name: 'Piano MIR', kind: 'Music information retrieval', color: '#9fd0e8' },
  { id: 'mosaic', key: '5', name: 'Mosaic', kind: 'Visual collections', color: '#e9a58b' },
];

export const isProjectId = (value: unknown): value is ProjectId =>
  typeof value === 'string' && PROJECTS.some((project) => project.id === value);

/** Labels accepted by the Prompt-Off scorer: anything else is wrong, not translated. */
export const LABELS = ['present', 'absent', 'uncertain', 'not_reported'] as const;
export type Label = (typeof LABELS)[number];
export const FINDINGS = ['acl_tear', 'mcl_injury', 'meniscus_tear', 'fracture', 'osteoarthritis', 'effusion'] as const;
export type Finding = (typeof FINDINGS)[number];

export const isLabel = (value: unknown): value is Label =>
  typeof value === 'string' && (LABELS as readonly string[]).includes(value);

export interface FieldResult { field: Finding; given: string; expected: Label; ok: boolean; reason: string }

/** Strict field scoring in the spirit of the project: exact controlled labels, no synonym rescue. */
export function scoreOutput(output: Record<string, string>, key: Record<Finding, Label>): FieldResult[] {
  return FINDINGS.map((field) => {
    const given = Object.prototype.hasOwnProperty.call(output, field) ? output[field] : '';
    const expected = key[field];
    if (!given) return { field, given: '(missing)', expected, ok: false, reason: 'missing field' };
    if (!isLabel(given)) return { field, given, expected, ok: false, reason: 'not a controlled label' };
    if (given !== expected) return { field, given, expected, ok: false, reason: `expected ${expected}` };
    return { field, given, expected, ok: true, reason: 'match' };
  });
}

/** A synthetic, non-clinical sample in the shape of the challenge (not one of the event's reports). */
export const SAMPLE_KEY: Record<Finding, Label> = {
  acl_tear: 'present',
  mcl_injury: 'absent',
  meniscus_tear: 'uncertain',
  fracture: 'absent',
  osteoarthritis: 'not_reported',
  effusion: 'present',
};

export const SAMPLE_OUTPUTS: Record<'strict' | 'loose' | 'eager', Record<string, string>> = {
  strict: { acl_tear: 'present', mcl_injury: 'absent', meniscus_tear: 'uncertain', fracture: 'absent', osteoarthritis: 'not_reported', effusion: 'present' },
  loose: { acl_tear: 'yes', mcl_injury: 'intact', meniscus_tear: 'partial tear', fracture: 'no', osteoarthritis: 'absent', effusion: 'trace' },
  eager: { acl_tear: 'present', mcl_injury: 'absent', meniscus_tear: 'present', fracture: 'absent', osteoarthritis: 'absent', effusion: 'present' },
};

export const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Position of `time` inside [start, end] as 0..1, safe for empty or reversed ranges. */
export function progressBetween(time: number, start: number, end: number): number {
  if (!(end > start)) return 0;
  return clamp01((time - start) / (end - start));
}

// taste-skill-ignore: sharps and flats are music notation, not emoji
export const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']; // taste-skill-ignore
export const pitchName = (pitch: number) => `${PITCH_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
export const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);

/**
 * Real photographs for the About section. Empty for now: the layout renders nothing until
 * entries exist, so three to five photographs can be added later without redesigning anything.
 * Each needs src (under /media/photos/), width, height and a caption that says what it shows.
 */
export const PHOTOS: { src: string; width: number; height: number; alt: string; caption: string }[] = [];
