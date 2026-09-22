import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transpileModule, ModuleKind } from 'typescript';
import * as THREE from 'three';

const deferred = () => {
  let resolve!: (value?: unknown) => void;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let serial = 0;
async function load(file: string, replacement: string, dependency: string) {
  const source = await readFile(new URL(`../src/${file}.ts`, import.meta.url), 'utf8');
  const js = transpileModule(source.replace(dependency, replacement), { compilerOptions: { module: ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js + `\n// ${serial++}`).toString('base64')}`);
}

function environment(t: test.TestContext) {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const put = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  t.after(() => { for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  } });
  class Element extends EventTarget {
    textContent = '';
    dataset = {};
    classes = new Set<string>();
    children = new Set<Element>();
    classList = { add: (s: string) => this.classes.add(s), remove: (s: string) => this.classes.delete(s) };
    setAttribute() {}
    append(child: Element) { this.children.add(child); }
    remove() { stage.children.delete(this); }
    getBoundingClientRect() { return { width: 2, height: 2, top: 0, left: 0 }; }
    querySelector() { return new Element(); }
  }
  const hero = new Element(), stage = new Element(), trigger = new Element();
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const fonts = deferred();
  const document = Object.assign(new EventTarget(), {
    fonts: { ready: fonts.promise }, hidden: false,
    querySelector: (selector: string) => selector === '.hero' ? hero : selector === '.name-stage' ? stage : trigger,
    createElement: () => ({ width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: new Uint8Array(16) }) }) }),
    createTreeWalker: () => ({ nextNode: () => false }),
  });
  const frames = new Map<number, (now: number) => void>();
  let nextFrame = 0;
  const observers: Observer[] = [];
  class Observer {
    disconnected = false;
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const resources: { disposed: number }[] = [];
  class Geometry extends THREE.BufferGeometry {
    disposed = 0;
    constructor() { super(); resources.push(this); }
    dispose() { this.disposed++; super.dispose(); }
  }
  class Material extends THREE.ShaderMaterial {
    disposed = 0;
    constructor(parameters: THREE.ShaderMaterialParameters) { super(parameters); resources.push(this); }
    dispose() { this.disposed++; super.dispose(); }
  }
  const renderers: Renderer[] = [];
  class Renderer {
    domElement = new Element();
    disposed = 0;
    constructor() { renderers.push(this); }
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    forces: number[] = [];
    render(scene: THREE.Scene) { this.forces.push((scene.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.uForce.value); }
    dispose() { this.disposed++; }
  }
  put('document', document); put('window', new EventTarget());
  put('matchMedia', () => reduced); put('devicePixelRatio', 1); put('innerWidth', 1000);
  put('NodeFilter', { SHOW_TEXT: 4 });
  put('ResizeObserver', Observer); put('IntersectionObserver', Observer);
  put('requestAnimationFrame', (fn: (now: number) => void) => { frames.set(++nextFrame, fn); return nextFrame; });
  put('cancelAnimationFrame', (id: number) => frames.delete(id));
  put('__heroThree', { ...THREE, WebGLRenderer: Renderer, BufferGeometry: Geometry, ShaderMaterial: Material });
  return { put, hero, stage, trigger, reduced, fonts, document, frames, observers, renderers, resources };
}
const webgl = () => load('hero-webgl', 'const THREE = globalThis.__heroThree;', "import * as THREE from 'three';");

test('abort settles the fonts wait without allocating WebGL resources', async t => {
  const env = environment(t);
  const { createIdentityField } = await webgl();
  const parent = new AbortController();
  const pending = createIdentityField(env.hero, env.stage, env.trigger, parent.signal);
  parent.abort();
  const cleanup = await pending;
  env.fonts.resolve(); await flush(); cleanup();
  assert.equal(env.renderers.length, 0);
});

test('partial initialization failure releases renderer, observers, listeners and frames', async t => {
  const env = environment(t);
  env.document.createElement = () => { throw new Error('canvas unavailable'); };
  const { createIdentityField } = await webgl();
  env.fonts.resolve();
  await assert.rejects(createIdentityField(env.hero, env.stage, env.trigger, new AbortController().signal), /canvas unavailable/);
  env.trigger.dispatchEvent(new Event('click'));
  assert.equal(env.renderers[0].disposed, 1);
  assert.ok(env.resources.every(resource => resource.disposed === 1));
  assert.equal(env.stage.children.size, 0);
  assert.ok(env.observers.every(o => o.disconnected));
  assert.equal(env.frames.size, 0);
  assert.equal(env.trigger.textContent, 'SIGNAL / TRACE');
});

test('successful initialization disposes idempotently and ignores queued observer work', async t => {
  const env = environment(t);
  const { createIdentityField } = await webgl();
  env.fonts.resolve();
  const parent = new AbortController();
  const dispose = await createIdentityField(env.hero, env.stage, env.trigger, parent.signal);
  assert.ok(env.stage.classes.has('identity-ready'));
  assert.equal(env.stage.children.size, 1);
  parent.abort(); dispose();
  for (const observer of env.observers) observer.callback();
  env.trigger.dispatchEvent(new Event('click'));
  assert.equal(env.renderers[0].disposed, 1);
  assert.ok(env.resources.every(resource => resource.disposed === 1));
  assert.ok(env.observers.every(o => o.disconnected));
  assert.equal(env.frames.size, 0);
  assert.equal(env.stage.children.size, 0);
  assert.equal(env.stage.classes.has('identity-ready'), false);
});

test('off/on restarts pending work, stale completion is disposed, repeated setup replaces listeners', async t => {
  const env = environment(t);
  const attempts: { signal: AbortSignal; done: ReturnType<typeof deferred>; disposed: number }[] = [];
  env.put('__heroLoad', async (_h: unknown, _s: unknown, _t: unknown, signal: AbortSignal) => {
    const attempt = { signal, done: deferred(), disposed: 0 };
    attempts.push(attempt);
    await attempt.done.promise;
    return () => { attempt.disposed++; };
  });
  const { setupHeroField } = await load('hero-field', '({ createIdentityField: globalThis.__heroLoad })', "import('./hero-webgl')");
  const parent = new AbortController();
  setupHeroField(parent.signal); await flush();
  env.reduced.matches = true; env.reduced.dispatchEvent(new Event('change'));
  assert.ok(attempts[0].signal.aborted);
  env.reduced.matches = false; env.reduced.dispatchEvent(new Event('change')); await flush();
  assert.equal(attempts.length, 2);
  attempts[0].done.resolve(); await flush();
  assert.equal(attempts[0].disposed, 1);
  attempts[1].done.resolve(); await flush();
  setupHeroField(parent.signal); await flush();
  assert.equal(attempts[1].disposed, 1);
  assert.equal(attempts.length, 3);
  env.reduced.matches = true; env.reduced.dispatchEvent(new Event('change'));
  env.reduced.matches = false; env.reduced.dispatchEvent(new Event('change')); await flush();
  assert.equal(attempts.length, 4);
  parent.abort();
  for (const attempt of attempts.slice(2)) attempt.done.resolve();
  await flush();
  assert.ok(attempts.every(a => a.signal.aborted && a.disposed === 1));
  env.reduced.dispatchEvent(new Event('change')); await flush();
  assert.equal(attempts.length, 4);
});


test('stationary pointer settles, movement restarts, and visibility cancels and resumes frames', async t => {
  const env = environment(t);
  const { createIdentityField } = await webgl();
  env.fonts.resolve();
  const dispose = await createIdentityField(env.hero, env.stage, env.trigger, new AbortController().signal);
  const move = () => env.stage.dispatchEvent(Object.assign(new Event('pointermove'), {
    pointerType: 'mouse', clientX: 1, clientY: 1,
  }));
  let now = performance.now();
  const tick = () => {
    const pending = [...env.frames.entries()];
    env.frames.clear();
    now += 16;
    for (const [, callback] of pending) callback(now);
  };
  move();
  for (let i = 0; i < 10; i++) tick();
  assert.equal(env.frames.size, 1, 'movement animates initially');
  for (let i = 0; i < 200 && env.frames.size; i++) tick();
  assert.equal(env.frames.size, 0, 'idle pointer stops rendering');
  move();
  assert.equal(env.frames.size, 1, 'new movement wakes the field');
  env.document.hidden = true;
  env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.frames.size, 0, 'hiding cancels pending frames');
  move();
  assert.equal(env.frames.size, 0, 'hidden interactions cannot schedule frames');
  env.document.hidden = false;
  env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.frames.size, 1, 'showing resumes with a cleared frame handle');
  dispose();
  assert.equal(env.frames.size, 0);
});


test('button pulse reaches global excitation then settles; ordinary pointer stays local', async t => {
  const env = environment(t);
  let now = 0;
  env.put('performance', { now: () => now });
  const { createIdentityField } = await webgl();
  env.fonts.resolve();
  const dispose = await createIdentityField(env.hero, env.stage, env.trigger, new AbortController().signal);
  const tick = () => {
    const callbacks = [...env.frames.values()];env.frames.clear();now += 16;
    callbacks.forEach(callback => callback(now));
  };
  env.stage.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse', clientX: 1, clientY: 1 }));
  for (let i = 0; i < 200 && env.frames.size; i++) tick();
  assert.ok(env.renderers[0].forces.every(force => force <= 1));
  env.renderers[0].forces.length = 0;
  env.trigger.dispatchEvent(new Event('click'));
  for (let i = 0; i < 200 && env.frames.size; i++) tick();
  assert.ok(Math.max(...env.renderers[0].forces) > 1.6, 'button reaches full-name force');
  assert.equal(env.frames.size, 0, 'button pulse also settles');
  dispose();
});
