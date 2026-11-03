// Adapted from 4elements / apps/opus-5.5/src/fx/PostFX.js
// Copyright (c) 2026 ElementBench contributors. MIT License; full notice in THIRD_PARTY_NOTICES.md.
// Changes: no heat haze or chromatic aberration; a restrained bloom that can be switched off per
// tier; the finish pass keeps vignette, grain and the fade, and gains a scene dim for the ending.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Display-space stage: vignette + film grain (also dithers away banding) + fade.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.03 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFade;
    varying vec2 vUv;
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 c = vUv - 0.5;
      c.x *= uResolution.x / uResolution.y;
      float v = smoothstep(1.2, 0.18, length(c));
      col *= mix(1.0 - uVignette, 1.0, v);
      float g = ign(gl_FragCoord.xy + fract(uTime * 7.13) * 911.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - dot(col, vec3(0.333))));
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;
  readonly finish: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, bloom: boolean) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: renderer.getPixelRatio() < 1.5 ? 4 : 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.9);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  setBloom(on: boolean) {
    if (this.bloom) this.bloom.enabled = on;
  }

  setSize(w: number, h: number, dpr: number) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.finish.uniforms.uResolution.value.set(w * dpr, h * dpr);
  }

  render(time: number, dt: number) {
    this.finish.uniforms.uTime.value = time;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
