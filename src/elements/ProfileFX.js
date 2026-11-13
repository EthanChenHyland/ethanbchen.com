import * as THREE from 'three';

// The station's effects, organised by layer rather than sprinkled: one particle pool, one arc pool,
// one aura pool and one trail pool (four draws). Everything is semantic: a particle is a response, a
// note's energy, a breath, a reconstruction; an arc is a message between models, a line of search;
// an aura and a trail belong to one model. All positions are station-local.

const clamp = THREE.MathUtils.clamp;
const NP = 900, NA = 40, SEG = 34, NAU = 16, NT = 12, TL = 18, NR = 24;
const _c = new THREE.Color();

export class FX {
  constructor(station, ctx) {
    this.st = station;
    this.group = new THREE.Group();
    this.group.name = 'profile-fx';
    this.#buildParticles(ctx);
    this.#buildArcs();
    this.#buildAuras();
    this.#buildTrails();
    this.#buildRings();
    this.trail = new Map();
    // the spectacle tier (0 rest .. 1 rare event): scales every pool's energy, set by the station
    this.tier = 0.15;
    // one roaming light: whichever effect is brightest lights the figure near it (cheap, faked
    // falloff by a single point light that is always present, so no shader recompiles)
    this.light = new THREE.PointLight(0xd8ceff, 0, 1.6, 1.5); // short reach: lights the figure near an effect, never the glossy floor
    this.lightGoal = { pos: new THREE.Vector3(), color: new THREE.Color(0xd8ceff), k: 0, t: -9 };
    this.group.add(this.light);
  }

