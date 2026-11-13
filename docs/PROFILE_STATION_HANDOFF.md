# Profile station handoff

The Profile station (back left, the former Earth slot; dock key 2) is a faceless pearl digital
person in a midnight tuxedo, standing on a dark-glass stage beside a vertical **PROFILE** identity
artifact, surrounded by an orbiting field of the AI models the person works with. It does the
things the person actually does: quick chess, piano, clarinet and multi-model AI work. This note
records the frozen state.

The shared rules live in [HUB_STATION_DESIGN_SYSTEM.md](HUB_STATION_DESIGN_SYSTEM.md); the
quality baseline is in [RESUME_STATION_POSTMORTEM.md](RESUME_STATION_POSTMORTEM.md). Neither is
repeated here.

> **Design principle: temporal richness, spatial restraint.** A lot happens over time; little
> happens at once. One small event at a time, often. Never a permanent web of lines, a particle
> storm or a cloud of logos round the head.

**Profile is frozen.** Do not reopen it for broad visual redesign. Real bugs, cross-station
consistency and the final global mix are the only reasons to touch it (see
[Freeze constraints](#freeze-constraints)).

---

## Concept

- **The person behind the work.** The figure is the profile icon grown into a full body: smooth,
  faceless and luminous, so it reads as a person and an identity, never as a likeness.
- **The person's real interests**, from the résumés: quick chess (national online ranking),
  first-chair clarinet, piano, and LLM evaluation and multi-model work (Prompt-Off, Clarity,
  Codex).
- **A digital self.** Between activities the body passes between being a body and being
  information (the *phase grammar*), and the AI identities it works with orbit it as one field.
- **A person who knows where you are.** The head turns first, the torso follows and the feet
  re-step; it never spins on the spot.

## Architecture

| File | Role |
|---|---|
| `src/elements/Profile.js` | The station: build, stage, figure, interaction states, attention, the living-body layer (`#body`), effect layers (`#layers`), the lower-body event sequence (`#lowEvent`, `#seamStart`), pelvis clear zone (`clearK`, `clearBehind`), visibility-driven placement (`#chooseHome`), picking (`pickVisible`), review states |
| `src/elements/ProfileBody.js` | The body as a signed distance field (ellipsoids and round cones), meshed with surface nets and skinned to a 30-bone skeleton; `collarLine`; the internal structure lines; `meshFromSDF` for the shell. `FIGURE_SCALE = 2.5` (a 1.8-unit human stands 4.5 tall) |
| `src/elements/ProfileShell.js` | The tuxedo: one skinned mesh (jacket, shirt, tie, trousers, shoes tagged per vertex) on its own skeleton, so it can lag the body. Shirt V, tie, collar line and collar leaves are drawn per pixel from the bind-pose position. Tie pendulum, breath swell, seam light, low-model graze, leg rim |
| `src/elements/ProfileRig.js` | Pose model and solver: planted feet with a step planner, contrapposto weight spring, spine chain, two-bone leg IK, arm IK with intents |
| `src/elements/ProfilePhase.js` | Pearl body material and the phase grammar shader (charge, slice, cells, expose), ghost bodies (`Ghost`), pose history (`PoseHistory`), the constellation/cell point cloud (`Cloud`) |
| `src/elements/ProfileActivities.js` | Chess, piano, clarinet, AI compare, the rare crown (max-aura) and full phase; activity scheduling |
| `src/elements/ProfileModels.js` | The AI field: 12 presences with their official marks, per-model orbits, low passes, keep-outs, summons and answers, crown arrangement |
| `src/elements/ProfileOrbits.js` | Event-launched capsules with short trails, one stage ring and its signal bead |
| `src/elements/ProfileLabel.js` | The PROFILE identity artifact (vertical word on one glass pane with a light-core rail) |
| `src/elements/ProfileFX.js` | Effect pools: particles, arcs and curves, model auras, attended trails, rings, one roaming light |
| `src/audio/ProfileSound.js` | The station's voice: additive harmonic cues, the morph voice and the idle atmosphere |
| `src/assets/ai-marks/` | First-party AI marks (`SOURCES.md` records where each came from) |
| `src/App.js` | Profile station class, Profile focus-orbit window, visible-first picking, orbit-window turn-back fix |
| `src/audio/Soundscape.js` | Creates `ProfileSound`, routes its idle atmosphere past the distance bus, sets presence by focus |
| `src/fx/PostFX.js` | Frame-validity guard (non-finite pixels dropped, single-pixel radiance capped at 24) |
| `src/ui/glyphs.js`, `src/world/Platform.js`, `src/config.js` | The canonical Profile glyph (see [Glyph](#glyph)) |

## The figure

**Body.** Pearl ceramic material (`MATERIALS.a` in `ProfilePhase.js`): warm-white glaze, lilac
sheen and a faint nacre shift with angle, faint flowing internal light paths, a soft inner glow on
the face plane. The head is entirely smooth and faceless; direction reads from its shape.

**Head, neck and shoulders** (the construction that finally reads as one figure):
- the head sits low enough that the jaw meets the neck, not a peg;
- the neck tapers from a wide base into the skull, with a separate flare cone hidden under the collar;
- two trapezius cones slope from the neck base into the shoulders;
- the jacket follows the body's own shoulder slope up to `collarLine` (no flat cut across the shoulders);
- a single rounded collar band wraps the neck; the shirt front runs up into it without a break;
- the body's `covered` mask uses the same collar line, so the neck is fully solid above the collar (an
  earlier fixed-height mask left a black ring).

**Tuxedo.** Midnight navy jacket and trousers, white shirt, deep red tie, dark shoes. Jacket and
shirt share one continuous surface; where one stops and the other begins is drawn per pixel
(two nearly coincident meshed surfaces tore into ragged edges). The trousers are two separate leg
surfaces below a rounded crotch, and the jacket hem flares slightly so it clearly overhangs them (a
mesh bridging the thighs stretched into a "web" when the stance opened). The suit has its own
skeleton driven from `PoseHistory`, so in phase states it lags and opens to its edges, the tie last.

**Rig and motion** (`ProfileRig.js`, `Profile.js#body`):
- **Feet are planted** and the body turns by stepping (`want()` → `#plan()`, step sequences).
  During chess, piano, clarinet and AI compare the stance is fixed: weight moves through ankles,
  knees, pelvis and torso, never through a step.
- **Arm IK** takes four intents: wrist target, elbow pole, palm normal and finger direction. It
  maps each bone's real bind direction (assuming straight-down bind bones missed every reach by
  about 7 cm). Forearm twist is rate-limited and reset between reaches (no palm flips).
- **The living layer.** Breathing (chest, clavicles, shirt front, tie), a slow weight cycle across
  both legs with feet planted, and a glance led by the head that propagates down neck → chest →
  pelvis. Posture sway, nod and twist run on unrelated slow periods (`wob`), with tiny passive
  arm, wrist and finger motion. Every posture channel is a critically damped spring (`#cd`).
- **Head hysteresis.** Beyond its range the head holds its side, and a change of side is a turn.
  The 180° wrap used to snap it 98° in one frame when the camera orbited behind a planted stance.

## Interaction states

| State | Behaviour |
|---|---|
| Overview idle | Steps aside on its stage to stay visible from the overview (`#chooseHome`, `predictVisibility`); activities begin only where the overview can see them. Idle micro-events one at a time; lower-body events; evolving AI field |
| Hover | Wakes in about 150 ms: `hover-ack` cue, PROFILE sweep, orbit planes tilt toward the viewer and tighten, the lead model comes to the shoulder, lower passes speed up, one full-body wrap and a seam light, stage bloom; relaxes over about a second |
| Focus flight | Scan of light up the body, `activate` cue, the figure turns to the camera (a flight to focus may step) |
| Arrival | `settle` cue, the spine comes true, one soft stage ring; calm |
| Focused idle | Life returns with real camera drift from the settled focus direction (5–35°, `driftCurve`); never frozen |
| Re-engagement | Graded by drift (4–30°): small re-select is a quiet acknowledgement; larger drift collapses copies inward, tightens AI lanes, rebuilds the PROFILE pane and swells the stage, alongside the unchanged reframe flight (`onReframe`) |
| Return | `release` cue; the station relaxes to overview behaviour |

## Activities

Program: chess → models → piano → models → chess → clarinet (`ProfileActivities.js`). An activity
starts only when the figure is visible from the overview, standing still and not mid-turn. The
rare events (crown or full phase) run at most every 150 s, unfocused, after three cycles.

- **Chess.** An off-body board; a real puzzle position (White Qb3, Kf2; Black Kh1). Candidate
  selves try Qg3 (stalemate) and Qb1+ (escape), then it plays Qh3# and taps the clock.
- **Piano.** A curved key field forms round the hands; a short phrase is played; score and
  performance align above the keys (PianoMir).
- **Clarinet.** A proportioned instrument held at the mouth plane; grip placed by the palm (left
  hand on the upper joint, right on the lower), restrained fingering, a bore wave and fingering rings.
- **AI compare.** Models come forward, the same prompt goes to each, each answers in its own form,
  two are weighed (beating tones), one is chosen.
- **Max-aura (crown), staged over 12 s.** Recognition → full-colour halo → identity split →
  constellation → ribbons → stage → PROFILE parting → reflection → peak (no white flash) →
  controlled collapse.
- **Phase grammar.** Charge, slice (layers sliding), cells, constellation (dissolve and
  reconstruct), delayed echoes, candidate selves, structure exposed. Driven per bone, plus the scan
  and a whole-body term for the rare full phase.

## AI field

`ProfileModels.js`. Twelve models in three tiers (primaries, second ring, deep field). They always
show their own colours; nearer, more awake ones are brighter. ChatGPT is kept a peer, never the
lead.

- **Orbits.** Each model has its own radius, angular speed, vertical excursion and swing rhythm
  (`ORBIT`): varied inclination, eccentricity and node drift, and a quarter run the other way.
  There is no carousel and no single loop.
- **Prominence.** A rotating set of three is awake (21 s per set, every identity leads in turn),
  primaries stay faintly present, and models in the head/shoulder zone share that space instead of
  piling up.
- **Low passes.** Up to three at a time (four on hover), one starting every 2–3 s. Styles
  (`LOW_PASS`): hip, thigh, behind the legs, pedestal, shoulder-to-low arc, outer thigh, and
  ankle-to-far-shoulder. Low passes fold behind or beside the legs and speed along their orbit, so
  they move through the space and never park.
- **Keep-outs**, all fed through springs so nothing jumps:
  - a radial floor from the body's axis;
  - viewer-line keep-outs (radial round the line of sight) for the head, shirt front, pelvis,
    thighs and knees, and the PROFILE column;
  - a final 3D clearance from the bone capsules (`BODY_SEGS`).
- **Smoothing.** Position is a critically damped spring (`_sp`); the avoidance offset is a second
  spring (`_av`), because the reference camera jumps at a flight start.
- **Validity contract.** A model is drawn only from a finite transform; anything non-finite falls
  back to its slot.
- **Attention.** Hover tilts the planes toward the viewer and tightens radii. Re-engagement
  tightens the lanes in proportion to drift, then reopens them.

## Effects hierarchy

- **Tiers** (`Profile.js#layers`, a spring): rest 0.18 < hover 0.46 < focused idle 0.35–0.65 by
  drift < activity 0.8 < rare event 1.0.
- **Upper and middle body:** idle micro-events, one at a time every 3–5.5 s (harmonic arc at a
  hand, chess-square outline, spine nudge, tie glint, arm echo, pearl light down an arm, head
  flicker, candidate path, arc between hands).
- **Lower body** (`#lowEvent`, every 1.4–4 s, one at a time):
  - seam light from the torso down one outer trouser seam into the stage (or back up);
  - halo segments round one calf or knee, with a few motes;
  - one large hairline wrap behind the shoulder, hip, calf and stage;
  - a stage skim rising behind a calf;
  - an ankle-to-shoulder rise.
- **Legs:** a faint living rim travels down the trousers. The lowest passing model grazes the
  nearer leg with its colour.
- **Stage:** violet under-light following the pelvis; a glow under the bearing foot; the lowest
  passing model's colour on the floor; one stage ring and a signal bead; the reflection.
- **Pelvis clear zone** (`clearK`, `clearBehind`). Lines (arcs, curves, trails) fade where they
  cross the crotch in projection. A line whose straight route would cross it is routed behind the
  hips. Lower-body curves are generated round the body from the viewer's side, never across it.
- **Roaming light.** It never sits on the face (it blew the pearl head to white) and never drops
  low enough to make a hot spot on the glossy floor.

## Audio

`src/audio/ProfileSound.js`. The station's root is D3 (146.83 Hz); everything is additive partials.
The body's state is its timbre: solid sounds with the full series, open sounds hollow (odd partials).

- **Cues:** hover-ack (a detuned chord gliding into tune), activate/settle, reselect/reengage
  (graded), release, steps, the AI exchange (tokens out/back, model-in, beating comparison),
  chess, piano and clarinet notes, crown, phase.
- **Idle atmosphere** (no oscillator held on a note):
  - four bands of filtered air, each with a wandering centre frequency, its own breathing, stereo
    drift and long silences, one through a slowly sweeping comb;
  - sparse glassy partial clusters that are never the same twice;
  - quiet pass-bys triggered by low passes, seam light, the stage bead and PROFILE pulses.
- **Atmosphere routing.** It has its own path (it bypasses the distance-scaled bus, which is
  silent at the overview). Presence: 0.35 at the overview, 0.55 when Profile is focused, 0
  when another station is focused; ducked to 0.45 during activities.
- **Measured levels:**
  - idle about −58 dBA at the overview and −55 focused;
  - hover −39, focus −37, re-engagement −43 / −40, activities −35 to −37.5;
  - Profile reads −120 dBA (the measurement floor) when Resume or Projects is focused.
- **Tone check.** No spectral peak is present more than about 30% of the time, and at most about
  1.5% of the energy is below 300 Hz.
- **The old persistent hum is gone and must not return.** That was a harmonic bed that was
  always on.

## Glyph

Canonical in `src/ui/glyphs.js` (`GLYPH_STROKES.profile`):
- a faceless head ring open at the upper right, with a single point in orbit in the opening;
- split shoulders either side of a vertical identity axis (the tuxedo lapels and the PROFILE spine).

The shared glyph system supports lines, arcs and points; one definition generates the inline SVG
and the floor shader's distance function. It is used by the dock, info panel, loading ring, centre
floor medallion and the floor mark in front of the station (`Platform.js`, kind 5). No glyph
animation. It must never be a generic person icon, a letter P or an AI-company mark.

## Performance

- Profile is **GPU pixel-bound**; JavaScript is about 4.5 ms per frame and Profile's own CPU
  about 0.6–1.2 ms.
- **Headed Chrome, M1 Pro, 120 Hz, 1512×800 window:**

  | View | Fixed 2× | Adaptive (1.5×) |
  |---|---|---|
  | Profile focus | 46–50 fps | 72–78 fps |
  | Overview | about 32–35 fps | about 57 fps |

- The shipped adaptive resolution is what brings every view near or above 60 fps; full 2× misses
  60 in every view, not only Profile.
- **Measure in headed Chrome at real window size.** Headless at low resolution hides the pixel
  cost. A locked screen stops a headed window from rendering at all (`CGSSessionScreenIsLocked`),
  so check that first. Close any hidden preview pane that is rendering the site, and kill orphaned
  test Chromes before measuring.

## Validation (final passes)

- **Stability.** 17,400 analysed frames (cold loads, overview/hover/focus, every activity, focus
  and drift): 0 flagged frames, 0 NaN, 0 exceptions. Monitors: 0 foot slide, 0 palm flips, 0 logo
  jumps (largest move 0.13 per frame), no one-frame pose snaps.
- **Sound.** Released on leaving (above).
- **Head and neck.** Pass from front, both 3/4 sides, side and elevated.
- **AI presence by zone at idle.** Head/shoulders 19.5%, torso 23%, hips 37%, below the thigh 12%,
  deep 7%. About one low pass every 3 s.

## Important bugs fixed

| Symptom | Cause | Fix |
|---|---|---|
| Purple full-frame flash | `pow()` of a slightly negative base in the ghost shader made NaN; bloom spread it | Clamped, NaN-safe `ndv`; PostFX drops non-finite pixels and caps radiance |
| Startup garbage logos | NaN logo matrices before the camera reference settled | Validity contract; nothing drawn before a valid update |
| Logos jumping 2–3.5 units at every flight start | Avoidance used the reference camera, which jumps to the destination | Avoidance offset on its own spring |
| Logos dragged through the body; logos folded onto one side of the head | Sideways avoidance remembered the entry side and kept pulling a logo back after it passed | Replaced by smooth viewer-line keep-outs (radial, no side memory) |
| Every IK reach ~7 cm short | Solver assumed straight-down bind bones | Bind directions mapped |
| Piano palm flipped ~120° | Stale forearm twist from the previous reach | Twist reset and rate-limited |
| Head snapped 98° | Head-to-torso angle wrapped at 180° | Side hysteresis and a spring |
| Idle weight drift never ran | Bias computed after it was used; pelvis yaw overwritten | Fixed ordering; continuous channels |
| Black ring at the neck; floating collar | Fixed-height cover mask; flat jacket cut | `collarLine` construction |
| Webbed strips at the crotch | Tuxedo mesh bridged the thighs | Separate leg surfaces, rounded crotch |
| Orbit turn-back crawled for tens of seconds | Waited to be within 3° of an asymptotic approach | Turn back within 12° once nearly at rest (`App.js`) |
| Wrong station picked through overlapping volumes | Nearest invisible hit volume won | Visible-first picking (`App.pick`, `pickVisible`) |

## Things explicitly rejected

- The dark "Tempered Figure" slice; the "digital jacket", tunic and casing shells (B, C).
- The orbital ecosystem's clutter: memory nodes, shards, thought frames, knots, giant ellipses,
  lane tracks, node links.
- The Impulse (orange fan) and Order (nested squares) presences.
- Coloured trails behind the logos at rest (read as stray fragments of the marks), and idle orbit
  path lines at head height.
- Any persistent harmonic bed or hum.
- Logo clouds at the head, logos parked in front of the knees, lines across the crotch.
- A second stiff spring for body clearance: it was unstable (11-unit jumps). Don't repeat it
  without finding out why.
- For the glyph: a generic avatar, a letter P, AI-company symbolism, and orbit arcs that read as
  wifi or "speaking".

## Debug parameters

- `?fstate=` picks a review state. The full list is `STATES` in `Profile.js`:
  - `neutral`, `neutral-only`, `hover`, `focus-turn`;
  - `phase-echo|slice|const|cell|combo`;
  - `chess`, `chess-setup|calc|move`, `piano`, `clarinet`, `models`, `ai-foreground`,
    `ai-compare`, `ai-full`, `crown`, `fullphase`, `life`.
- `?ft=` sets the activity time; `?ffz` freezes it; `?fmat=a|b|c` picks the material;
  `?flabel=a|b|c|d` picks the artifact treatment.
- With the hub flags: `?only=profile`, `?noadapt`, `?nointro`, `?focus=profile`.
- `fstate=neutral-only` skips activities. Measure an activity with its own state.

## Known minor issues

- Waiting logos still touch a limb briefly: 81 contacts in 10,414 frames, mostly arms and torso,
  shallow.
- A long mark can cross the edge of the head in focus view, about 2.6% of frames during
  activities and 0% at focused idle.
- Logos pass in front of the PROFILE column in about 10% of frames; the letters render on top.
- Full 2× resolution misses 60 fps (see Performance).

Do not reopen these without a visible problem.

## Freeze constraints

Do not reopen without a new brief:
- the figure, materials, tuxedo and the head/neck/shoulder construction;
- the PROFILE artifact;
- the AI marks and the AI field's behaviour and density;
- the activities and max-aura;
- the phase grammar;
- the lower-body aura and pelvis clear zone;
- interaction states and camera behaviour (focus-orbit window 123–327°);
- the sound and the idle atmosphere;
- the effects hierarchy;
- the canonical glyph.

Reopen only for real bugs, cross-station consistency, or the final global mix and polish.
