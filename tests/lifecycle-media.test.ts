import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

// Exercise real materials/math and production lifecycle code with deferred I/O.
let env;
class Element extends EventTarget {
  children=[];style={};classes=new Set();attributes={};
  classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};
  append(child){this.children.push(child);child.parent=this}
  before(child){env.document.body.append(child)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this)}
  setAttribute(key,value){this.attributes[key]=value}
  closest(){return this.surface}
  getBoundingClientRect(){return {left:10,top:20,right:210,bottom:120,width:200,height:100}}
}
function owned(resource,kind){
  resource.disposals=0;resource.addEventListener('dispose',()=>resource.disposals++);
  env[kind].push(resource);return resource;
}
class Renderer {
  domElement=new Element();disposals=0;renders=0;pixelRatio=1;
  constructor(){env.renderers.push(this)}
  setClearColor(){}setSize(){}
  setPixelRatio(value){this.pixelRatio=value}getPixelRatio(){return this.pixelRatio}
  render(){this.renders++}dispose(){this.disposals++}
}
class TextureLoader {
  load(url,resolve,progress,reject){
    const texture=owned(new THREE.Texture(),'textures');
    env.requests.push({url,resolve:()=>resolve(texture),reject});return texture;
  }
}
class Geometry extends THREE.PlaneGeometry {constructor(...args){super(...args);owned(this,'geometries')}}
class Material extends THREE.ShaderMaterial {constructor(...args){super(...args);owned(this,'materials')}}
globalThis.__lifecycleMediaThree={...THREE,WebGLRenderer:Renderer,TextureLoader,PlaneGeometry:Geometry,ShaderMaterial:Material};
registerHooks({
  resolve(specifier,context,next){
    if(specifier==='three'&&context.parentURL?.endsWith('/src/media-webgl.ts'))return {url:'lifecycle:media-three',shortCircuit:true};
    if(specifier==='./media-webgl')return {url:new URL('../src/media-webgl.ts',import.meta.url).href,shortCircuit:true};
    return next(specifier,context);
  },
  load(url,context,next){
    if(url==='lifecycle:media-three')return {format:'module',source:`const mock=globalThis.__lifecycleMediaThree;${Object.keys(globalThis.__lifecycleMediaThree).map(key=>`export const ${key}=mock.${key};`).join('')}`,shortCircuit:true};
    return next(url,context);
  },
});
const {createMediaStage}=await import('../src/media-webgl.ts');
const {setupMediaStage}=await import('../src/media-stage.ts');
function fixture(){
  env={renderers:[],textures:[],materials:[],geometries:[],requests:[],observers:[],frames:new Map(),nextFrame:0};
  env.document=new EventTarget();env.document.body=new Element();env.document.hidden=false;
  env.images=[new Element(),new Element()];env.images.forEach((image,i)=>{image.src=`image-${i}`;image.surface=new Element()});
  env.buttons=[new Element(),new Element(),new Element()];
  env.document.querySelectorAll=selector=>selector==='[data-channel]'?env.buttons:selector==='.avoid-art img'?env.images.slice(1):env.images;
  env.document.createElement=()=>new Element();
  env.reduced=new EventTarget();env.reduced.matches=false;
  class Observer {
    disconnected=false;
    constructor(callback){this.callback=callback;env.observers.push(this)}
    observe(){}disconnect(){this.disconnected=true}
  }
  Object.assign(globalThis,{document:env.document,window:new EventTarget(),innerWidth:1000,innerHeight:800,devicePixelRatio:1,
    matchMedia:()=>env.reduced,ResizeObserver:Observer,IntersectionObserver:Observer,
    requestAnimationFrame:callback=>{const id=++env.nextFrame;env.frames.set(id,callback);return id},cancelAnimationFrame:id=>env.frames.delete(id)});
  return new AbortController();
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function toggle(value){env.reduced.matches=value;env.reduced.dispatchEvent(new Event('change'))}
function assertReleased(){
  for(const kind of ['renderers','textures','materials','geometries'])for(const resource of env[kind])assert.equal(resource.disposals,1,`${kind} disposed exactly once`);
  assert.equal(env.document.body.children.length,0);assert.equal(env.frames.size,0);
  assert.ok(env.images.every(image=>!image.classList.contains('gpu-media-ready')));
}

test('media: pre-abort allocates nothing; abort during textures settles promptly and ignores late success',async()=>{
  const parent=fixture();parent.abort();await createMediaStage(env.images,parent.signal);assert.equal(env.renderers.length,0);
  const active=new AbortController();const pending=createMediaStage(env.images,active.signal);
  active.abort();const dispose=await pending;assertReleased();
  env.requests.forEach(request=>request.resolve());await flush();dispose();assertReleased();assert.equal(env.materials.length,0);
});

test('media: a failed texture cleans successful siblings, failed texture, and pending siblings',async()=>{
  const parent=fixture();env.images.push(new Element());env.images[2].src='late';
  const pending=createMediaStage(env.images,parent.signal);
  env.requests[0].resolve();await flush();assert.equal(env.materials.length,1);
  env.requests[1].reject(new Error('texture failed'));
  await assert.rejects(pending,/texture failed/);assertReleased();
  env.requests[2].resolve();await flush();parent.abort();assertReleased();assert.equal(env.materials.length,1);
});

test('media: context loss during loading releases resources and suppresses late setup',async()=>{
  const parent=fixture();const pending=createMediaStage(env.images,parent.signal);
  env.renderers[0].domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
  await pending;env.requests.forEach(request=>request.resolve());await flush();assertReleased();
});

test('media: reduced-motion races retain one canvas, one button, and one set of working listeners',async()=>{
  const parent=fixture();setupMediaStage(parent.signal);
  env.observers[0].callback([{isIntersecting:true}]);await flush();assert.equal(env.requests.length,1);
  toggle(true);assertReleased();toggle(false);await flush();assert.equal(env.requests.length,2);
  env.requests.slice(1).forEach(request=>request.resolve());await flush();
  env.requests.slice(0,1).forEach(request=>request.resolve());await flush();
  assert.equal(env.document.body.children.length,2);
  const button=env.document.body.children.find(child=>child.className==='fold-story mono');
  button.dispatchEvent(new Event('click'));assert.equal(button.attributes['aria-pressed'],'true');
  toggle(true);assertReleased();
  button.dispatchEvent(new Event('click'));assert.equal(button.attributes['aria-pressed'],'true');
  toggle(false);await flush();env.requests.slice(2).forEach(request=>request.resolve());await flush();
  assert.equal(env.document.body.children.length,2);parent.abort();assertReleased();
  env.observers[0].callback([{isIntersecting:true}]);await flush();assert.equal(env.renderers.length,3);
});

test('media: hidden cancels and resets RAF; visible resumes; clipping is preserved',async()=>{
  const parent=fixture();const pending=createMediaStage(env.images,parent.signal);
  env.requests.forEach(request=>request.resolve());const dispose=await pending;
  assert.equal(env.frames.size,1);
  env.document.hidden=true;env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(env.frames.size,0);
  env.document.hidden=false;env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(env.frames.size,1);
  const [id,draw]=env.frames.entries().next().value;env.frames.delete(id);draw();
  assert.deepEqual(env.materials[0].uniforms.uClip.value.toArray(),[10,680,210,780]);
  assert.deepEqual([env.geometries[0].parameters.widthSegments,env.geometries[0].parameters.heightSegments],[44,28]);
  assert.equal(env.renderers[0].renders,1);dispose();dispose();parent.abort();assertReleased();
  window.dispatchEvent(new Event('scroll'));assert.equal(env.frames.size,0);
});

test('media: setup failure after listeners were installed removes fallback classes and controls',async()=>{
  const parent=fixture();env.images[1].surface=undefined;
  const pending=createMediaStage(env.images,parent.signal);env.requests.forEach(request=>request.resolve());
  await assert.rejects(pending);assertReleased();
  env.images[0].surface.dispatchEvent(new Event('pointerleave'));assert.equal(env.frames.size,0);
});

test('media: abort or reduced motion before import completion never starts stale work',async()=>{
  const parent=fixture();setupMediaStage(parent.signal);env.observers[0].callback([{isIntersecting:true}]);
  toggle(true);toggle(false);toggle(true);await flush();assert.equal(env.renderers.length,0);
  toggle(false);parent.abort();await flush();assert.equal(env.renderers.length,0);
  assert.ok(env.observers.every(observer=>observer.disconnected));
  const aborted=fixture();aborted.abort();setupMediaStage(aborted.signal);assert.equal(env.observers.length,0);
});

test('media: parent abort after textures resolve prevents ready classes and event installation',async()=>{
  const parent=fixture();setupMediaStage(parent.signal);env.observers[0].callback([{isIntersecting:true}]);await flush();
  env.requests.forEach(request=>request.resolve());parent.abort();await flush();assertReleased();
  assert.equal(env.materials.length,0);assert.ok(env.observers.every(observer=>observer.disconnected));
});

test('media: repeated setup replaces observers and listeners without an old parent stopping the replacement',async()=>{
  const parent=fixture();setupMediaStage(parent.signal);env.observers[0].callback([{isIntersecting:true}]);await flush();
  const replacement=new AbortController();setupMediaStage(replacement.signal);
  assert.equal(env.observers[0].disconnected,true);assertReleased();
  toggle(true);toggle(false);await flush();assert.equal(env.requests.length,2);
  parent.abort();env.requests.forEach(request=>request.resolve());await flush();
  assert.equal(env.document.body.children.length,2);assert.equal(env.renderers[1].disposals,0);
  replacement.abort();assertReleased();
});
