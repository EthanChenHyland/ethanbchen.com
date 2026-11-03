import * as THREE from 'three';
import type { Tier } from '../quality';
import type { View } from './CameraRig';

export interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tier: Tier;
  /** shared clock for shaders */
  uTime: { value: number };
}

/** Something on the desk the visitor can point at. */
export interface Piece {
  id: string;
  group: THREE.Object3D;
  /** invisible, generous mesh used for raycasting */
  hit: THREE.Object3D;
  /** where the hero label sits */
  anchor: THREE.Vector3;
  update(time: number, dt: number): void;
  setActive?(active: boolean): void;
  setHover?(hover: boolean): void;
}

export interface Framing { landscape: View; portrait: View }

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function hitBox(id: string, w: number, h: number, d: number, at: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.position.copy(at);
  mesh.userData.pieceId = id;
  return mesh;
}

// Adapted from 4elements / apps/opus-5.5/src/gl/patch.js (MIT, see THIRD_PARTY_NOTICES.md):
// inject GLSL into built-in materials while keeping three's lighting, shadows and fog.
let uid = 0;
export function patchMaterial<T extends THREE.Material>(material: T, opts: {
  uniforms?: Record<string, { value: unknown }>;
  vertexHeader?: string; fragmentHeader?: string;
  vertex?: Record<string, string>; fragment?: Record<string, string>;
}): T {
  const key = `patched-${uid++}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.uniforms ?? {});
    if (opts.vertexHeader) shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${opts.vertexHeader}`);
    if (opts.fragmentHeader) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${opts.fragmentHeader}`);
    for (const [chunk, code] of Object.entries(opts.vertex ?? {})) shader.vertexShader = shader.vertexShader.replace(`#include <${chunk}>`, code);
    for (const [chunk, code] of Object.entries(opts.fragment ?? {})) shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, code);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// "Hash without Sine" by Dave Hoskins (MIT), as used in 4elements' gl/glsl.js.
export const hashGLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`;

/** Deterministic PRNG so the desk is arranged the same way on every visit. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const FONT = '"Switzer", "Helvetica Neue", Arial, sans-serif';
// taste-skill-ignore: used only for literal JSON drawn on the printer's paper
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'; // taste-skill-ignore

export const mat = {
  graphite: () => new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.6 }),
  darkMetal: () => new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.38, metalness: 0.85 }),
  matte: (color: number, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
};
