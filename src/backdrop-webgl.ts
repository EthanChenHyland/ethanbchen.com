import * as THREE from 'three';

const stops = ['top', 'work', 'prompt-off', 'clarity', 'piano', 'avoid', 'experiments', 'about', 'contact'];
const names = ['ORIGIN', 'CURIOSITY', 'LANGUAGE', 'CONTEXT', 'SOUND', 'FEELING', 'THE LAB', 'THE PERSON', 'STILL BUILDING'];
const cards = [
  { code: '00', label: 'INDEX', title: 'FOUR WAYS IN', detail: 'LANGUAGE  /  CONTEXT  /  SOUND  /  FEELING', accent: '#315bff' },
  { code: '01', label: 'LANGUAGE', title: 'THE CONTRACT', detail: 'REPORT  →  SIX FINDINGS', accent: '#315bff' },
  { code: '02', label: 'CONTEXT', title: 'THE WINDOW', detail: 'SCREEN  +  YOU  +  THEM', accent: '#536fca' },
  { code: '03', label: 'SOUND', title: 'THE SCORE', detail: 'EXPECTED  ↔  CAPTURED', accent: '#516e56' },
  { code: '04', label: 'FEELING', title: 'THE STORY', detail: '28 CHAPTERS  /  NO SCORE', accent: '#b45b63' },
  { code: '05', label: 'THE LAB', title: 'OPEN FILES', detail: 'SYSTEMS  /  EXPERIMENTS', accent: '#6474b7' },
  { code: '06', label: 'THE PERSON', title: 'STILL CURIOUS', detail: 'NASHVILLE  /  VANDERBILT', accent: '#637c9a' },
] as const;

type ArchiveCard = { group: THREE.Group; face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; backing: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> };

