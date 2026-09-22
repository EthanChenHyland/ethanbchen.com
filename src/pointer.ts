/** Small contextual labels and bounded magnetic links; the native cursor remains intact. */
export function setupPointer(signal:AbortSignal):void{
  const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const label=document.createElement('span');label.className='pointer-note mono';label.setAttribute('aria-hidden','true');document.body.append(label);
  let frame=0,x=0,y=0,tx=0,ty=0,shown=false,magnet:HTMLElement|null=null;
  const reset=()=>{shown=false;label.classList.remove('is-visible');if(magnet){magnet.style.translate='';magnet=null}};
  const draw=()=>{frame=0;if(signal.aborted||!shown)return;x+=(tx-x)*.22;y+=(ty-y)*.22;label.style.transform=`translate3d(${x}px,${y}px,0)`;if(Math.abs(tx-x)+Math.abs(ty-y)>.2)frame=requestAnimationFrame(draw)};
  document.addEventListener('pointermove',event=>{
    if(!fine.matches||reduced.matches||event.pointerType==='touch'){reset();return}
    const target=event.target instanceof Element?event.target:null;
    const region=target?.closest('.name-stage,.repo-object,.project-world,.overlay-mat,.avoid-art,.frog-signature');
    const text=region?.matches('.name-stage')?'DISTURB':region?.matches('.repo-object')?(innerWidth < 701 ? 'INSPECT' : 'DRAG / INSPECT'):region?.matches('.project-world')?'DRAG / TURN':region?.matches('.avoid-art')?'ENTER THE STORY':region?.matches('.frog-signature')?'FOUND YOU.':'';
    label.textContent=text;shown=!!text;label.classList.toggle('is-visible',shown);tx=Math.min(innerWidth-145,event.clientX+18);ty=event.clientY+22;if(shown&&!frame)frame=requestAnimationFrame(draw);
    const link=target?.closest<HTMLElement>('.masthead nav a,.project-link,.fold-story,.disturb-identity');
    if(link!==magnet){if(magnet)magnet.style.translate='';magnet=link||null}
    if(magnet){const r=magnet.getBoundingClientRect();magnet.style.translate=`${(event.clientX-r.left-r.width/2)*.08}px ${(event.clientY-r.top-r.height/2)*.12}px`}
  },{passive:true,signal});
  document.addEventListener('pointerleave',reset,{signal});window.addEventListener('scroll',reset,{passive:true,signal});reduced.addEventListener('change',reset,{signal});
  signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);reset();label.remove()},{once:true});
}
