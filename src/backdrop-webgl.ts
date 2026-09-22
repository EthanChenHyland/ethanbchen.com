import * as THREE from 'three';

const stops = ['top', 'work', 'prompt-off', 'clarity', 'piano', 'avoid', 'experiments', 'about', 'contact'];
const names = ['ORIGIN', 'CURIOSITY', 'LANGUAGE', 'CONTEXT', 'SOUND', 'FEELING', 'THE LAB', 'THE PERSON', 'STILL BUILDING'];

/** A continuous camera route. The page is the timeline; every section occupies a place. */
export function createBackdrop(parent: AbortSignal): void {
  if (parent.aborted) return;
  const lifetime = new AbortController(), signal = lifetime.signal;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.domElement.className = 'scene-backdrop';renderer.domElement.setAttribute('aria-hidden', 'true');document.body.append(renderer.domElement);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 1, .1, 160);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const geometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g);return g; };
  const material = <T extends THREE.Material>(m: T): T => { materials.push(m);return m; };
  const route = new THREE.CatmullRomCurve3(Array.from({ length: 37 }, (_, i) => new THREE.Vector3(Math.sin(i * .49) * 5, Math.cos(i * .36) * 3, 18 - i * 9)), false, 'catmullrom', .35);
  const color = new THREE.Color('#315bff');
  const uniforms = { uTime: { value: 0 }, uColor: { value: color.clone() }, uHead: { value: 0 }, uEnergy: { value: 0 }, uQuiet: { value: 1 }, uResolve: { value: 0 }, uPointer: { value: new THREE.Vector2(4, 4) }, uPressure: { value: 0 }, uPulse: { value: 0 }, uPulseAge: { value: 0 } };
  const ribbonMaterial = material(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
    vertexShader: `
      varying vec2 vUv;varying float vDepth;
      uniform float uTime;uniform float uEnergy;uniform float uResolve;uniform vec2 uPointer;
      uniform float uPressure;uniform float uPulse;uniform float uPulseAge;uniform float uHead;
      attribute vec3 aCenter;
      void main(){
        vUv=uv;vec3 p=mix(position,aCenter,uResolve*.985);
        float wave=sin((uv.x-uHead)*170.-uPulseAge*9.);
        float envelope=exp(-pow((uv.x-uHead-uPulseAge*.035)*20.,2.));
        p.xy+=(position.xy-aCenter.xy)*wave*envelope*uPulse*.12;
        p.x+=sin(uv.x*80.)*uEnergy*.12;
        p.x+=sin(uv.x*42.+uTime*.75)*(.9+uEnergy*.32);
        p.y+=cos(uv.x*35.-uTime*.58)*(.65+uEnergy*.24);
        vec4 view=modelViewMatrix*vec4(p,1.);vDepth=-view.z;
        vec4 clip=projectionMatrix*view;
        vec2 delta=uPointer-clip.xy/max(clip.w,.01);
        float nearPointer=exp(-dot(delta,delta)*4.5)*uPressure;
        clip.xy+=delta*nearPointer*.28*clip.w;
        gl_Position=clip;
      }`,
    fragmentShader: `varying vec2 vUv;varying float vDepth;uniform vec3 uColor;uniform float uHead;uniform float uQuiet;uniform float uPulse;uniform float uTime;
      void main(){float edges=pow(abs(vUv.y-.5)*2.,12.);float dash=smoothstep(.45,.55,sin(vUv.x*640.-uTime*3.));float head=exp(-pow((vUv.x-uHead)*35.,2.));float distanceFade=smoothstep(1.,7.,vDepth)*(1.-smoothstep(65.,125.,vDepth));float stream=pow(max(0.,sin(vUv.x*110.-uTime*1.8)),18.);float alpha=(.19+edges*.62+dash*.065+stream*.2+head*(.28+uPulse*.65))*distanceFade*uQuiet;gl_FragColor=vec4(uColor,alpha);#include <colorspace_fragment>
      }`.replace(';#include', ';\n#include')
  }));
  // The same three traces travel past every project. They periodically flatten,
  // separate, and twist, but do not reset at section boundaries.
  for (let strand = 0; strand < 3; strand++) {
    const centers: number[] = [], vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    const segments = innerWidth < 701 ? 460 : 800;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = route.getPointAt(t), phase = t * Math.PI * 7 + strand * Math.PI * 2 / 3;
      const radius = 6.5 + Math.sin(t * Math.PI * 12) * 1.6;
      for (const side of [-1, 1]) { const a = phase + side * .115;vertices.push(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius, center.z);uvs.push(t, (side + 1) / 2);centers.push(center.x,center.y,center.z); }
      if (i < segments) { const n = i * 2;indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    const g = geometry(new THREE.BufferGeometry());g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));g.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3));g.setIndex(indices);scene.add(new THREE.Mesh(g, ribbonMaterial));
  }
  const lineMaterial = material(new THREE.LineBasicMaterial({ color, transparent: true, opacity: .26, depthWrite: false }));
  const stations: { group: THREE.Group; index: number }[] = [];
  for (let chapter = 1; chapter < stops.length; chapter++) {
    const group = new THREE.Group(), point = route.getPointAt(chapter / stops.length);group.position.copy(point);scene.add(group);stations.push({ group, index: chapter });
    // Architectural marks: six findings, three channels, a score staff, a loose story.
    const count = chapter === 2 ? 6 : chapter === 3 ? 3 : chapter === 4 ? 12 : chapter === 5 ? 28 : 5;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      let points: THREE.Vector3[];
      if (chapter === 2 || chapter === 3) {
        const w = chapter === 2 ? 2.5 : 5, h = chapter === 2 ? 1.6 : 3;
        points = [new THREE.Vector3(-w,-h,0),new THREE.Vector3(w,-h,0),new THREE.Vector3(w,h,0),new THREE.Vector3(-w,h,0),new THREE.Vector3(-w,-h,0)];
      } else {
        points = [new THREE.Vector3(-.08,-2,0),new THREE.Vector3(.08,2,0)];
      }
      const item = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(points)), lineMaterial);
      item.position.set(Math.cos(angle) * 8, Math.sin(angle) * 8, (i - count / 2) * (chapter === 5 ? .5 : 1.7));item.rotation.z = angle;group.add(item);
    }
  }
  const nav = document.createElement('nav');nav.className = 'journey-route mono';nav.setAttribute('aria-label', 'Signal journey');
  nav.innerHTML = `<span class="journey-position" aria-hidden="true">00 / ORIGIN</span><div>${stops.map((id,i)=>`<a href="#${id}" aria-label="${names[i]}" ${i===0?'aria-current="location"':''}><span>${String(i).padStart(2,'0')}</span><i></i><b>${names[i]}</b></a>`).join('')}</div>`;
  const chapterSelect = document.createElement('select');chapterSelect.className = 'journey-select';chapterSelect.setAttribute('aria-label', 'Jump to a chapter');
  names.forEach((name, i) => { const option = document.createElement('option');option.value = stops[i];option.textContent = `${String(i).padStart(2,'0')} / ${name}`;chapterSelect.append(option); });
  chapterSelect.addEventListener('change', () => { location.hash = chapterSelect.value; }, { signal });
  nav.append(chapterSelect);
  document.body.append(nav);

  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')], position = nav.querySelector('.journey-position')!;
  const sections = stops.map(id => document.getElementById(id)!);
  let offsets: number[] = [], frame = 0, lastY = scrollY, current = 0, target = 0, energy = 0, dead = false, pointerUntil = 0, pulseStart = -10000, lastFrame = 0, elapsed = 0;
  const pointer = new THREE.Vector2(), pointerTarget = new THREE.Vector2(), eye = new THREE.Vector3(), ahead = new THREE.Vector3();
  function measure() { offsets = sections.map(section => section.getBoundingClientRect().top + scrollY);updateTarget(); }
  function updateTarget() {
    let chapter = 0;for (let i = 0; i < offsets.length; i++) if (scrollY + innerHeight * .3 >= offsets[i]) chapter = i;
    const end = offsets[chapter + 1] ?? document.documentElement.scrollHeight;
    const fraction = THREE.MathUtils.clamp((scrollY + innerHeight * .3 - offsets[chapter]) / Math.max(1, end - offsets[chapter]), 0, 1);
    target = Math.min(.96, (chapter + fraction) / stops.length);
    links.forEach((link,i) => { if (i === chapter) link.setAttribute('aria-current','location');else link.removeAttribute('aria-current'); });
    chapterSelect.value = stops[chapter];
    position.textContent = `${String(chapter).padStart(2,'0')} / ${names[chapter]}`;nav.dataset.chapter = String(chapter);wake();
  }
  function draw(now: number) {
    frame = 0;if (dead || document.hidden) return;
    // Visible ambient motion is deliberate; throttle mobile and pause hidden tabs.
    const interval = innerWidth < 701 ? 1000 / 30 : 1000 / 60;
    if (lastFrame && now - lastFrame < interval - 1) { wake();return; }
    elapsed += lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;
    lastFrame = now;uniforms.uTime.value = elapsed;
    if (elapsed - pulseStart > 6.5) pulseStart = elapsed;
    const pulseAge = elapsed - pulseStart;
    uniforms.uPulse.value = Math.max(0, 1 - pulseAge / 1.6);
    uniforms.uPulseAge.value = pulseAge;
    const pressureTarget = now < pointerUntil ? 1 : 0;
    uniforms.uPressure.value += (pressureTarget - uniforms.uPressure.value) * .09;
    uniforms.uPointer.value.copy(pointer);
    current += (target-current)*.075;energy *= .9;pointer.lerp(pointerTarget,.07);
    const chapter = Math.min(8, Math.floor(current * stops.length));
    const dark = [4,6,8].includes(chapter);
    color.set(dark ? '#a5bbff' : chapter === 5 ? '#5664bc' : '#315bff');uniforms.uColor.value.lerp(color,.1);lineMaterial.color.copy(uniforms.uColor.value);
    const quiet = chapter === 7 ? .65 : chapter === 8 ? .75 : 1;
    uniforms.uResolve.value=THREE.MathUtils.smoothstep(current*9,8.45,8.9) * .65;
    uniforms.uQuiet.value=quiet;lineMaterial.opacity=.25*quiet;
    uniforms.uHead.value=current;uniforms.uEnergy.value=energy;
    eye.copy(route.getPointAt(current));ahead.copy(route.getPointAt(Math.min(1,current+.045)));
    eye.x+=pointer.x*.55+Math.sin(elapsed*.19)*.24;eye.y+=pointer.y*.35+Math.cos(elapsed*.23)*.18;camera.position.copy(eye);camera.lookAt(ahead);camera.rotateZ(Math.sin(current*Math.PI*5)*.075);
    stations.forEach(({group,index})=>{group.visible=Math.abs(index/9-current)<.24;group.rotation.z=Math.sin(elapsed*.2+index)*.09;});
    renderer.render(scene,camera);renderer.domElement.dataset.frames=String(Number(renderer.domElement.dataset.frames||0)+1);renderer.domElement.dataset.progress=current.toFixed(4);
    wake();
  }
  function wake(){if(!frame&&!dead&&!document.hidden)frame=requestAnimationFrame(draw);}
  function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<701?1:1.25));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<701?72:58;camera.updateProjectionMatrix();measure();}
  const observer=new ResizeObserver(measure);sections.forEach(section=>observer.observe(section));
  function dispose(){if(dead)return;dead=true;lifetime.abort();parent.removeEventListener('abort',dispose);observer.disconnect();cancelAnimationFrame(frame);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();nav.remove();document.body.classList.remove('has-backdrop');}
  window.addEventListener('scroll',()=>{energy=Math.min(2,energy+Math.abs(scrollY-lastY)/180);lastY=scrollY;updateTarget();},{passive:true,signal});
  window.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;pointerTarget.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);pointerUntil=performance.now()+450;wake();},{passive:true,signal});
  document.addEventListener('click',event=>{
    if (!(event.target instanceof Element) || !event.target.closest('.disturb-identity,[data-field],[data-label],[data-channel],.repo-object,.bench-shuffle,.fold-story')) return;
    pulseStart=elapsed;wake();
  },{signal});
  window.addEventListener('resize',resize,{passive:true,signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;lastFrame=0;}else wake();},{signal});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();dispose();},{signal});parent.addEventListener('abort',dispose,{once:true});document.body.classList.add('has-backdrop');resize();current=target;
}