function drawCard(index: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');canvas.width = 900;canvas.height = 610;
  const ctx = canvas.getContext('2d')!;
  const { code, label, title, detail, accent } = cards[index];
  const rule = (x1: number, y1: number, x2: number, y2: number, width = 2) => {
    ctx.lineWidth = width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  };
  const text = (value: string, x: number, y: number, size = 22, color = '#202223') => {
    ctx.fillStyle = color;ctx.font = `700 ${size}px Arial, sans-serif`;ctx.fillText(value,x,y);
  };
  ctx.fillStyle = '#faf9f3';ctx.fillRect(0,0,900,610);
  ctx.strokeStyle = accent;ctx.lineWidth = 3;ctx.strokeRect(12,12,876,586);
  ctx.fillStyle = accent;ctx.fillRect(12,12,876,70);
  text(`E.B.C.  /  FIELD NOTES`,42,58,22,'#fff');text(`${code}  /  ${label}`,637,58,20,'#fff');
  text(title,44,151,55);text(detail,45,194,20,accent);
  ctx.strokeStyle = '#adb6ba';rule(44,219,856,219,1);
  ctx.strokeStyle = accent;
  if (index === 0) {
    const labels = ['01  REPORT', '02  SCREEN', '03  SCORE', '04  STORY'];
    labels.forEach((item,i) => {const x=45+i*203;ctx.strokeRect(x,263,177,232);text(item,x+15,297,18,accent);text(['{ }','▣','♫','↗'][i],x+39,418,83,accent);rule(x+15,458,x+155,458,2);});
  } else if (index === 1) {
    ['ACL TEAR','MCL INJURY','MENISCUS','FRACTURE','ARTHRITIS','EFFUSION'].forEach((item,i) => {
      const y=254+i*43;ctx.strokeRect(45,y,810,34);text(String(i+1).padStart(2,'0'),58,y+25,18,accent);text(item,143,y+25,19);text(i===2?'UNCERTAIN':'NOT REPORTED',605,y+25,17,accent);
    });
  } else if (index === 2) {
    ctx.strokeRect(48,251,804,280);ctx.fillStyle=accent;ctx.fillRect(48,251,804,31);
    [68,87,106].forEach(x=>{ctx.beginPath();ctx.arc(x,266,5,0,Math.PI*2);ctx.fillStyle='#faf9f3';ctx.fill();});
    ctx.strokeStyle='#b7bdc9';ctx.strokeRect(84,309,320,173);ctx.strokeRect(430,309,383,173);
    ['SCREEN','YOU','THEM'].forEach((item,i)=>{const y=344+i*45;ctx.fillStyle=accent;ctx.fillRect(110,y-17,16,16);text(item,145,y,20);});
    text('READY WHEN YOU ARE',466,348,22,accent);rule(466,375,778,375);rule(466,410,750,410);rule(466,445,708,445);
  } else if (index === 3) {
    for (let row=0;row<2;row++) {
      const y=285+row*135;for(let i=0;i<5;i++)rule(58,y+i*17,836,y+i*17,2);
      for(let i=0;i<12;i++){const x=85+i*66;const noteY=y+((i*7+row*11)%5)*17;ctx.fillStyle=accent;ctx.beginPath();ctx.ellipse(x,noteY,13,9,-.3,0,Math.PI*2);ctx.fill();rule(x+12,noteY,x+12,noteY-55,3);}
    }
    text('0:00',58,539,17,accent);text('0:12',790,539,17,accent);
  } else if (index === 4) {
    for (let i=0;i<4;i++) {const x=55+i*194,y=260+(i%2)*30;ctx.save();ctx.translate(x+84,y+105);ctx.rotate((i-1.5)*.075);ctx.strokeRect(-77,-101,154,202);text(String(i*7+1).padStart(2,'0'),-56,-55,43,accent);rule(-56,-24,54,-24);rule(-56,6,38,6);rule(-56,36,50,36);ctx.restore();}
    rule(70,530,818,530,3);
  } else {
    const lines = index === 5 ? ['WINCODEX','FUN CHESS ENGINE','TOWERLOGIC','MOSAIC'] : ['COMPUTING','AI + SYSTEMS','PIANO + CHESS','FOLLOW THE QUESTION'];
    lines.forEach((item,i)=>{const y=281+i*65;text(String(i+1).padStart(2,'0'),58,y,20,accent);text(item,125,y,29);rule(125,y+13,836,y+13,1);});
  }
  ctx.strokeStyle = '#adb6ba';rule(44,559,856,559,1);
  text('ETHAN B. CHEN  /  ONGOING WORK',45,585,17,accent);text('NOTES  →  BUILDS',676,585,17,accent);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

/** A moving archive: each project enters as a legible object on the same stage. */
export function createBackdrop(parent: AbortSignal): void {
  if (parent.aborted) return;
  const lifetime = new AbortController(), signal = lifetime.signal;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.domElement.className = 'scene-backdrop';renderer.domElement.setAttribute('aria-hidden', 'true');document.body.append(renderer.domElement);
  renderer.setClearColor(0,0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(49,1,.1,100);
  camera.position.set(0,0,16);camera.lookAt(0,0,0);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const plane = new THREE.PlaneGeometry(8,5.42);geometries.push(plane);
  const archive: ArchiveCard[] = [];
  function loadArchive(){
    if(archive.length)return;
    cards.forEach((_,i)=>{
      const texture=drawCard(i);textures.push(texture);
      const faceMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});materials.push(faceMaterial);
      const backMaterial=new THREE.MeshBasicMaterial({color:cards[i].accent,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});materials.push(backMaterial);
      const group=new THREE.Group(),face=new THREE.Mesh(plane,faceMaterial),backing=new THREE.Mesh(plane,backMaterial);
      backing.position.set(.2,-.2,-.12);group.add(backing,face);scene.add(group);archive.push({group,face,backing});
    });
  }
  const guides=new THREE.Group();scene.add(guides);
  const guideMaterial=new THREE.LineBasicMaterial({color:'#315bff',transparent:true,opacity:.23,depthWrite:false});materials.push(guideMaterial);
  for (let i=-4;i<=4;i++) {
    const points=[new THREE.Vector3(i*1.8,-6,-2),new THREE.Vector3(i*1.8,6,-2)];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),guideMaterial);geometries.push(line.geometry);guides.add(line);
  }
  for (let i=-3;i<=3;i++) {
    const points=[new THREE.Vector3(-10,i*1.8,-2),new THREE.Vector3(10,i*1.8,-2)];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),guideMaterial);geometries.push(line.geometry);guides.add(line);
  }
  const nav=document.createElement('nav');nav.className='journey-route mono';nav.setAttribute('aria-label','Project index');
  nav.innerHTML=`<span class="journey-position" aria-hidden="true">00 / ORIGIN</span><div>${stops.map((id,i)=>`<a href="#${id}" aria-label="${names[i]}" ${i===0?'aria-current="location"':''}><span>${String(i).padStart(2,'0')}</span><i></i><b>${names[i]}</b></a>`).join('')}</div>`;
  const chapterSelect=document.createElement('select');chapterSelect.className='journey-select';chapterSelect.setAttribute('aria-label','Jump to a chapter');
  names.forEach((name,i)=>{const option=document.createElement('option');option.value=stops[i];option.textContent=`${String(i).padStart(2,'0')} / ${name}`;chapterSelect.append(option);});
  chapterSelect.addEventListener('change',()=>{location.hash=chapterSelect.value;},{signal});nav.append(chapterSelect);document.body.append(nav);
  const links=[...nav.querySelectorAll<HTMLAnchorElement>('a')],position=nav.querySelector('.journey-position')!;
  const sections=stops.map(id=>document.getElementById(id)!);
  const workLinks=[...document.querySelectorAll<HTMLAnchorElement>('.work-index a')];
  const introScope=document.querySelector<HTMLElement>('.signal-scope');
  const audio=document.querySelector<HTMLAudioElement>('#minuet-audio');
  let offsets:number[]=[],frame=0,lastY=scrollY,current=0,target=0,energy=0,dead=false,pointerUntil=0,pulseStart=-10000,lastFrame=0,elapsed=0,previewCard=-1;
  const pointer=new THREE.Vector2(),pointerTarget=new THREE.Vector2();
  workLinks.forEach((link,index)=>{
    const preview=()=>{previewCard=index+1;pulseStart=elapsed;wake();};
    const release=()=>{previewCard=-1;wake();};
    link.addEventListener('pointerenter',preview,{signal});link.addEventListener('pointerleave',()=>{if(document.activeElement!==link)release();},{signal});
    link.addEventListener('focus',preview,{signal});link.addEventListener('blur',release,{signal});
  });
  function measure(){offsets=sections.map(section=>section.getBoundingClientRect().top+scrollY);updateTarget();}
  function updateTarget(){
    let chapter=0;for(let i=0;i<offsets.length;i++)if(scrollY+innerHeight*.3>=offsets[i])chapter=i;
    const end=offsets[chapter+1]??document.documentElement.scrollHeight;
    const fraction=THREE.MathUtils.clamp((scrollY+innerHeight*.3-offsets[chapter])/Math.max(1,end-offsets[chapter]),0,1);
    target=Math.min(8.96,chapter+fraction);
    links.forEach((link,i)=>{if(i===chapter)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    chapterSelect.value=stops[chapter];position.textContent=`${String(chapter).padStart(2,'0')} / ${names[chapter]}`;nav.dataset.chapter=String(chapter);document.body.dataset.chapter=String(chapter);wake();
  }
  function activeIndex(chapter:number){return chapter<=1?chapter===1?Math.min(4,Math.max(1,Number(introScope?.dataset.phase??0)+1)):0:Math.min(6,chapter-1);}
  function draw(now:number){
    frame=0;if(dead||document.hidden)return;
    const interval=innerWidth<701?1000/30:1000/60;
    if(lastFrame&&now-lastFrame<interval-1){wake();return;}
    elapsed+=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
    current+=(target-current)*.065;energy*=.92;pointer.lerp(pointerTarget,.07);
    const chapter=Math.min(8,Math.floor(current));
    const selected=chapter===1&&previewCard>=0?previewCard:activeIndex(chapter);
    const pulse=Math.max(0,1-(elapsed-pulseStart)/1.3);
    const pressure=now<pointerUntil?1:0;
    const mobile=innerWidth<701;
    archive.forEach(({group,face,backing},i)=>{
      const distance=Math.abs(i-selected),focus=i===selected?1:0;
      const positionX=chapter===0?4.5:3.4;
      const targetX=positionX+(i-selected)*1.55;
      const targetY=(chapter===0?2.1:0)+(i-selected)*-.55+Math.sin(elapsed*.5+i)*.16;
      const targetZ=focus?0:-2.5-distance*.5;
      group.position.x+=(targetX-group.position.x)*.075;group.position.y+=(targetY-group.position.y)*.075;group.position.z+=(targetZ-group.position.z)*.075;
      group.rotation.y+=(((i-selected)*-.18+pointer.x*.07*pressure+Math.sin(elapsed*.28+i)*.025)-group.rotation.y)*.065;
      group.rotation.z+=((i-selected)*.045+energy*.015-group.rotation.z)*.065;
      const scale=chapter===0?.6:1;group.scale.setScalar(scale);
      const focusOpacity=mobile?0:chapter===0?.86:chapter===1?previewCard>=0?.24:0:Math.min(.22,energy*.14);
      face.material.opacity+=((focus?focusOpacity:0)-face.material.opacity)*.09;
      backing.material.opacity+=((focus&&!mobile?.08+pulse*.05:0)-backing.material.opacity)*.09;
      group.visible=face.material.opacity>.003;
    });
    guides.position.x+=(pointer.x*.13-guides.position.x)*.03;guides.rotation.z=Math.sin(elapsed*.08)*.012;
    guideMaterial.opacity=chapter===0?.17:chapter===1?.12:.07;
    renderer.render(scene,camera);renderer.domElement.dataset.frames=String(Number(renderer.domElement.dataset.frames||0)+1);renderer.domElement.dataset.progress=(current/9).toFixed(4);renderer.domElement.dataset.artifact=cards[selected].label;
    wake();
  }
  function wake(){if(!frame&&!dead&&!document.hidden)frame=requestAnimationFrame(draw);}
  function resize(){if(innerWidth>=701)loadArchive();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<701?1:1.25));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<701?66:49;camera.updateProjectionMatrix();measure();}
  const observer=new ResizeObserver(measure);sections.forEach(section=>observer.observe(section));
  function dispose(){if(dead)return;dead=true;lifetime.abort();parent.removeEventListener('abort',dispose);observer.disconnect();cancelAnimationFrame(frame);textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();nav.remove();document.body.classList.remove('has-backdrop');delete document.body.dataset.chapter;}
  window.addEventListener('scroll',()=>{const delta=scrollY-lastY;energy=Math.min(2,energy+Math.abs(delta)/180);if(Math.abs(delta)>3)nav.dataset.direction=delta>0?'down':'up';lastY=scrollY;updateTarget();},{passive:true,signal});
  window.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;pointerTarget.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);pointerUntil=performance.now()+450;wake();},{passive:true,signal});
  document.addEventListener('click',event=>{if(!(event.target instanceof Element)||!event.target.closest('.disturb-identity,[data-field],[data-label],[data-channel],.repo-object,.bench-shuffle,.fold-story'))return;pulseStart=elapsed;wake();},{signal});
  audio?.addEventListener('play',wake,{signal});audio?.addEventListener('pause',wake,{signal});
  window.addEventListener('resize',resize,{passive:true,signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;lastFrame=0;}else wake();},{signal});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();dispose();},{signal});parent.addEventListener('abort',dispose,{once:true});document.body.classList.add('has-backdrop');resize();current=target;wake();
}