  // ------------------------------------------------------------------ pools
  #buildParticles(ctx) {
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(NP * 3);
    this.pCol = new Float32Array(NP * 4);
    this.pSize = new Float32Array(NP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color4', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.parts = Array.from({ length: NP }, () => ({ life: 0, age: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), a: 1, s: 1, to: null, drag: 1.2, rise: 0 }));
    this.pi = 0;
    const m = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: ctx.uniforms?.uPointScale ?? { value: 600 } },
      // a particle near the camera must never become a screen-sized disc (it used to flash the whole
      // frame magenta-white for one frame): its size is capped and it fades out as it nears the lens
      vertexShader: `attribute vec4 color4; attribute float size; varying vec4 vC; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vC = color4; vC.a *= smoothstep(0.8, 2.2, d);
          gl_PointSize = min(size * uScale / max(0.5, d), 40.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vC.rgb * vC.a * a, 1.0); }`,
    }));
    m.frustumCulled = false;
    m.renderOrder = 7;
    this.points = m;
    this.group.add(m);
  }

  #buildArcs() {
    const g = new THREE.BufferGeometry();
    this.aPos = new Float32Array(NA * SEG * 2 * 3);
    this.aCol = new Float32Array(NA * SEG * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.aCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcs = Array.from({ length: NA }, () => ({ life: 0, age: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), lift: 0.3, c: new THREE.Color(), k: 1, packet: true, hold: false, follow: null }));
    this.ai = 0;
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false;
    m.renderOrder = 7;
    this.arcMesh = m;
    this.group.add(m);
  }

  #buildAuras() {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vC = instanceColor * smoothstep(1.0, 2.6, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2); float ring = exp(-(((d - 0.7) / 0.12)*((d - 0.7) / 0.12))) * 0.1; gl_FragColor = vec4(vC * (a + ring), 1.0); }`,
    }), NAU);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NAU * 3), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = 2;
    this.auras = m;
    this.group.add(m);
  }

  #buildTrails() {
    const g = new THREE.BufferGeometry();
    this.tPos = new Float32Array(NT * (TL - 1) * 2 * 3);
    this.tCol = new Float32Array(NT * (TL - 1) * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false;
    m.renderOrder = 2;
    this.trailMesh = m;
    this.group.add(m);
  }

  #buildRings() {
    // expanding rings: stage ripples, bell radiation, a mate's shock wave, a focus contraction
    const m = new THREE.InstancedMesh(new THREE.RingGeometry(0.94, 1, 72, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vC = instanceColor * smoothstep(0.8, 2.4, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }`,
    }), NR);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NR * 3), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = 7;
    this.ringMesh = m;
    this.rings = Array.from({ length: NR }, () => ({ life: 0, age: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), r0: 0.1, r1: 1, c: new THREE.Color(), k: 1, w: 0.04 }));
    this.ri = 0;
    this.group.add(m);
  }

  /** An expanding (or contracting, r1 < r0) ring at `pos`, facing `normal` (default up). */
  ring(pos, o = {}) {
    const R = this.rings[this.ri];
    this.ri = (this.ri + 1) % NR;
    R.life = o.life ?? 1.2;
    R.age = 0;
    R.p.copy(pos);
    R.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), (o.normal ?? new THREE.Vector3(0, 1, 0)).clone().normalize());
    R.r0 = o.r0 ?? 0.1;
    R.r1 = o.r1 ?? 1.2;
    R.c.set(o.color ?? 0xd8ceff);
    R.k = o.k ?? 0.7;
    R.w = o.w ?? 0.05;
  }

  /** Ask the roaming light to light the figure from an effect for a moment. */
  glow(pos, color, k = 1, hold = 0.5) {
    if (k >= this.lightGoal.k * 0.8 || this._now - this.lightGoal.t > hold) {
      // the light stands off the effect (up and out), so it lights the figure near it but never
      // sits on a pearl surface and blows it out
      this.lightGoal.pos.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
      this.lightGoal.color.set(color);
      this.lightGoal.k = k;
      this.lightGoal.t = this._now ?? 0;
      this.lightGoal.hold = hold;
    }
  }

  // ------------------------------------------------------------------ emitters
  /**
   * Particles at `pos`. Options: n, color, speed, spread (0 sphere .. 1 cone up), up (rise per s),
   * life, size, alpha, to (a Vector3 they are drawn to), dir (a preferred direction), drag.
   */
  burst(pos, o = {}) {
    const n = o.n ?? 8;
    for (let i = 0; i < n; i++) {
      const P = this.parts[this.pi];
      this.pi = (this.pi + 1) % NP;
      P.life = (o.life ?? 1.2) * (0.75 + 0.5 * Math.random());
      P.age = 0;
      P.p.copy(pos);
      if (o.jitter) P.p.add(new THREE.Vector3((Math.random() - 0.5) * o.jitter, (Math.random() - 0.5) * o.jitter, (Math.random() - 0.5) * o.jitter));
      const sp = o.speed ?? 0.4;
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (o.dir) d.lerp(o.dir, o.dirK ?? 0.7).normalize();
      if (o.ring) d.y = 0, d.normalize();
      P.v.copy(d).multiplyScalar(sp * (0.5 + 0.5 * Math.random()));
      P.c.set(o.color ?? 0xd8ceff);
      P.a = (o.alpha ?? 0.9) * (0.65 + 0.7 * this.tier);
      P.s = (o.size ?? 0.05) * (0.7 + 0.6 * Math.random());
      P.to = o.to ?? null;
      P.drag = o.drag ?? 1.2;
      P.rise = o.up ?? 0;
    }
  }

  /** A curved arc from a to b; a bright packet travels along it. `hold` keeps it until released. */
  arc(a, b, o = {}) {
    const A = this.arcs[this.ai];
    this.ai = (this.ai + 1) % NA;
    A.life = o.life ?? 1.4;
    A.age = 0;
    A.a.copy(a);
    A.b.copy(b);
    A.lift = o.lift ?? 0.3;
    A.c.set(o.color ?? 0xcfc4ff);
    A.k = (o.k ?? 0.8) * (0.6 + 0.8 * this.tier);
    A.packet = o.packet ?? true;
    A.straight = !!o.straight;
    A.follow = o.follow ?? null; // () => [a, b], re-read each frame
    A.path = null;
    A.routed = false;
    A.detour = null;
    return A;
  }

  /** A hairline through a list of points (a smooth curve round the body), from the same arc pool. */
  curve(pts, o = {}) {
    const A = this.arc(pts[0], pts[pts.length - 1], o);
    A.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    A.routed = true;
    return A;
  }

  // ------------------------------------------------------------------ update
  update(time, dt, c) {
    this._now = time;
    this.tier += ((c.tier ?? 0.15) - this.tier) * Math.min(1, dt * 1.6);
    this.#updateParticles(dt);
    this.#updateArcs(dt);
    this.#updateRings(dt);
    this.#updateAuras(time, dt, c);
    // the roaming light: eases to its effect and fades when nothing asks for it
    const L = this.lightGoal, held = time - L.t < (L.hold ?? 0.5);
    // never on the face: a light parked at the pearl head blew it out to white
    const hp = c.head;
    const lp = this._lp ??= new THREE.Vector3();
    lp.copy(L.pos);
    if (hp) {
      const d = lp.distanceTo(hp);
      if (d < 1.1) lp.sub(hp).setLength(1.1).add(hp);
    }
    // never low enough to pool on the floor; while dark it goes straight to its effect (it never
    // travels visibly from somewhere else)
    lp.y = Math.max(lp.y, 2.85); // more than its reach above the floor: no specular hot spot on the stage
    if (this.light.intensity < 0.02) this.light.position.copy(lp);
    else this.light.position.lerp(lp, Math.min(1, dt * 4));
    this.light.color.lerp(L.color, Math.min(1, dt * 6));
    const goal = held ? Math.min(1.0, L.k * (0.5 + 0.7 * this.tier) * 1.2) : 0;
    // rises and falls smoothly (no exposure jump)
    this.light.intensity += (goal - this.light.intensity) * Math.min(1, dt * (goal > this.light.intensity ? 3 : 1.6));
  }

  #updateRings(dt) {
    const m = new THREE.Matrix4(), sc = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < NR; i++) {
      const R = this.rings[i];
      let k = 0, r = 0.001;
      if (R.life > 0) {
        R.age += dt;
        const u = R.age / R.life;
        if (u >= 1) R.life = 0;
        else {
          any = true;
          // ease out: fast at first, settling; it fades in quickly and out slowly (no pop)
          const e = 1 - Math.pow(1 - u, 2.4);
          r = R.r0 + (R.r1 - R.r0) * e;
          k = R.k * Math.min(1, u * 8) * (1 - u) * (1 - u) * (0.6 + 0.8 * this.tier);
          // a small ring is dimmed in proportion (its thin band would otherwise sum into a hot spot)
          k *= Math.min(1, r / 0.6);
        }
      }
      m.compose(R.p, R.q, sc.set(r, r, 1));
      this.ringMesh.setMatrixAt(i, m);
      _c.copy(R.c).multiplyScalar(k);
      this.ringMesh.setColorAt(i, _c);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceColor.needsUpdate = true;
    // always drawn (black when idle): programs compile at load, so no first-use hitch
    this.ringMesh.visible = true;
  }

  #updateParticles(dt) {
    let any = false;
    for (let i = 0; i < NP; i++) {
      const P = this.parts[i];
      if (P.life <= 0) {
        this.pCol[i * 4 + 3] = 0;
        continue;
      }
      any = true;
      P.age += dt;
      const u = P.age / P.life;
      if (u >= 1) {
        P.life = 0;
        this.pCol[i * 4 + 3] = 0;
        continue;
      }
      if (P.to) P.v.addScaledVector(new THREE.Vector3().subVectors(P.to, P.p), dt * 6);
      P.v.multiplyScalar(Math.max(0, 1 - P.drag * dt));
      P.v.y += P.rise * dt;
      P.p.addScaledVector(P.v, dt);
      this.pPos.set([P.p.x, P.p.y, P.p.z], i * 3);
      const a = P.a * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.3);
      this.pCol.set([P.c.r, P.c.g, P.c.b, a], i * 4);
      this.pSize[i] = P.s;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color4.needsUpdate = g.attributes.size.needsUpdate = true;
    // always drawn (black when idle): programs compile at load, so no first-use hitch
    this.points.visible = true;
  }

  #updateArcs(dt) {
    const pa = this.aPos, ca = this.aCol;
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), mid = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < NA; i++) {
      const A = this.arcs[i], base = i * SEG * 2 * 3;
      if (A.life <= 0) {
        ca.fill(0, base, base + SEG * 6);
        continue;
      }
      A.age += dt;
      if (A.follow) {
        const [a, b] = A.follow();
        if (a && b) A.a.copy(a), A.b.copy(b);
      }
      const u = A.age / A.life;
      if (u >= 1) {
        A.life = 0;
        ca.fill(0, base, base + SEG * 6);
        continue;
      }
      any = true;
      // grows from a, a packet runs to b, then it fades from a
      const grow = clamp(u * 3, 0, 1), fade = 1 - clamp((u - 0.6) / 0.4, 0, 1);
      const pkt = clamp((u - 0.1) / 0.6, 0, 1);
      mid.addVectors(A.a, A.b).multiplyScalar(0.5);
      mid.y += A.straight ? 0 : A.lift;
      // a line whose way across would pass through the pelvis clear zone goes behind the hips instead
      if (!A.routed && this.st.clearK) {
        A.routed = true;
        for (const s of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          p0.lerpVectors(A.a, A.b, s);
          if (this.st.clearK(p0) < 0.85) (A.detour = this.st.clearBehind(1.9));
        }
      }
      if (A.detour) mid.copy(A.detour);
      const at = (s, out) => {
        if (A.path) return A.path.getPoint(Math.min(1, s), out);
        const q = 1 - s;
        return out.set(q * q * A.a.x + 2 * q * s * mid.x + s * s * A.b.x, q * q * A.a.y + 2 * q * s * mid.y + s * s * A.b.y, q * q * A.a.z + 2 * q * s * mid.z + s * s * A.b.z);
      };
      for (let j = 0; j < SEG; j++) {
        const s0 = (j / SEG) * grow, s1 = ((j + 1) / SEG) * grow;
        at(s0, p0);
        at(s1, p1);
        pa.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], base + j * 6);
        const sm = (s0 + s1) / 2;
        const k = A.k * fade * (0.28 + (A.packet ? 1.6 * Math.exp(-Math.pow((sm - pkt) / 0.06, 2)) : 0.6)) * (this.st.clearK ? this.st.clearK(p0) : 1);
        _c.copy(A.c).multiplyScalar(k);
        ca.set([_c.r, _c.g, _c.b, _c.r, _c.g, _c.b], base + j * 6);
      }
    }
    const g = this.arcMesh.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
    // always drawn (black when idle): programs compile at load, so no first-use hitch
    this.arcMesh.visible = true;
  }

  /** Auras and trails for the model presences: brand-coloured, scaled by how awake each is. */
  #updateAuras(time, dt, c) {
    const M = this.st.models, cam = c.camLocal;
    const m = new THREE.Matrix4(), q = c.camQuat ?? new THREE.Quaternion(), sc = new THREE.Vector3();
    const ai = c.aiMode ?? 0, wk = c.wake ?? 0;
    let k = 0, tk = 0;
    for (const p of M.list) {
      const aw = clamp(p.awake ?? 0, 0, 1) + (p.fg ?? 0) * 0.6;
      // each model is a living node: its aura breathes with the spectacle tier
      // a near-white mark's aura would read as a white disc (and dominate): it glows far less
      _c.set(p.def.color);
      const pale = THREE.MathUtils.smoothstep(Math.min(_c.r, _c.g, _c.b), 0.5, 0.85);
      const strength = aw * (0.08 + 0.36 * this.tier + 0.18 * wk + 0.3 * ai) * (1 - 0.75 * pale) * (p.mesh.visible ? 1 : 0);
      // trail: the last positions, for the awake ones
      let tr = this.trail.get(p);
      if (!tr) this.trail.set(p, (tr = []));
      if (time - (tr.t ?? -9) > 0.05) {
        tr.t = time;
        tr.unshift(p.pos.clone());
        if (tr.length > TL) tr.pop();
      }
      if (k < NAU && strength > 0.01) {
        const s = p.size * (1.6 + 0.6 * this.tier + 0.3 * wk + 0.35 * ai) * (1 + 0.08 * Math.sin(time * 2 + p.phase));
        m.compose(p.pos, q, sc.set(s, s, s));
        this.auras.setMatrixAt(k, m);
        _c.set(p.def.color).multiplyScalar(strength);
        this.auras.setColorAt(k, _c);
        k++;
      }
      // (trails retired: a line in the model's colour behind a moving mark read as a stray
      // fragment of the mark itself, e.g. a pale-orange line extending from Claude)
      // short trails only while attended or in AI mode (never at rest)
      if (tk < NT && strength > 0.04 && tr.length > 2 && (wk > 0.3 || ai > 0.3)) {
        const base = tk * (TL - 1) * 6;
        for (let j = 0; j < TL - 1; j++) {
          const a = tr[Math.min(j, tr.length - 1)], b = tr[Math.min(j + 1, tr.length - 1)];
          this.tPos.set([a.x, a.y, a.z, b.x, b.y, b.z], base + j * 6);
          const f = strength * 1.6 * (1 - j / (TL - 1)) ** 1.5 * (this.st.clearK ? this.st.clearK(a) : 1);
          _c.set(p.def.color).multiplyScalar(f);
          this.tCol.set([_c.r, _c.g, _c.b, _c.r * 0.8, _c.g * 0.8, _c.b * 0.8], base + j * 6);
        }
        tk++;
      }
    }
    for (let i = k; i < NAU; i++) {
      m.makeScale(0, 0, 0);
      this.auras.setMatrixAt(i, m);
    }
    this.tCol.fill(0, tk * (TL - 1) * 6);
    this.auras.count = NAU;
    this.auras.instanceMatrix.needsUpdate = true;
    if (this.auras.instanceColor) this.auras.instanceColor.needsUpdate = true;
    this.trailMesh.geometry.attributes.position.needsUpdate = this.trailMesh.geometry.attributes.color.needsUpdate = true;
    // always drawn (black when idle): programs compile at load, so no first-use hitch
    this.auras.visible = true;
    // always drawn (black when idle): programs compile at load, so no first-use hitch
    this.trailMesh.visible = true;
  }
}
