// Render tiers chosen from device capability, not viewport width alone.
// The idea of named presets plus a measured pixel-ratio fallback follows 4elements' Opus 5.5 App.js.

export type TierName = 'high' | 'standard' | 'low' | 'static';

export interface Tier {
  name: TierName;
  /** upper bound for the renderer pixel ratio */
  dpr: number;
  shadows: number; // shadow map size in the 3D scene, 0 = off  taste-skill-ignore
  bloom: boolean;
  /** frames per second cap; 0 = display rate */
  fps: number;
  skyline: number; // buildings in the window
  cityDetail: number; // 0..1, share of diorama instances built
  motion: boolean; // continuous animation; false renders on demand
}

export const TIERS: Record<TierName, Tier> = {
  high: { name: 'high', dpr: 2, shadows: 2048, bloom: true, fps: 0, skyline: 140, cityDetail: 1, motion: true },
  standard: { name: 'standard', dpr: 1.5, shadows: 1024, bloom: true, fps: 0, skyline: 90, cityDetail: 0.8, motion: true },
  low: { name: 'low', dpr: 1.25, shadows: 0, bloom: false, fps: 30, skyline: 50, cityDetail: 0.55, motion: true },
  static: { name: 'static', dpr: 1.5, shadows: 1024, bloom: true, fps: 0, skyline: 90, cityDetail: 0.8, motion: false },
};

export interface DeviceSignals {
  reducedMotion: boolean;
  coarsePointer: boolean;
  dpr: number;
  cores: number;
  memory: number; // GB, 0 when unknown
  shortSide: number;
  override: string | null;
}

export function pickTier(s: DeviceSignals): TierName {
  if (s.override === 'high' || s.override === 'standard' || s.override === 'low' || s.override === 'static') return s.override;
  if (s.reducedMotion) return 'static';
  const weak = (s.cores > 0 && s.cores <= 4) || (s.memory > 0 && s.memory <= 4);
  if (s.coarsePointer) return weak || s.shortSide < 420 ? 'low' : 'standard';
  if (weak) return 'low';
  return s.cores >= 8 ? 'high' : 'standard';
}

export function readSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    dpr: window.devicePixelRatio || 1,
    cores: nav.hardwareConcurrency ?? 0,
    memory: nav.deviceMemory ?? 0,
    shortSide: Math.min(window.innerWidth, window.innerHeight),
    override: new URLSearchParams(location.search).get('q'),
  };
}

export function hasWebGL2(): boolean {
  if (new URLSearchParams(location.search).get('webgl') === '0') return false; // QA: the page without the desk
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Frame-time watcher: asks for a lower pixel ratio, then a lower tier, when frames stay slow. */
export class FrameBudget {
  private acc = 0;
  private n = 0;
  private cooldown = 2.5;
  private strikes = 0;

  /** returns 'dpr' to lower the pixel ratio, 'tier' to drop effects, or null */
  sample(rawDt: number, hidden: boolean, target = 1 / 45): 'dpr' | 'tier' | null {
    // hitches from hidden tabs, sleep or window drags say nothing about GPU load
    if (rawDt > 0.1 || hidden) {
      this.acc = 0;
      this.n = 0;
      this.cooldown = Math.max(this.cooldown, 1);
      return null;
    }
    if (this.cooldown > 0) {
      this.cooldown -= rawDt;
      return null;
    }
    this.acc += rawDt;
    this.n++;
    if (this.n < 90) return null;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (avg <= target) {
      this.strikes = 0;
      return null;
    }
    this.cooldown = 2;
    this.strikes++;
    return this.strikes >= 3 ? 'tier' : 'dpr';
  }
}
