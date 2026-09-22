const stages=new WeakMap<Document,()=>void>();

/** Two project surfaces share one viewport renderer and keep their DOM image fallbacks. */
export function setupMediaStage(signal:AbortSignal):void{
  if(signal.aborted)return;
  stages.get(document)?.();
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const images=[...document.querySelectorAll<HTMLImageElement>('.avoid-art img')];
  let cleanup:(()=>void)|undefined,attempt:AbortController|undefined;
  let stopped=false;
  function cancel(){
    const pending=attempt;attempt=undefined;
    pending?.abort();cleanup?.();cleanup=undefined;
  }
  async function load(){
    if(stopped||attempt||cleanup||reduced.matches||signal.aborted)return;
    const current=new AbortController();attempt=current;
    try{
      const {createMediaStage}=await import('./media-webgl');
      if(current.signal.aborted)return;
      const dispose=await createMediaStage(images,current.signal,images.map(()=>'story'));
      if(current.signal.aborted||signal.aborted||reduced.matches||attempt!==current)dispose();
      else cleanup=dispose;
    }catch{/* Actual DOM media remains visible. */}
    finally{if(attempt===current)attempt=undefined}
  }
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void load()},{rootMargin:'250px'});images.forEach(i=>observer.observe(i));
  const preference=()=>{if(reduced.matches)cancel();else void load()};
  function stop(){
    if(stopped)return;stopped=true;
    observer.disconnect();reduced.removeEventListener('change',preference);
    signal.removeEventListener('abort',stop);cancel();
    if(stages.get(document)===stop)stages.delete(document);
  }
  stages.set(document,stop);
  reduced.addEventListener('change',preference);
  signal.addEventListener('abort',stop,{once:true});
}
