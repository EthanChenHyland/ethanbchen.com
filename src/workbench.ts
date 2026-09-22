import { knightSketch } from './knight';
/** A movable index: six actual projects, one shared inspection surface. */
export function setupWorkbench(parent:AbortSignal):void{
  const section=document.querySelector<HTMLElement>('#experiments');
  if(!section)return;
  const records=[...section.querySelectorAll<HTMLDetailsElement>('details')].map(el=>({el,title:el.querySelector('h3')!.textContent!,body:el.querySelector('.experiment-body')!.innerHTML}));
  if(!records.length)return;
  const root=document.createElement('div');root.className='repo-workbench';
  root.innerHTML=`<div class="bench-top mono"><span>LOOSE ENDS / WORKING SYSTEMS</span><button type="button" class="bench-shuffle">REARRANGE ↗</button></div><div class="bench-space" aria-label="Movable project index"><svg class="bench-wires" aria-hidden="true"></svg><span class="bench-origin" aria-hidden="true">+</span></div><div class="bench-inspector"><div class="bench-inspector-heading"><span class="mono">UNDER THE LENS</span><h3></h3></div><div class="bench-copy"></div></div><p class="bench-hint mono">DRAG THE NAMES. FOLLOW A CONNECTION. / SELECT TO INSPECT.</p>`;
  records[0].el.before(root);records.forEach(r=>r.el.hidden=true);
  const space=root.querySelector<HTMLElement>('.bench-space')!,wires=root.querySelector<SVGSVGElement>('.bench-wires')!,copy=root.querySelector<HTMLElement>('.bench-copy')!,heading=root.querySelector<HTMLElement>('.bench-inspector-heading h3')!;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)'),small=matchMedia('(max-width:700px)');
  const lifetime=new AbortController(),signal=lifetime.signal;
  const positions=[[.05,.06],[.48,.04],[.14,.38],[.63,.39],[.02,.72],[.56,.75]];
  const marks=['↔','♞','⌖','⊞','↳','≡'];
  const nodes=records.map((record,i)=>{const button=document.createElement('button');button.type='button';button.className='repo-object';button.innerHTML=`<span class="repo-object-number mono">0${i+1} / ${marks[i]}</span><span>${record.title}</span>`;button.setAttribute('aria-pressed','false');space.append(button);return {button,x:0,y:0,vx:0,vy:0,width:0,height:0}});
  let selected=0,frame=0,active=true,dead=false,drag:{index:number,x:number,y:number,lastX:number,lastY:number,moved:boolean}|null=null,suppressedClick:{index:number,until:number}|null=null;
  function select(index:number){selected=index;heading.textContent=records[index].title;copy.innerHTML=records[index].body;if(index===1)copy.append(knightSketch());nodes.forEach((n,i)=>n.button.setAttribute('aria-pressed',String(i===index)));root.dataset.selected=String(index);paint()}
  function paint(){
    const bounds=space.getBoundingClientRect(),cx=bounds.width*.5,cy=bounds.height*.5;
    wires.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    wires.innerHTML=nodes.map((n,i)=>{n.button.style.transform=`translate3d(${n.x}px,${n.y}px,0) rotate(${small.matches?0:(i%2?1:-1)*2}deg)`;const x=n.x+n.width/2,y=n.y+n.height/2;return `<path d="M${cx},${cy} Q${cx},${y} ${x},${y}" class="${i===selected?'selected':''}"/>`}).join('');
  }
  function constrain(n:typeof nodes[number]){n.x=Math.max(0,Math.min(n.x,space.clientWidth-n.width));n.y=Math.max(0,Math.min(n.y,space.clientHeight-n.height))}
  function arrange(shift=0){root.querySelector('.bench-shuffle')!.textContent=small.matches?'NEXT PROJECT ↗':'REARRANGE ↗';root.querySelector('.bench-hint')!.textContent=small.matches?'SELECT A NAME. FOLLOW THE QUESTION.':'DRAG THE NAMES · ARROW KEYS TO MOVE · SELECT TO INSPECT';nodes.forEach((n,i)=>{n.width=n.button.offsetWidth;n.height=n.button.offsetHeight;const p=positions[(i+shift)%nodes.length];n.x=p[0]*(space.clientWidth-n.width);n.y=p[1]*(space.clientHeight-n.height);n.vx=n.vy=0;if(small.matches){n.x=(i%2)*(space.clientWidth/2);n.y=Math.floor(i/2)*88}constrain(n)});paint()}
  function tick(){frame=0;if(dead||!active||document.hidden)return;let moving=false;nodes.forEach((n,i)=>{if(drag?.index===i)return;n.x+=n.vx;n.y+=n.vy;n.vx*=.91;n.vy*=.91;const x=n.x,y=n.y;constrain(n);if(x!==n.x)n.vx*=-.55;if(y!==n.y)n.vy*=-.55;if(Math.abs(n.vx)+Math.abs(n.vy)>.08)moving=true});paint();if(moving)wake()}
  function wake(){if(!frame&&!dead&&active&&!reduced.matches)frame=requestAnimationFrame(tick)}
  nodes.forEach((n,index)=>{
    n.button.addEventListener('click',e=>{if(e.detail>0&&suppressedClick?.index===index&&performance.now()<suppressedClick.until){suppressedClick=null;return}suppressedClick=null;select(index)},{signal});
    n.button.addEventListener('pointerdown',e=>{if(small.matches||reduced.matches)return;n.button.setPointerCapture(e.pointerId);drag={index,x:e.clientX-n.x,y:e.clientY-n.y,lastX:e.clientX,lastY:e.clientY,moved:false};n.vx=n.vy=0},{signal});
    n.button.addEventListener('pointermove',e=>{if(!drag||drag.index!==index)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.abs(e.clientX-drag.x-n.x)+Math.abs(e.clientY-drag.y-n.y)>3)drag.moved=true;if(drag.moved){n.button.setPointerCapture(e.pointerId);n.x=e.clientX-drag.x;n.y=e.clientY-drag.y;n.vx=Math.max(-15,Math.min(15,dx));n.vy=Math.max(-15,Math.min(15,dy));constrain(n);paint()}drag.lastX=e.clientX;drag.lastY=e.clientY},{signal});
    const release=()=>{if(!drag)return;suppressedClick=drag.moved?{index,until:performance.now()+350}:null;drag=null;wake()};
    n.button.addEventListener('pointerup',release,{signal});n.button.addEventListener('pointercancel',release,{signal});
    n.button.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow')||small.matches)return;e.preventDefault();if(e.key==='ArrowLeft')n.x-=16;if(e.key==='ArrowRight')n.x+=16;if(e.key==='ArrowUp')n.y-=16;if(e.key==='ArrowDown')n.y+=16;constrain(n);paint()},{signal});
  });
  let shift=0;root.querySelector('.bench-shuffle')!.addEventListener('click',()=>{shift=(shift+1)%nodes.length;if(small.matches)select((selected+1)%nodes.length);else arrange(shift)},{signal});
  const resize=new ResizeObserver(()=>arrange(shift));resize.observe(space);
  const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active)wake();else{cancelAnimationFrame(frame);frame=0}});observer.observe(root);
  reduced.addEventListener('change',()=>{nodes.forEach(n=>n.vx=n.vy=0);cancelAnimationFrame(frame);frame=0;arrange(shift)},{signal});
  parent.addEventListener('abort',()=>{dead=true;lifetime.abort();resize.disconnect();observer.disconnect();cancelAnimationFrame(frame)},{once:true});
  arrange();select(0);
}
