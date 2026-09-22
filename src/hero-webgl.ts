import * as THREE from 'three';

export async function createIdentityField(hero:HTMLElement,stage:HTMLElement,trigger:HTMLButtonElement,parent:AbortSignal):Promise<()=>void>{
  if(parent.aborted)return ()=>{};
  const lifecycle=new AbortController(),signal=lifecycle.signal;
  const cleanups:(()=>void)[]=[];
  let dead=false,frame=0;
  const dispose=()=>{
    if(dead)return;
    dead=true;
    parent.removeEventListener('abort',dispose);
    lifecycle.abort();
    cancelAnimationFrame(frame);frame=0;
    // Release every acquired resource even if an individual cleanup fails.
    for(const cleanup of cleanups.reverse()) { try { cleanup(); } catch { /* Continue releasing resources. */ } }
    cleanups.length=0;
    stage.classList.remove('identity-ready');
    trigger.textContent='SIGNAL / TRACE';
  };
  parent.addEventListener('abort',dispose,{once:true});
  try {
    const fontsReady=await new Promise<boolean>((resolve,reject)=>{
      const aborted=()=>resolve(false);
      signal.addEventListener('abort',aborted,{once:true});
      Promise.resolve(document.fonts.ready).then(()=>{
        signal.removeEventListener('abort',aborted);resolve(true);
      },error=>{signal.removeEventListener('abort',aborted);reject(error)});
    });
    if(!fontsReady||dead)return dispose;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
  cleanups.push(()=>renderer.dispose(),()=>renderer.domElement.remove());
  renderer.setClearColor(0,0);
  renderer.domElement.className='identity-canvas';renderer.domElement.setAttribute('aria-hidden','true');stage.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,1,6000);
  let geometry=new THREE.BufferGeometry();
  cleanups.push(()=>geometry.dispose());
  const uniforms={uPointer:{value:new THREE.Vector2(-2000,-2000)},uForce:{value:0},uScroll:{value:0},uWidth:{value:1000},uTime:{value:0},uPixel:{value:1},uColor:{value:new THREE.Color('#171816')}};
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,uniforms,vertexShader:`
    attribute float seed;
    uniform vec2 uPointer; uniform float uForce; uniform float uScroll; uniform float uWidth; uniform float uTime; uniform float uPixel;
    varying float vEnergy; varying float vSeed;
    void main(){
      vec3 p=position;vec2 delta=p.xy-uPointer;float d=length(delta);float field=mix(exp(-d*d/18000.0),1.0,smoothstep(1.0,1.6,uForce));
      float wave=sin(d*.035-uTime*5.0)*field*uForce;
      p.xy+=normalize(delta+vec2(.01))*field*uForce*48.0;
      p.z+=wave*95.0;
      float release=smoothstep(.05,.85,uScroll);
      float phase=position.x/uWidth*6.283+seed*2.0;
      vec3 trace=vec3(position.x,sin(phase)*55.0,cos(phase)*150.0);
      p=mix(p,trace,release);
      p.y+=sin(seed*120.0+uTime*3.0)*uForce*field*12.0;
      vEnergy=field*uForce+release;vSeed=seed;
      vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
      gl_PointSize=mix(2.4,1.35,release)*uPixel;
    }`,fragmentShader:`
      uniform vec3 uColor;varying float vEnergy;varying float vSeed;
      void main(){
        float a=1.0-smoothstep(.35,.5,length(gl_PointCoord-.5));
        vec3 color=mix(uColor,vec3(.192,.357,1.0),clamp(vEnergy,0.0,1.0));
        gl_FragColor=vec4(color,a);
        #include <colorspace_fragment>
      }`});
  cleanups.push(()=>material.dispose());
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);
  let width=1,height=1,visible=true,force=0,target=0,last=0,time=0,scroll=0,currentScroll=0,pulseUntil=0,pointerUntil=0;
  const pointer=new THREE.Vector2(-2000,-2000),aim=pointer.clone();
  function build(){
    if(dead)return;
    const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;
    const dpr=Math.min(devicePixelRatio,innerWidth<700?1:1.5);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);uniforms.uPixel.value=dpr;uniforms.uWidth.value=width;
    camera.aspect=width/height;camera.position.z=height/2/Math.tan(THREE.MathUtils.degToRad(20));camera.updateProjectionMatrix();
    const ink=document.createElement('canvas');ink.width=Math.ceil(width);ink.height=Math.ceil(height);const ctx=ink.getContext('2d',{willReadFrequently:true})!;
    ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
    const name=stage.querySelector('h1')!;
    const walker=document.createTreeWalker(name,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode;if(!node.textContent?.trim())continue;
      const style=getComputedStyle(node.parentElement!);ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.letterSpacing=style.letterSpacing;
      const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();
      const metrics=ctx.measureText(node.textContent);const ascent=metrics.fontBoundingBoxAscent||parseFloat(style.fontSize)*.8;const descent=metrics.fontBoundingBoxDescent||parseFloat(style.fontSize)*.2;
      const baseline=r.top-rect.top+(r.height-ascent-descent)/2+ascent;
      ctx.fillText(node.textContent,r.left-rect.left,baseline);
    }
    const data=ctx.getImageData(0,0,ink.width,ink.height).data,positions:number[]=[],seeds:number[]=[];
    const step=innerWidth<700?2:2.5;
    for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const i=(Math.floor(y)*ink.width+Math.floor(x))*4;if(data[i+3]>100){positions.push(x-width/2,height/2-y,0);seeds.push(((Math.floor(x)*73+Math.floor(y)*139)%997)/997)}}
    geometry.dispose();geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));points.geometry=geometry;
    stage.dataset.points=String(seeds.length);wake();
  }
  function draw(now:number){
    frame=0;if(dead||!visible||document.hidden)return;
    const dt=Math.min((now-last)/1000||.016,.04);last=now;time+=dt;
    if((now>pulseUntil&&target===1.7)||(now>pointerUntil&&target===1))target=0;
    force+=(target-force)*.1;pointer.lerp(aim,.13);currentScroll+=(scroll-currentScroll)*.12;
    uniforms.uPointer.value.copy(pointer);uniforms.uForce.value=force;uniforms.uScroll.value=currentScroll;uniforms.uTime.value=time;
    renderer.render(scene,camera);stage.dataset.frames=String(Number(stage.dataset.frames||0)+1);
    if(force>.005||Math.abs(scroll-currentScroll)>.001||pointer.distanceTo(aim)>.1)wake();
  }
  function wake(){if(!frame&&!dead&&visible&&!document.hidden)frame=requestAnimationFrame(draw)}
  const updateScroll=()=>{const r=hero.getBoundingClientRect();scroll=THREE.MathUtils.clamp(-r.top/r.height,0,1);wake()};
  stage.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;const r=stage.getBoundingClientRect();aim.set(event.clientX-r.left-width/2,height/2-event.clientY+r.top);target=1;pointerUntil=performance.now()+250;wake()},{signal});
  stage.addEventListener('pointerleave',()=>{target=0;wake()},{signal});
  const pulse=()=>{aim.set(0,0);target=1.7;pulseUntil=performance.now()+1100;wake()};
  trigger.addEventListener('click',pulse,{signal});
  stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')pulse()},{signal});
  const visibility=()=>{
    if(document.hidden){cancelAnimationFrame(frame);frame=0;}
    else{last=0;wake();}
  };
  window.addEventListener('scroll',updateScroll,{passive:true,signal});document.addEventListener('visibilitychange',visibility,{signal});
  const resize=new ResizeObserver(()=>{try{build()}catch{dispose()}});
  cleanups.push(()=>resize.disconnect());resize.observe(stage);
  const intersection=new IntersectionObserver(entries=>{if(dead)return;visible=entries[0].isIntersecting;if(visible)wake();else{cancelAnimationFrame(frame);frame=0}},{rootMargin:'50px'});
  cleanups.push(()=>intersection.disconnect());intersection.observe(hero);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();dispose()},{signal});
  build();updateScroll();stage.classList.add('identity-ready');trigger.textContent='DISTURB THE SIGNAL ↗';return dispose;
  } catch(error) { dispose();throw error; }
}
