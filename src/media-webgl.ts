import * as THREE from 'three';
export async function createMediaStage(images:HTMLImageElement[],parent:AbortSignal,kinds?:('context'|'story')[]):Promise<()=>void>{
  if(parent.aborted)return ()=>{};
  const lifetime=new AbortController(),signal=lifetime.signal;
  let renderer:THREE.WebGLRenderer|undefined,geometry:THREE.PlaneGeometry|undefined,observer:ResizeObserver|undefined;
  let dead=false,frame=0;
  const textures=new Set<THREE.Texture>(),materials=new Set<THREE.ShaderMaterial>(),ready=new Set<HTMLImageElement>();
  // TextureLoader cannot cancel its requests. Release owned resources now and
  // let late completions settle without constructing surfaces or listeners.
  let finishAbort:()=>void=()=>{};
  const aborted=new Promise<undefined>(resolve=>{finishAbort=()=>resolve(undefined)});
  function dispose(){
    if(dead)return;dead=true;
    parent.removeEventListener('abort',dispose);lifetime.abort();finishAbort();
    observer?.disconnect();cancelAnimationFrame(frame);frame=0;
    ready.forEach(image=>image.classList.remove('gpu-media-ready'));
    textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());
    geometry?.dispose();renderer?.dispose();renderer?.domElement.remove();
  }
  parent.addEventListener('abort',dispose,{once:true});
  try{
  const activeRenderer=renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
  renderer.setClearColor(0,0);renderer.domElement.className='media-stage-canvas';renderer.domElement.setAttribute('aria-hidden','true');document.body.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose()},{signal});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,innerWidth,0,-innerHeight,-2000,2000);
  const surfaceGeometry=geometry=new THREE.PlaneGeometry(1,1,44,28);
  const loaded=await Promise.race([aborted,Promise.all(images.map(async(image,index)=>{
    const texture=await new Promise<THREE.Texture>((resolve,reject)=>{
      const pending=new THREE.TextureLoader().load(image.currentSrc||image.src,resolve,undefined,reject);
      textures.add(pending);
    });
    if(dead)return;
    texture.colorSpace=THREE.SRGBColorSpace;
    const uniforms={uTravel:{value:0},uMap:{value:texture},uClip:{value:new THREE.Vector4()},uPointer:{value:new THREE.Vector2(.5,.5)},uStrength:{value:0},uFold:{value:0},uAspect:{value:1},uKind:{value:kinds?.[index]==='story'?1:index}};
    const material=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,uniforms,vertexShader:`
      varying vec2 vUv;varying float vShade;uniform vec2 uPointer;uniform float uStrength;uniform float uFold;uniform float uAspect;uniform float uTravel;uniform int uKind;
      void main(){vUv=uv;vec3 p=position;
        float d=distance(vec2(uv.x*uAspect,uv.y),vec2(uPointer.x*uAspect,uPointer.y));
        float touch=exp(-d*d*8.0)*uStrength;
        float bend=(uKind==0?sin(uv.x*3.14159):pow(uv.x,2.0))*uFold;
        p.y+=sin(uv.x*5.0+uv.y*2.0)*touch*.035+bend*.12;
        p.x+=cos(uv.y*3.14159)*touch*.016;
        float curl=sin(uv.x*3.14159)*sin(uTravel*3.14159);
        p.y+=curl*.09*cos(uv.x*3.14159);
        p.z+=touch*.1+bend*.3+curl*.3;
        vShade=1.0-touch*.08-bend*.18;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,fragmentShader:`
      varying vec2 vUv;varying float vShade;uniform sampler2D uMap;uniform vec4 uClip;uniform float uTravel;uniform float uStrength;
      void main(){if(gl_FragCoord.x<uClip.x||gl_FragCoord.x>uClip.z||gl_FragCoord.y<uClip.y||gl_FragCoord.y>uClip.w)discard;vec2 uv=vUv;
        float wave=sin(uv.y*12.+uTravel*7.)*sin(uTravel*3.14159)*.012;
        uv.x=clamp(uv.x+wave,0.,1.);
        vec4 ink=texture2D(uMap,uv);
        float fringe=uStrength*.0025;
        ink.r=texture2D(uMap,clamp(uv+vec2(fringe,0.),0.,1.)).r;
        ink.b=texture2D(uMap,clamp(uv-vec2(fringe,0.),0.,1.)).b;gl_FragColor=vec4(ink.rgb*vShade,ink.a);
      #include <colorspace_fragment>
      }`});
    materials.add(material);
    const mesh=new THREE.Mesh(surfaceGeometry,material);mesh.frustumCulled=false;scene.add(mesh);
    return {image,texture,material,uniforms,mesh,strength:0,target:0,fold:0,foldTarget:0,visible:false};
  }))]);
  if(dead)return dispose;
  const surfaces=(loaded??[]).filter(surface=>surface!==undefined);
  function measure(){if(dead)return;activeRenderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1:1.5));activeRenderer.setSize(innerWidth,innerHeight);camera.right=innerWidth;camera.bottom=-innerHeight;camera.updateProjectionMatrix();wake()}
  function draw(){frame=0;if(dead||document.hidden)return;let moving=false,any=false;
    surfaces.forEach(s=>{const r=s.image.getBoundingClientRect();s.visible=r.bottom>0&&r.top<innerHeight;s.mesh.visible=s.visible;if(!s.visible)return;any=true;
      s.strength+=(s.target-s.strength)*.12;s.fold+=(s.foldTarget-s.fold)*.1;
      const clip=s.image.closest('.overlay-mat,.avoid-art')!.getBoundingClientRect(),dpr=activeRenderer.getPixelRatio();s.uniforms.uClip.value.set(clip.left*dpr,(innerHeight-clip.bottom)*dpr,clip.right*dpr,(innerHeight-clip.top)*dpr);
      s.uniforms.uTravel.value=THREE.MathUtils.clamp((innerHeight-r.top)/(innerHeight+r.height),0,1);s.uniforms.uStrength.value=s.strength;s.uniforms.uFold.value=s.fold;s.uniforms.uAspect.value=r.width/r.height;
      s.mesh.position.set(r.left+r.width/2,-r.top-r.height/2,0);s.mesh.scale.set(r.width,r.height,1);
      if(Math.abs(s.strength-s.target)>.002||Math.abs(s.fold-s.foldTarget)>.002)moving=true;
    });activeRenderer.domElement.style.visibility=any?'visible':'hidden';if(any)activeRenderer.render(scene,camera);if(moving)wake();
  }
  function wake(){if(!frame&&!dead&&!document.hidden)frame=requestAnimationFrame(draw)}
  surfaces.forEach(s=>{
    const index=s.uniforms.uKind.value;
    const surface=s.image.closest<HTMLElement>(index===0?'.overlay-mat':'.avoid-art')!;
    surface.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=s.image.getBoundingClientRect();s.uniforms.uPointer.value.set((e.clientX-r.left)/r.width,1-(e.clientY-r.top)/r.height);s.target=1;wake()},{signal});
    surface.addEventListener('pointerleave',()=>{s.target=0;wake()},{signal});
    if(index===0){document.querySelectorAll<HTMLButtonElement>('[data-channel]').forEach((button,i)=>button.addEventListener('click',()=>{s.foldTarget=i===0?0:i===1?.6:-.6;wake()},{signal}))}
    else{
      const button=document.createElement('button');button.type='button';button.className='fold-story mono';button.textContent='BEND THE FRAME ↗';button.setAttribute('aria-pressed','false');surface.before(button);
      button.addEventListener('click',()=>{const folded=s.foldTarget===0;s.foldTarget=folded?1:0;s.target=folded?.8:0;button.setAttribute('aria-pressed',String(folded));button.textContent=folded?'LET IT SETTLE ↙':'BEND THE FRAME ↗';wake()},{signal});
      signal.addEventListener('abort',()=>button.remove(),{once:true});
    }
    ready.add(s.image);s.image.classList.add('gpu-media-ready');
  });
  observer=new ResizeObserver(measure);surfaces.forEach(s=>observer!.observe(s.image));
  window.addEventListener('scroll',wake,{passive:true,signal});window.addEventListener('resize',measure,{passive:true,signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else wake()},{signal});
  measure();return dispose;
  }catch(error){dispose();throw error}
}
