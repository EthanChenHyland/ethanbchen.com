import test from 'node:test';
import assert from 'node:assert/strict';
import { setupChapterNavigation } from '../src/navigation.ts';

test('chapter navigation preserves native scrolling, corrects layout shifts, and releases on input', async () => {
  const keys = ['window','document','location','scrollY','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const host = new EventTarget();
  let y = 0, top = 500, callback = () => {}, next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const scrolls: number[] = [];
  const section = { matches: () => true, getBoundingClientRect: () => ({ top: top-y }) };
  const controller = new AbortController();
  const define = (key: string, value: unknown) => Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  try {
    define('window',Object.assign(host,{scrollTo:({top: value}:{top:number})=>{y=value;scrolls.push(value);define('scrollY',y);},setTimeout,clearTimeout}));
    define('scrollY',y);define('location',{hash:'#piano'});
    define('document',{body:{},documentElement:{},fonts:{ready:Promise.resolve()},getElementById:()=>section});
    define('getComputedStyle',()=>({scrollPaddingTop:'30px'}));
    define('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++next,fn);return next;});
    define('cancelAnimationFrame',(id:number)=>frames.delete(id));
    define('ResizeObserver',class {constructor(fn:()=>void){callback=fn;}observe(){}disconnect(){}});
    const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0));};
    setupChapterNavigation(controller.signal);await Promise.resolve();flush();
    assert.deepEqual(scrolls,[470]);
    top=1000;host.dispatchEvent(new Event('hashchange'));flush();
    assert.deepEqual(scrolls,[470],'hash navigation must not snap native smooth scrolling');
    callback();flush();assert.equal(scrolls.length,1,'unrelated resize must not snap');
    top=1100;callback();flush();assert.equal(scrolls.at(-1),1070,'loading shift adjusts destination');
    host.dispatchEvent(new Event('wheel'));top=1200;callback();flush();assert.equal(scrolls.length,2,'manual scroll releases alignment');
    controller.abort();top=1300;callback();flush();assert.equal(scrolls.length,2,'late observer work after teardown is inert');
  } finally {
    controller.abort();
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
