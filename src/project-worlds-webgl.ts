import * as THREE from 'three';
import { schemaFields, type Note } from './signal-shapes';

export interface ProjectWorldRenderer { dispose(): void }

/** One scissored renderer, three real project structures, animating only visible scenes. */
export async function createProjectWorlds(views: HTMLElement[], parent: AbortSignal): Promise<ProjectWorldRenderer> {
  const lifetime = new AbortController(), signal = lifetime.signal;
  let dead = false, frame = 0, lastFrame = 0, elapsed = 0;
  const release: (() => void)[] = [];
  function dispose() {
    if (dead) return;dead = true;lifetime.abort();cancelAnimationFrame(frame);
    parent.removeEventListener('abort', dispose);
    release.reverse().forEach(fn => fn());
    views.forEach(view => {if (!parent.aborted) view.classList.add('world-unavailable');view.classList.remove('world-ready');view.closest('.project-volume')?.classList.remove('volume-live');});
  }
  parent.addEventListener('abort', dispose, { once: true });
  if (parent.aborted) { dispose();return { dispose }; }
  try {
    views.forEach(view => view.classList.remove('world-unavailable'));
    const response = await fetch('/data/piano-notes.json', { signal });
    if (!response.ok) throw new Error('Score unavailable');
    const notes: Note[] = await response.json();
    if (signal.aborted) return { dispose };
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.domElement.className = 'project-world-canvas';renderer.domElement.setAttribute('aria-hidden', 'true');document.body.append(renderer.domElement);
    release.push(() => { renderer.dispose();renderer.domElement.remove(); });
    const labelLayer = document.createElement('div');labelLayer.className = 'project-world-labels';labelLayer.setAttribute('aria-hidden', 'true');document.body.append(labelLayer);
    release.push(() => labelLayer.remove());
    renderer.setClearColor(0, 0);renderer.setScissorTest(true);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault();dispose(); }, { signal });
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    const ownGeometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g);return g; };
    const ownMaterial = <T extends THREE.Material>(m: T): T => { materials.push(m);return m; };
    release.push(() => { geometries.forEach(g => g.dispose());materials.forEach(m => m.dispose()); });
    const scenes = views.map((view, index) => {
      const scene = new THREE.Scene(), group = new THREE.Group();scene.add(group);
      scene.add(new THREE.AmbientLight('#ffffff', 2.3));
      const light = new THREE.DirectionalLight('#cfdbff', 4);light.position.set(-3, 8, 7);scene.add(light);
      const fill = new THREE.DirectionalLight('#315bff', 2);fill.position.set(6, -3, 4);scene.add(fill);
      return { view, scene, group, index, rotation: new THREE.Vector2(index === 2 ? -.45 : -.12, -.24), target: new THREE.Vector2(index === 2 ? -.45 : -.12, -.24), depth: index === 0 ? .35 : .55, targetDepth: index === 0 ? .35 : .55, selected: 0, hover: -1, pickables: [] as THREE.Object3D[], labels: [] as { el: HTMLElement; position: THREE.Vector3 }[], time: 0 };
    });
    // Decorative signal traffic surrounds each artefact; it carries no project data.
    const currents = scenes.map((world, index) => {
      const count = innerWidth < 701 ? 180 : 420;
      const seeds = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        seeds[i * 3] = i / count;seeds[i * 3 + 1] = i % 6;seeds[i * 3 + 2] = (i * .61803398875) % 1;
      }
      const geometry = ownGeometry(new THREE.BufferGeometry());geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
      const uniforms = { uTime: { value: 0 }, uArrival: { value: 0 }, uKind: { value: index }, uColor: { value: new THREE.Color(index === 2 ? '#c4e6b7' : '#315bff') }, uDpr: { value: Math.min(devicePixelRatio, innerWidth < 701 ? 1 : 1.5) } };
      const material = ownMaterial(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms,
        vertexShader: `uniform float uTime;uniform float uArrival;uniform float uDpr;uniform int uKind;varying float vAlpha;
        void main(){
          float t=fract(position.x+uTime*(.035+position.z*.018));float lane=position.y;
          float angle=t*6.2831853;vec3 p;
          if(uKind==0){
            p=vec3(sin(angle)*5.3,cos(angle)*2.65,(lane-2.5)*.34);
            p.xy=mix(p.xy,sign(p.xy)*pow(abs(p.xy),vec2(.86)),.6);
          }else if(uKind==1){
            p=vec3((t-.5)*10.,sin(t*12.566-uTime+lane)*.3+(lane-2.5)*.72,-1.4);
          }else{
            p=vec3((t-.5)*12.,sin(t*6.283+lane)*.25+(lane-2.5)*.85,-1.25);
          }
          p.xy*=1.+uArrival*.35;
          vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
          gl_PointSize=clamp((2.+position.z*3.)*uDpr*16./max(1.,-view.z),1.,8.);
          vAlpha=sin(t*3.14159)*(.25+position.z*.45);
        }`,
        fragmentShader: `uniform vec3 uColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uColor,(1.-smoothstep(.12,.5,d))*vAlpha);
#include <colorspace_fragment>
}`
      }));
      const stream = new THREE.Points(geometry, material);stream.frustumCulled=false;world.group.add(stream);return uniforms;
    });
    const lineMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#315bff', transparent: true, opacity: .5 }));
    function wire(points: THREE.Vector3[], group: THREE.Group, material = lineMaterial) { const g = ownGeometry(new THREE.BufferGeometry().setFromPoints(points));const line = new THREE.Line(g, material);group.add(line);return line; }
    function label(index: number, text: string, position: THREE.Vector3) {
      const el = document.createElement('span');el.className = `volume-label mono ${['schema-label', 'context-label', 'music-label'][index]}`;el.textContent = text;labelLayer.append(el);
      scenes[index].labels.push({ el, position });release.push(() => el.remove());return el;
    }
    // Six specimen planes: changing the DOM contract lifts its corresponding plane.
    const schema = scenes[0], plates: THREE.Mesh[] = [], reticles: THREE.LineSegments[] = [];
    const plateGeometry = ownGeometry(new THREE.BoxGeometry(2.45, 1.65, .045));
    const corner = .23, x = 1.36, y = .96, z = .09;
    const reticlePoints: number[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      reticlePoints.push(sx * x, sy * (y - corner), z, sx * x, sy * y, z, sx * x, sy * y, z, sx * (x - corner), sy * y, z);
    }
    const reticleGeometry = ownGeometry(new THREE.BufferGeometry());reticleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(reticlePoints, 3));
    schemaFields.forEach((field, i) => {
      const material = ownMaterial(new THREE.MeshStandardMaterial({ color: i === 0 ? '#315bff' : '#b8c8fa', roughness: .6, metalness: .13 }));
      const plate = new THREE.Mesh(plateGeometry, material);plate.userData.field = i;schema.group.add(plate);plates.push(plate);schema.pickables.push(plate);
      const edges = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(plateGeometry)), lineMaterial);plate.add(edges);
      const reticle = new THREE.LineSegments(reticleGeometry, ownMaterial(new THREE.LineBasicMaterial({ color: '#315bff', transparent: true, opacity: .95, depthTest: false })));
      reticle.visible = i === 0;plate.add(reticle);reticles.push(reticle);
      label(0, field.replaceAll('_', ' ').replace('osteoarthritis','osteo\u00adarthritis'), new THREE.Vector3());
      for (let j = 0; j < 4; j++) {
        const dot = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(.07, 8, 6)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#f2efe8' })));
        dot.position.set(-.55 + j * .36, .3, .075);plate.add(dot);
      }
    });
    const courier = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(.12, 12, 8)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    schema.group.add(courier);
    const schemaTraceGeometry = ownGeometry(new THREE.BufferGeometry());
    const schemaTrace = new THREE.Line(schemaTraceGeometry, ownMaterial(new THREE.LineBasicMaterial({ color: '#315bff' })));schema.group.add(schemaTrace);
    views[0].closest('figure')!.querySelector('input')!.addEventListener('input', event => { schema.targetDepth = Number((event.target as HTMLInputElement).value);wake(); }, { signal });
    const schemaStatus = views[0].closest('figure')!.querySelector<HTMLElement>('.volume-status')!;
    const schemaButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-field]')];
    const updateSchemaStatus = (i: number, preview = false) => { schemaStatus.textContent = `${preview ? 'INSPECT' : 'SELECTED'} / 0${i + 1} ${schemaFields[i].replaceAll('_', ' ').toUpperCase()}`; };
    updateSchemaStatus(0);
    schemaButtons.forEach((button, i) => {
      const preview = () => { schema.hover = i;updateSchemaStatus(i, true);wake(); };
      const clear = () => { if (schema.hover === i) { schema.hover = -1;updateSchemaStatus(schema.selected);wake(); } };
      button.addEventListener('pointerenter', preview, { signal });button.addEventListener('pointerleave', clear, { signal });
      button.addEventListener('focus', preview, { signal });button.addEventListener('blur', clear, { signal });
      button.addEventListener('click', () => { schema.selected = i;schema.labels.forEach(({ el }, index) => el.classList.toggle('selected', index === i));updateSchemaStatus(i);wake(); }, { signal });
    });

    // The source-rendered application interface sits in front of two independent audio planes.
    const context = scenes[1], contextPlanes: THREE.Mesh[] = [], channelWaves: THREE.Line[] = [];
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('/media/clarity-overlay.png', () => { if (!dead) { views[1].classList.add('world-ready');wake(); } }, undefined, () => { dispose(); });
    texture.colorSpace = THREE.SRGBColorSpace;release.push(() => texture.dispose());
    for (let i = 0; i < 3; i++) {
      const geometry = ownGeometry(new THREE.PlaneGeometry(i === 0 ? 7 : 7.8, i === 0 ? 7 * 870 / 1328 : 4.8, 32, 20));
      const material = ownMaterial(i === 0
        ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .05, side: THREE.DoubleSide, toneMapped: false })
        : new THREE.MeshStandardMaterial({ color: i === 1 ? '#d6e0ff' : '#c4e6b7', transparent: true, opacity: .38, side: THREE.DoubleSide, roughness: .75, depthWrite: false }));
      const mesh = new THREE.Mesh(geometry, material);mesh.userData.channel = i;context.group.add(mesh);contextPlanes.push(mesh);context.pickables.push(mesh);
      const border = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(ownGeometry(new THREE.PlaneGeometry(7.8, 4.8)))), lineMaterial);if (i > 0) mesh.add(border);
      label(1, ['SCREEN / ON REQUEST', 'YOU / MICROPHONE', 'THEM / SYSTEM AUDIO'][i], new THREE.Vector3());
      if (i > 0) {
        // A routing motif, deliberately not represented as measured audio.
        channelWaves.push(wire(Array.from({ length: 90 }, (_, j) => new THREE.Vector3(-3.7 + j / 89 * 7.4, Math.sin(j * .25 + i) * .22, .03)), mesh as unknown as THREE.Group));
      }
    }
    const channelButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-channel]')];
    const previewChannel = (i: number) => { context.hover = i;channelButtons.forEach((button, index) => button.classList.toggle('is-preview', index === i));wake(); };
    const clearChannel = () => { context.hover = -1;channelButtons.forEach(button => button.classList.remove('is-preview'));wake(); };
    channelButtons.forEach((button, i) => {
      button.addEventListener('pointerenter', () => previewChannel(i), { signal });button.addEventListener('pointerleave', clearChannel, { signal });
      button.addEventListener('focus', () => previewChannel(i), { signal });button.addEventListener('blur', clearChannel, { signal });
      button.addEventListener('click', () => { context.selected = i;context.target.y = (i - 1) * .25;wake(); }, { signal });
    });
    document.querySelector('.context-depth input')!.addEventListener('input', event => { context.targetDepth = Number((event.target as HTMLInputElement).value);wake(); }, { signal });

    // Score coordinates are time × pitch. Height separates the two pitch registers.
    const music = scenes[2];
    const noteGeometry = ownGeometry(new THREE.BoxGeometry(1, .14, .23));
    const noteMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#c4e6b7', roughness: .45, metalness: .2 }));
    const bars = new THREE.InstancedMesh(noteGeometry, noteMaterial, notes.length);music.group.add(bars);music.pickables.push(bars);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    notes.forEach((note, i) => { dummy.position.set(-5.4 + (note.start + note.duration / 2) / 12.3 * 10.8, (note.pitch - 65) / 7, (note.pitch < 67 ? -.6 : .45));dummy.scale.set(Math.max(.03, note.duration / 12.3 * 10.8), 1, 1);dummy.updateMatrix();bars.setMatrixAt(i, dummy.matrix);bars.setColorAt(i, color.set('#c4e6b7')); });
    const musicLine = ownMaterial(new THREE.LineBasicMaterial({ color: '#c4e6b7', transparent: true, opacity: .18 }));
    for (let row = -2; row <= 3; row++) wire([new THREE.Vector3(-5.6, row, -.9), new THREE.Vector3(5.6, row, -.9)], music.group, musicLine);
    const head = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(.025, 6)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#f2efe8', transparent: true, opacity: .7, side: THREE.DoubleSide })));head.position.z = .8;music.group.add(head);
    label(2, '0 SEC', new THREE.Vector3(-5.4, -2.8, 0));label(2, '12.3 SEC', new THREE.Vector3(5.4, -2.8, 0));
    const audio = document.querySelector<HTMLAudioElement>('#minuet-audio')!;
    const scrub = views[2].closest('figure')!.querySelector<HTMLInputElement>('input')!;
    const output = views[2].closest('figure')!.querySelector('output')!;
    const musicStatus = views[2].closest('figure')!.querySelector<HTMLElement>('.volume-status')!;
    let selectedNote: number | null = null;
    const updateMusicStatus = () => {
      if (music.hover >= 0) { const note = notes[music.hover];musicStatus.textContent = `INSPECT / MIDI ${note.pitch} · ${note.start.toFixed(2)} SEC`; }
      else if (!audio.paused) musicStatus.textContent = `PLAYING / ${audio.currentTime.toFixed(2)} SEC`;
      else if (audio.ended) musicStatus.textContent = 'SCORE COMPLETE / REPLAY ↺';
      else if (selectedNote !== null) { const note = notes[selectedNote];musicStatus.textContent = `MIDI ${note.pitch} / ${note.start.toFixed(2)} SEC`; }
      else if (audio.currentTime > 0) musicStatus.textContent = `PAUSED / ${audio.currentTime.toFixed(2)} SEC`;
      else musicStatus.textContent = 'READY / 69 MIDI NOTES';
    };
    updateMusicStatus();
    let pendingSeek: number | undefined, requestedMetadata = false;
    const seek = (time: number) => { if (Number.isFinite(audio.duration)) audio.currentTime = time;else { pendingSeek = time;if (!requestedMetadata) { requestedMetadata = true;audio.preload = 'metadata';audio.load(); } } };
    audio.addEventListener('loadedmetadata', () => { if (pendingSeek !== undefined) { audio.currentTime = pendingSeek;pendingSeek = undefined; } }, { signal });
    const updateTime = (time: number) => { music.time = time;scrub.value = String(time);output.textContent = `${time.toFixed(2)} SEC`;updateMusicStatus();wake(); };
    scrub.addEventListener('input', () => { const time = Number(scrub.value);seek(time);updateTime(time); }, { signal });
    audio.addEventListener('timeupdate', () => updateTime(audio.currentTime), { signal });
    const playButton = document.createElement('button');playButton.type = 'button';playButton.className = 'volume-play mono';
    const syncPlayback = () => { playButton.textContent = audio.paused ? audio.ended ? 'REPLAY SCORE ↺' : 'PLAY SCORE ▶' : 'PAUSE SCORE Ⅱ';playButton.setAttribute('aria-label', audio.paused ? 'Play Minuet score' : 'Pause Minuet score');updateMusicStatus();wake(); };
    const togglePlayback = () => { if (audio.paused) { if (audio.ended) seek(0);void audio.play().catch(() => { musicStatus.textContent = 'AUDIO UNAVAILABLE'; }); } else audio.pause(); };
    playButton.addEventListener('click', togglePlayback, { signal });
    for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, syncPlayback, { signal });
    syncPlayback();
    let activeDrag: { index: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    scenes.forEach((world, index) => {
      const view = world.view;
      view.tabIndex = 0;view.setAttribute('role', 'group');view.setAttribute('aria-description', index === 2 ? 'Drag or use arrow keys to rotate. Space plays or pauses the score. Home resets the view.' : index === 0 ? 'Drag or use arrow keys to rotate. Keys 1 through 6 select a field. Home resets the view.' : 'Drag or use arrow keys to rotate. Keys 1 through 3 select a channel. Home resets the view.');
      release.push(() => { view.removeAttribute('tabindex');view.removeAttribute('aria-description'); });
      view.addEventListener('keydown', event => {
        if (event.target === view && index < 2 && /^[1-6]$/.test(event.key)) {
          const selected = Number(event.key) - 1, buttons = index === 0 ? schemaButtons : channelButtons;
          if (selected < buttons.length) { event.preventDefault();buttons[selected].click();return; }
        }
        if (event.target !== view || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',...(index === 2 ? [' '] : [])].includes(event.key)) return;
        event.preventDefault();
        if (event.key === ' ') { togglePlayback();return; }
        if (event.key === 'Home') world.target.set(index === 2 ? -.45 : -.12, -.24);
        if (event.key === 'ArrowLeft') world.target.y -= .12;
        if (event.key === 'ArrowRight') world.target.y += .12;
        if (event.key === 'ArrowUp') world.target.x -= .12;
        if (event.key === 'ArrowDown') world.target.x += .12;
        world.target.clamp(new THREE.Vector2(-.9,-1.1), new THREE.Vector2(.9,1.1));wake();
      }, { signal });
      view.addEventListener('pointerdown', event => { if (event.target instanceof HTMLElement && event.target.closest('a,button,input')) return;world.hover = -1;view.classList.remove('is-hovering-plate', 'is-hovering-object');if (index === 0) updateSchemaStatus(world.selected);if (index === 1) clearChannel();if (index === 2) updateMusicStatus();activeDrag = { index, x: event.clientX, y: event.clientY, startX: world.target.x, startY: world.target.y, moved: false }; }, { signal });
      view.addEventListener('pointermove', event => {
        if (!activeDrag || activeDrag.index !== index) {
          if (event.pointerType === 'touch') return;
          const rect = view.getBoundingClientRect();fit(rect.width, rect.height, index, passage(rect.top, rect.height));world.group.updateMatrixWorld(true);
          pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(world.pickables, false)[0];const hovered = hit ? index === 2 ? hit.instanceId ?? -1 : Number(hit.object.userData[index === 0 ? 'field' : 'channel']) : -1;
          if (hovered !== world.hover) {
            world.hover = hovered;view.classList.toggle(index === 0 ? 'is-hovering-plate' : 'is-hovering-object', hovered >= 0);
            if (index === 0) updateSchemaStatus(hovered >= 0 ? hovered : world.selected, hovered >= 0);
            if (index === 1) channelButtons.forEach((button, i) => button.classList.toggle('is-preview', i === hovered));
            if (index === 2) updateMusicStatus();wake();
          }
          return;
        }
        const dx = event.clientX - activeDrag.x, dy = event.clientY - activeDrag.y;
        if (event.pointerType === 'touch' && !activeDrag.moved) {
          // Commit only after the gesture has an axis; vertical swipes belong to native scrolling.
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
          if (Math.abs(dy) >= Math.abs(dx)) { activeDrag = null;return; }
        }
        if (Math.abs(dx) + Math.abs(dy) > 7) { activeDrag.moved = true;view.setPointerCapture(event.pointerId);world.target.set(THREE.MathUtils.clamp(activeDrag.startX + dy * .004, -.9, .9), THREE.MathUtils.clamp(activeDrag.startY + dx * .005, -1.1, 1.1));wake(); }
      }, { signal });
      view.addEventListener('pointerup', event => {
        if (!activeDrag || activeDrag.index !== index) return;
        const moved = activeDrag.moved;activeDrag = null;if (moved) return;
        const rect = view.getBoundingClientRect();fit(rect.width, rect.height, index, passage(rect.top, rect.height));pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(world.pickables, false)[0];if (!hit) return;
        if (index === 0) document.querySelectorAll<HTMLButtonElement>('[data-field]')[hit.object.userData.field]?.click();
        if (index === 1) document.querySelectorAll<HTMLButtonElement>('[data-channel]')[hit.object.userData.channel]?.click();
        if (index === 2 && hit.instanceId !== undefined) { const note = notes[hit.instanceId];selectedNote = hit.instanceId;seek(note.start);updateTime(note.start); }
      }, { signal });
      view.addEventListener('pointercancel', () => { activeDrag = null; }, { signal });
      view.addEventListener('pointerleave', () => { if (world.hover >= 0) { world.hover = -1;view.classList.remove('is-hovering-plate', 'is-hovering-object');if (index === 0) updateSchemaStatus(world.selected);if (index === 1) clearChannel();if (index === 2) updateMusicStatus();wake(); } }, { signal });
      const actions = document.createElement('div');actions.className = 'volume-actions';view.after(actions);
      if (index === 2) actions.append(playButton);
      const reset = document.createElement('button');reset.type = 'button';reset.className = 'volume-reset mono';reset.textContent = 'RESET VIEW ↺';actions.append(reset);
      reset.addEventListener('click', () => { world.target.set(index === 2 ? -.45 : -.12, -.24);wake(); }, { signal });release.push(() => actions.remove());
      if (index !== 1) view.classList.add('world-ready');
    });
    function passage(top: number, height: number) { return THREE.MathUtils.clamp((innerHeight - top) / (innerHeight + height), 0, 1); }
    function fit(width: number, height: number, index: number, progress: number) {
      camera.aspect = width / height;
      const distance = Math.max(index === 1 ? 4.1 : 3.2, (index === 1 && innerWidth < 701 ? 4.8 : 5.6) / camera.aspect) / Math.tan(THREE.MathUtils.degToRad(19));
      camera.position.set(Math.sin((progress - .5) * 1.4) * 1.1, (progress - .5) * .7, distance * (index === 1 && innerWidth < 701 ? .84 : 1) * (1.12 - .12 * Math.sin(progress * Math.PI)));
      camera.lookAt(0, 0, 0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    }
    function draw(now: number) {
      frame = 0;if (dead || document.hidden) return;
      const interval = innerWidth < 701 ? 1000 / 30 : 1000 / 60;
      if (lastFrame && now - lastFrame < interval - 1) { wake();return; }
      elapsed += lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;lastFrame = now;
      let any = false;
      scenes.forEach(world => world.labels.forEach(({ el }) => { el.hidden = true; }));
      renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
      scenes.forEach(world => {
        const r = world.view.getBoundingClientRect();if (r.bottom <= 0 || r.top >= innerHeight) return;any = true;
        world.rotation.lerp(world.target, .12);world.depth += (world.targetDepth - world.depth) * .12;const floating = activeDrag?.index === world.index ? 0 : 1;
        const progress = passage(r.top, r.height);
        const arrival = 1 - THREE.MathUtils.smoothstep(progress, .05, .42);
        const departure = THREE.MathUtils.smoothstep(progress, .7, 1);
        const sweep = (arrival - departure) * floating;
        currents[world.index].uTime.value = elapsed;currents[world.index].uArrival.value = arrival;
        world.group.scale.setScalar(1 - arrival * .16);
        world.group.position.z = -arrival * 1.2;
        world.group.rotation.set(world.rotation.x + Math.sin(elapsed * .48 + world.index) * .045 * floating, world.rotation.y + Math.sin(elapsed * .35 + world.index) * .12 * floating + sweep * .55, Math.sin(elapsed * .28) * .025 * floating + sweep * (world.index === 2 ? -.09 : .07));
        world.group.position.y = Math.sin(elapsed * .65 + world.index) * .09 * floating;
        if (world.index === 0) {
          const points: THREE.Vector3[] = [];
          plates.forEach((plate, i) => { const selected = i === world.selected, hovered = i === world.hover;plate.position.set((i % 3 - 1) * 2.95, i < 3 ? 1.18 : -1.18, (i % 3 - 1) * (world.depth + arrival * .65) * 1.6 + (selected ? .6 : hovered ? .32 : 0) + Math.sin(elapsed * .9 + i * .8) * .16);plate.rotation.y = (i % 3 - 1) * world.depth * -.2;plate.scale.setScalar(THREE.MathUtils.lerp(plate.scale.x, selected ? 1.075 : hovered ? 1.05 : 1, .16));(plate.material as THREE.MeshStandardMaterial).color.set(selected ? '#315bff' : hovered ? '#e8efff' : '#b8c8fa');reticles[i].visible = selected || hovered;world.labels[i].el.classList.toggle('selected', selected);world.labels[i].el.classList.toggle('hovered', hovered && !selected);world.labels[i].position.copy(plate.position).add(new THREE.Vector3(0, -.28, .1));points.push(plate.position.clone()); });
          schemaTraceGeometry.setFromPoints(points);
          const travel = (elapsed * .65) % (points.length - 1), segment = Math.floor(travel);
          courier.position.lerpVectors(points[segment], points[segment + 1], travel - segment);courier.position.z += .12;
        } else if (world.index === 1) {
          contextPlanes.forEach((plane, i) => { const selected = i === world.selected, hovered = i === world.hover;plane.position.set(i * world.depth * .75, (i - 1) * world.depth * .85, (1 - i) * (world.depth + arrival * .7) * 2.1 + Math.sin(elapsed * .7 + i) * .13 + (i > 0 ? selected ? .5 + i * 3 : hovered ? .3 + i * 2.8 : 0 : 0));if (i > 0) (plane.material as THREE.MeshStandardMaterial).opacity = selected ? .09 : hovered ? .15 : .06;world.labels[i].el.classList.toggle('selected', selected);world.labels[i].el.classList.toggle('hovered', hovered);world.labels[i].position.copy(plane.position).add(new THREE.Vector3(-2.5, i === 0 ? 2.8 : 2.2, .08)); });
          channelWaves.forEach((wave, channel) => {
            const positions = wave.geometry.getAttribute('position');
            for (let j = 0; j < positions.count; j++) positions.setY(j, Math.sin(j * .25 - elapsed * 2.2 + channel) * (.16 + .1 * Math.sin(j * .07 + elapsed)));
            positions.needsUpdate = true;
          });
        } else {
          // Keep exact score coordinates and playback time; light supplies ambient motion.
          noteMaterial.emissive.set('#506942');noteMaterial.emissiveIntensity = .18 + .12 * Math.sin(elapsed * 1.4);
          head.position.x = -5.4 + world.time / 12.3 * 10.8;
          notes.forEach((note, i) => bars.setColorAt(i, color.set(i === world.hover ? '#f8ff94' : world.time >= note.start && world.time <= note.start + note.duration ? '#ffffff' : '#c4e6b7')));if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
        }
        fit(r.width, r.height, world.index, passage(r.top, r.height));world.group.updateMatrixWorld(true);
        const projected = new THREE.Vector3();world.labels.forEach(({ el, position }) => { projected.copy(position);world.group.localToWorld(projected);projected.project(camera);const inset = Math.min(world.index === 1 ? 75 : 40, r.width / 4);el.style.left = `${r.left + THREE.MathUtils.clamp((projected.x + 1) * .5 * r.width, inset, r.width - inset)}px`;el.style.top = `${r.top + THREE.MathUtils.clamp((1 - projected.y) * .5 * r.height, 12, r.height - 12)}px`;el.hidden = false; });
        if (world.index === 1) {
          // Keep channel captions distinct even when depth collapses the planes.
          let previousBottom = r.top + 8;
          [...world.labels].sort((a, b) => parseFloat(a.el.style.top) - parseFloat(b.el.style.top)).forEach(({ el }) => {
            const top = Math.min(r.bottom - 12, Math.max(previousBottom + 24, parseFloat(el.style.top)));
            el.style.top = `${top}px`;previousBottom = top;
          });
        }
        renderer.setViewport(r.left, innerHeight - r.bottom, r.width, r.height);renderer.setScissor(r.left, Math.max(0, innerHeight - r.bottom), r.width, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));renderer.render(world.scene, camera);
      });
      renderer.domElement.style.visibility = any ? 'visible' : 'hidden';renderer.domElement.dataset.frames = String(Number(renderer.domElement.dataset.frames || 0) + 1);
      if (any) wake();else lastFrame = 0;
    }
    function wake() { if (!frame && !dead && !document.hidden) frame = requestAnimationFrame(draw); }
    function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 701 ? 1 : 1.5));renderer.setSize(innerWidth, innerHeight);wake(); }
    const observer = new ResizeObserver(resize);views.forEach(view => observer.observe(view));observer.observe(document.body);release.push(() => observer.disconnect());
    window.addEventListener('scroll', wake, { passive: true, signal });window.addEventListener('resize', resize, { passive: true, signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame);frame = 0;lastFrame = 0; } else wake(); }, { signal });
    resize();return { dispose };
  } catch (error) { dispose();throw error; }
}
