# Hub station design system

How to build a station of the Ethan B. Chen hub to the standard of the finished Resume station,
without copying Resume. Written for a future session that knows only this repository.

The Resume-specific history (what broke, why, and how it was fixed) is in
[`RESUME_STATION_POSTMORTEM.md`](RESUME_STATION_POSTMORTEM.md).

---

## 1. Hub philosophy

- **Opus 5.5 is the foundation.** The hub is the 4elements "Opus 5.5" Three.js scene
  (`reference/4elements-opus55`, MIT, see `UPSTREAM.md`) transformed station by station. Its
  technical machinery and composition are kept; its elemental identity is replaced.
- **Change the minimum per station.** Replace one artifact at a time and keep everything else.
- **Each destination is one physical, cinematic artifact** on its pedestal: Resume, Profile,
  Projects, Experience. Individual projects or roles are never top-level stations.
- **The hub is an entrance, not the portfolio.** The focused panel stays concise. Deeper content
  lives on separate pages (`/resume/`, `/profile/`, `/projects/`, `/experience/`, linked from the
  panel's `Open X` chip). Those pages do not exist yet.
- **Semantic clarity.** Someone should be able to guess roughly what a station represents without
  reading its panel.
- **Distinct identity per station.** Each needs its own material and behavioral language.
  Analog, mechanical and material variety is good. Generic sci-fi portfolio visuals are not.
- **Spectacle comes from the meaning of the artifact.**

> **Aura comes from multiple coherent physical consequences of one idea, not from piling
> unrelated effects onto an object.**

Resume is the reference: paper / document / writing → a stylus that writes it → graphite that
fades → sheets that fold, crumple and fly as an aeroplane → annotations and slips → rustling →
reorganization on attention. Every system is a consequence of "a document writing itself".
Future stations need the same systemic depth through **their own** metaphor.

## 2. Preserve-first Opus architecture

Leave these alone unless a station demonstrably needs a change:

| System | Where |
| --- | --- |
| Renderer lifecycle, render loop, resize, adaptive pixel ratio | `src/App.js` |
| Scene setup, fog, sky, stars, motes | `src/App.js`, `src/world/Sky.js`, `src/world/Motes.js` |
| Lighting rig and procedural environment map | `src/world/Lighting.js` |
| Post-processing (haze/CA/HDR clamp → bloom → ACES → vignette/grain/fade) | `src/fx/PostFX.js` |
| CameraRig (OrbitControls + fly-to tweens) | `src/core/CameraRig.js` |
| Station placement, focus views, focus/return flights | `src/config.js`, `App.focus()` |
| Raycast picking, hover, keyboard, dock, toolbar | `src/ui/UI.js` |
| Loader and progress | `index.html`, `src/main.js`, `src/ui/UI.js` |
| Panel markup and styling | `index.html`, `src/style.css` |
| Platform, floor shader, pedestals, rim, underside | `src/world/Platform.js` |
| Sound engine (per-station buses panned by camera) | `src/audio/Soundscape.js` |
| Shader/material helpers, noise | `src/gl/` |

Rules:

- Do not rebuild from scratch or swap in a "cleaner" architecture.
- Do not redesign the environment around each artifact. Replace the artifact first, then judge
  whether the environment genuinely conflicts with it. (The rune band, pedestal shape and floating
  underside were all kept for this reason; they are still on the "evaluate later" list.)
- **No center object.** The open middle and floor medallion are intentional breathing room.
- The four-slot composition stays: Resume −45° (Fire's slot), Profile −135° (Earth's),
  Projects 135° (Water's), Experience 45° (Air's).

## 3. Panel discipline

The focused panel keeps the Opus hierarchy, filled from the station's entry in `src/config.js`:

glyph → eyebrow → name → subtitle → one-line motto → short paragraph (~25 words) → two facts
→ optional `Open X` chip (`url`; `Enter` follows it) → ‹ Back to overview ›

Never turn it into a full résumé, a project list, a skill grid, a dashboard, a large navigation
panel, or floating cards. The artifact carries the story.

## 4. Station state model

Define each of these deliberately for every station:

1. overview idle
2. overview hover
3. focus transition (during the existing focus flight)
4. initial focused state
5. long focused idle (the focus orbit starts after 7 s without input)
6. re-engagement after meaningful focused drift
7. return to overview

The point is not to copy Resume's effects but to make every state intentional and meaningful.
Stations receive eased `hoverK` and `focusK` (0..1) from `App.#tick()`.

## 5. Primary artifact first

A station needs one immediately readable primary artifact before secondary effects.
Resume only worked once its sheet became larger, flatter, plainly a document and dominant from the
overview. Never hide a weak central metaphor behind particles or secondary motion.

## 6. Scale and presence

A station can fail simply by being too small or timid. From the overview each artifact must
command its station, have a strong silhouette, stay legible at hub scale, and feel as important
as the other three.

## 7. Long-idle life

A finished station stays interesting for at least ~30 seconds. Avoid one short obvious loop.
Use several asynchronous systems with different periods and phases, meaningful physical actions,
no visible hard reset, and varied interactions. No chaos for its own sake: everything belongs to
the same metaphor.

## 8. Hover: the artifact notices attention

Hover should not just brighten. It can organize, align, intensify, gather, accelerate, reveal
relationships, become more legible, or physically react. Resume: loose paper draws in and steadies,
the stylus writes faster, and a rustle of many sheets moving accompanies the reorganization.

## 9. Focus: clearer, calmer, more meaningful

Focus is not just the camera moving closer. The artifact becomes more ordered and legible while
staying alive. Pieces between the camera and the artifact move out of the way.

## 10. Long focused idle

Pattern established by Resume (optional, use if it fits):

- the initial focused state is calm;
- when the existing focus orbit carries the view away, restrained life returns;
- it is driven by actual camera displacement (angle from the settled focus direction), not a
  timer alone;
- it stays well below overview intensity.

## 11. Re-engagement after focused drift

When the focused view has drifted and the user re-selects the station (click, dock or key):

- **keep the existing reframe flight** (`App.focus()` with `same === true`) unchanged;
- add an artifact-specific reaction alongside it via the `onReframe()` hook `App.focus()` calls;
- scale its strength smoothly with real displacement. Binary thresholds felt artificial.

Never replace existing navigation or reframe semantics with a new gimmick.

## 12. Camera

### Overview (all stations)

`CameraRig.recompose(dt, cfg)` runs only while the idle auto-orbit is active, not during intro,
flights or input. It works in spherical terms around the current target, so it never changes
azimuth or target. Current values (`RECOMPOSE` in `src/App.js`):

| Setting | Value |
| --- | --- |
| Canonical post-intro overview | position (0, 7.4, 16.8), target (0, 2.3, 0): distance 17.557, elevation 16.89° |
| Overhead trigger / recovery target | above 38° → eases to 30° |
| Distance dead zone | ±0.15 in log distance (about ×0.86–×1.16) |
| Rate caps | 2°/s elevation, 0.045/s log distance; speed eases in and slows near the goal |
| Breathing once settled | ±1.5° elevation (periods 27 s, 41 s), ±1.8% distance (33 s, 52 s); never toward the trigger |
| Overview orbit | `autoRotateSpeed` 0.28 (~1.68°/s), constant |

These numbers suit this geometry; don't reuse them blindly for a new artifact.

### Focused station

`FOCUS_RECOMPOSE` lists which stations take part (only `resume`). The same `recompose()` runs with
a reference derived from that station's own settled focus view (`App.#focusRecompose`), no
breathing, and the focus orbit (`autoRotateSpeed` 0.5, ~3°/s) untouched. Resume: distance 12.86,
elevation 5.58°, trigger 20° above it. Existing limits matter: focus zoom is capped at
`limits.focus` [3.2, 14] and elevation can't go below ~2.7° (`maxPolarAngle`), so for Resume only
"too close" and "overhead" can actually need recovery.

### Recompose versus reframe

- **Automatic recomposition** repairs abandoned bad framing, preserves azimuth, adjusts only
  elevation and distance.
- **Explicit reframe** flies back to the canonical focus pose using the existing tween.

They are different systems. Do not merge them.

## 13. Manual interaction always wins

While the user drags, orbits or zooms, no automatic camera system may act. Any input calls
`App.poke()`, auto-rotate turns off, and `endRecompose()` clears the state that frame. Verified:
zero elevation/distance change on the input frame.

## 14. Collision and intersection discipline

Dynamic stations need explicit collision QA. From Resume:

- Bounding spheres miss thin-surface crossings (sheets, slips, strips).
- Use exact or near-exact tests for thin geometry. Resume's audit ray-cast each piece's outline
  through the other mesh and vice versa (two thin surfaces can only interpenetrate if an edge of
  one passes through the other).
- A mesh origin is not its geometric center. Curled and folded pieces shift their center, and
  pieces built from one end (the aeroplane) are half a body away from it. Separate by the
  transformed bounding-sphere center.
- Fast movers outrun eased avoidance. Clear any remaining overlap immediately after easing.
- Authored safe lanes plus targeted avoidance beat a physics engine.
- Audit long sequences: idle, hover, focus, long focused idle, re-engagement, return. Check the
  high-risk pairs specifically, and fix targeted conflicts.

## 15. Animation continuity

Never compute an absolute phase as `time × rate × amount` when `amount` can change: the angle
jumps by `time × Δamount`. Integrate the phase over time and let activity change the velocity.
(Resume's loose-paper tumble had exactly this bug.)

## 16. Fast-moving objects

Orient by actual velocity, bank from lateral acceleration (eased), don't derive orientation from
path-parameter differences that vanish near zero speed, give launch and landing long smooth ramps,
and give fast movers immediate (not only eased) avoidance.

## 17. Audio: every sound has a visible cause

Each station has its own physical sound identity on its `Soundscape` bus (see
`src/audio/ResumeSound.js` for the pattern). **If you hear it, you should be able to see what
caused it.** Prefer motion- and contact-driven, spatially aware, procedurally varied sounds. Avoid
UI noises, unrelated ambient Foley, short obvious loops and synthetic effects without a cause.

## 18. Macro and micro sound

A large coordinated movement needs a broad macro layer (Resume: many sheets moving through air,
driven by reorganization speed). Tiny individual events (slips, edges, ticks) can't sell it alone.
Design both levels where appropriate.

## 19. Motion-linked sound

Drive sound from the motion itself: Resume's scratch follows stylus contact and speed, folds
follow fold velocity, crumpling follows crumple velocity, the aeroplane follows speed and
proximity, the hover rustle follows reorganization motion. Don't fire canned sounds because a
boolean changed.

## 20. Listening beats meters

Measure for clipping, relative levels, stuck nodes, spectrum and distance falloff, but judge by
ear. Resume repeatedly had technically valid sound that was wrong by ear (see the postmortem).

## 21. Global audio

The inherited Opus "sanctum drone" (four oscillators at 55, 82.4, 110.3 and 164.8 Hz, straight to
the master) was **removed**: it was a constant low hum. Do not restore it. Global ambience, music
and any entry-screen audio will be designed once all four stations exist. Don't mix one station
against music that doesn't exist yet.

## 22. Glyphs

- One canonical definition per station in `src/ui/glyphs.js` (straight strokes on a 24×24 grid).
  The UI SVG and the floor shader's distance function are both generated from it.
- A glyph appears in more places than it seems: dock, panel, loader ring, the floor mark beside the
  station and the center medallion (`Platform.js`). Audit globally.
- Asymmetric glyphs expose mirrored frames that the symmetric elemental triangles hid (the
  medallion needed a flip for Resume).
- Derive the glyph from the finished artifact's strongest motif.
- The favicon is a composite of four glyphs: redesign it only when all four exist.

## 23. Startup black-frame lesson

Never resize the canvas after `post.render()` in the same frame. Resizing clears the image the
browser is about to show. Original Opus did this from its adaptive pixel-ratio step and flashed
black at startup. The fix defers the resize to the start of the next tick (`pendingResize` in
`App.js`). Keep it that way when touching performance code.

## 24. Performance

Don't turn a station pass into a performance rewrite. Keep the adaptive machinery, fix real
regressions you observe, and put design quality first. Phones are to be gated to a lightweight
page later instead of shaping the 3D design.

## 25. Freeze discipline

When a station meets the bar: commit, freeze, stop tweaking. Reopen only for real bugs,
cross-station consistency, or the final global mix and polish. Don't polish one station while
three remain unbuilt.

## 26. Anti-patterns

Floating SaaS cards · holographic panels · dashboards · piles of screens · arbitrary particles ·
random sci-fi effects · unrelated motion · one-loop objects · tiny timid artifacts · rebuilding
Opus · large focus UIs · hard animation resets · obvious synchronized loops · automatic global
camera resets · audio with no visible cause · full physics for every collision · replacing
navigation semantics with gimmicks · polishing one station forever.

## 27. Station workflow

1. Concept planning (several candidate artifacts if unclear).
2. Test semantic clarity; choose one physical metaphor.
3. Define the primary artifact, then its secondary ecosystem.
4. Define idle, hover, focus, focused idle, re-engagement, return.
5. Implement one vertical slice and review it visually.
6. Fix scale and silhouette first, then refine the motion systems.
7. Collision audit.
8. Sound identity; mix by ear.
9. Glyph, propagated everywhere.
10. Regression audit against the previous commit.
11. Freeze; move to the next station.

Never build several unfinished stations at once.

## 28. Historical provisional artifacts (not approved)

From the first transformation plan. **Historical candidates only: reconsider from first principles
before implementing.** Resume is the only frozen final artifact. Details are in the postmortem
appendix.

| Station (slot) | Candidate | Original idea |
| --- | --- | --- |
| Experience (Air, 45°) | Harmonograph / pendulum plotter | Experience as the trace of sustained motion over time; each role its own rhythm, overlaid into one record |
| Projects (Water, 135°) | Six-piece burr puzzle | Projects as interlocking constraint problems; each piece one project, it only works because of the others |
| Profile (Earth, −135°) | Portrait zoetrope | A person as a sequence of moments; an optical device that animates a portrait |

## 29. Resume as the quality reference

A monumental self-writing résumé: a large readable page (centered `RESUME`; Education, Experience,
Projects, Skills) written by a machined stylus whose tip is the moving key light; a paper
ecosystem of margin tabs and slips, a note that folds into an aeroplane, crumpled balls that open
and close, tracing strips, a small letter and torn scraps, all casting moving shadows; sound tied
to every visible paper action; hover reorganization; an ordered focus; focused-idle life and a
graded re-engagement tied to real camera drift; its own glyph; camera-aware behavior;
collision-audited choreography.

Copy the depth and coherence, not the paper.

## 30. Station freeze checklist

- [ ] Semantic clarity without the panel
- [ ] Overview silhouette, scale and presence
- [ ] 30+ seconds of idle life without an obvious loop
- [ ] Hover behavior (attention, not brightness)
- [ ] Focus transition and focused readability
- [ ] Long focused idle
- [ ] Re-engagement alongside the unchanged reframe
- [ ] Automatic camera behavior (if the station takes part) and explicit reframe
- [ ] Exact collision audit through every state
- [ ] Animation continuity (no phase jumps)
- [ ] Sound identity, mixed by ear, spatial behavior
- [ ] Glyph propagated to dock, panel, loader, floor and medallion
- [ ] Return transition
- [ ] No runtime or console errors
- [ ] Regression check against the previous commit for preserved Opus behavior
