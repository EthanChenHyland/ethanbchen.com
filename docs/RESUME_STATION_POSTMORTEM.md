# Resume station postmortem

Technical record of the Resume station: what it is, what went wrong while building it, how each
problem was fixed, and what to carry forward. The reusable rules are distilled in
[`HUB_STATION_DESIGN_SYSTEM.md`](HUB_STATION_DESIGN_SYSTEM.md).

---

## 1. Scope and final result

- **Slot:** Fire's (azimuth −45°, front left). Resume took over Fire's role as the scene's warm
  key light.
- **Artifact:** a monumental self-writing résumé. A large, smooth, letter-folded page is written by
  a machined stylus whose tip is the moving key light, surrounded by a physical paper ecosystem.
- **State:** frozen. Reopen only for real bugs, cross-station consistency, or the final global
  mix and polish.

**Commits on `rebuild/ethan-opus-hub`** (history is independent of `main`; the branch root is the
clean Opus copy):

| Commit | What |
| --- | --- |
| `1b8b071` | Clean Opus 5.5 reference (also the tip of `reference/4elements-opus55`) |
| `6271806` | First slice: rebrand and content plumbing, Fire replaced by a Miura-folded sheet |
| `9837cc0` | Larger, more open folio and the writing stylus |
| `1578377` | Startup black-frame fix (adaptive pixel-ratio resize) |
| `20fab61` | Resume finished: letter-fold sheet, page hierarchy, paper ecosystem, glyph, soundscape |
| `e2a4c60` | Overview camera recomposition and breathing; `onReframe` hook |
| `a3212f2` | Inherited hub drone removed |
| `60d9ff7` | Focused-idle paper life, reframe reaction, clipping fixes, tumble continuity, pen trim |
| `a5e373f` | Focused Resume camera recomposition |
| `b587a5f` | Drift-scaled reframe reaction, earlier focused life, obstacle clearing |

**Main files**

| File | Role |
| --- | --- |
| `src/elements/Resume.js` | Sheet geometry and shader, page print texture, stylus and its state machine, margin slips, attention (focused life, re-engagement), fibers, dust volume |
| `src/elements/ResumePaper.js` | Loose paper ecosystem (aeroplane, crumpled balls, strips, letter, scraps), lanes and separation pass |
| `src/audio/ResumeSound.js` | Resume's procedural voice on its Soundscape bus |
| `src/ui/glyphs.js` | Canonical stroke glyph → SVG and floor-shader distance function |
| `src/core/CameraRig.js` | `recompose()` / `endRecompose()` (shared with the overview) |
| `src/App.js` | `RECOMPOSE`, `FOCUS_RECOMPOSE`, `#focusRecompose`, `onReframe` call, deferred resize |
| `src/config.js` | Resume's panel content, color, glyph name, URL, focus view |

## 2. Early concept failures

| Problem | Cause | Fix | Lesson |
| --- | --- | --- | --- |
| Too small and timid next to the other stations | A compact folded object replaced Fire's large flame and brazier | Scaled up repeatedly (final sheet 3.8 × 4.9 at height 3.75) | Station scale matters; check the overview first |
| Read as an accordion or chevron block, not a résumé | Deep Miura-ori fold (first 8 × 10, then 6 × 10 columns) | Replaced by one smooth sheet in a shallow Z letter fold with two soft creases and a broad curl | Semantic clarity beats clever geometry |
| A glowing sheet had no verb | Light and breathing alone | A machined stylus that visibly writes, lifts, travels and writes elsewhere | A station needs a clear physical action |
| Stylus tip blew out the paper | Point light too strong and too close | Tip light cut about 65%, offset from the page; a fill light behind the sheet keeps its form | The moving light should modulate the scene, not dominate it |
| Writing path looked like probing terrain | The stylus followed every crease of the folded mesh | The stylus and mesh both use one smooth analytic surface (`#point`/`#surface`) | Follow document logic, not every contour |
| Still not Opus-level aura | One object, little surrounding life | Secondary paper ecosystem (section 4) | Aura comes from several coherent consequences of one idea |
| Back of the page burned white in rear orbits | Fill light too close behind the sheet | Fill moved back and lower (z −2.9); glow through the paper rebalanced | Check side and rear views, not only the default camera |

Planning detours worth knowing: a row-by-row "crease printing" mechanism was rejected as over-designed
and loading-screen-like. "Written by its own light" was considered, then superseded by the stylus.

## 3. Final visual hierarchy

- Large centered `RESUME`, tracked capitals, with a rule beneath; permanent print.
- Sections in résumé order: **EDUCATION** (2 lines), **EXPERIENCE** (8 lines, three bold, the
  heaviest), **PROJECTS** (5), **SKILLS** (3, tighter spacing). Headings bold, about half the title's
  cap height (enlarged ~1.55×).
- Body lines are representative graphite bars (bold bars for role lines), written by the stylus.
  They fade by receding from their end. This is not the literal résumé.
- Bone paper, near-black graphite; ink softer while idle, darkest when fresh, crisp in focus.

## 4. Paper ecosystem

Every piece runs its own long cycle with different periods and phases; nothing resets visibly.

- **Main sheet:** breathing flex, slight edge movement, a soft give under the stylus; flatter on
  hover, nearly flat in focus.
- **Stylus:** writes lines; hops within a section or arcs to a faded line elsewhere; once per
  aeroplane cycle writes a line on the docked note; in focus, final serpentine pass, then parks at
  the top-right corner and occasionally underlines (ochre marks that fade).
- **Margin slips (5):** three index tabs on the right edge, an annotation slip and a card on the
  left. Each peels off, drifts, tumbles and settles back.
- **Paper aeroplane:** a note docked at the lower right is written on, folds into a dart, flies a
  banking loop around the station, glides back, lands and unfolds.
- **Crumpled balls (2):** orbit low and high, open into creased sheets with ink, crumple again.
- **Tracing strips (2):** translucent, curl and straighten.
- **Small letter:** circles, opens and closes its folds.
- **Torn scraps (2):** wide orbits in front of and behind the page.
- **Fibers and dust** gather around the stylus tip. All paper casts moving shadows.

## 5. Aeroplane evolution

| Problem | Cause | Fix |
| --- | --- | --- |
| Snapping risk at launch and landing | Orientation from path-parameter differencing, which vanishes near zero speed | Nose follows real velocity, sampled ±0.12 s around the current moment |
| Bank felt keyed | Bank was a separately clamped term | Bank from lateral acceleration, eased |
| Velocity kinks | The collision pass shoved it the instant it met a slip | Avoidance offsets eased (~0.2 s); docked pose pinned exactly |
| Nose-down landing | It lost height in the last run to the dock | Longer launch and landing ramps; it descends while still circling, so the approach is a level glide |

Result over a full cycle: peak acceleration 65 → about 2.6, largest per-frame rotation 0.14 →
0.04 rad. **Lesson:** fast movers need velocity-based orientation, curvature-based bank and
smooth ramps.

## 6. Clipping and intersection history

| Problem | Cause | Fix |
| --- | --- | --- |
| Audits looked clean while slips visibly crossed the page | Bounding spheres miss thin-surface crossings | Exact audit: each outline ray-cast through the other mesh, both ways |
| Slips crossed the page (~5,000 frames in one audit) | Bow toward the page at 0.012 away; flutter pivoting about the center; peeling turned before it cleared | Bow away from the page; 0.03 gap; flutter hinges on the page edge and only opens outward; peel arcs out on its own side, tumbling later |
| Stylus body through slips | Slips never yielded | Slips yield to the stylus (fully while drifting, half on the margin) |
| Loose paper through slips | Pieces avoided slips using the slips' previous-frame positions | Slips also yield to loose pieces |
| Tracing strip reached the tabs, then the aeroplane lane | Its lane | Short strip moved out (radius 3.8) and below the aeroplane (height 3.0); strips only curl on re-engagement |
| Aeroplane through the low ball and a strip | Fast movers outran eased avoidance | After easing, any overlap left against a higher-priority piece is cleared that frame |
| Wrong separation distances for the aeroplane and strips | Mesh origin ≠ geometric center (dart built from its tail; curled strips shift) | Separate by transformed bounding-sphere centers; strips use their full sphere against the aeroplane |
| Brief tab/ball crossing in long focused drift | Obstacles were cleared only by the eased step | Same immediate clearing against slips, stylus and docked note (not for the aeroplane, to keep its landing smooth) |

Final state: exact audits of idle orbit, hover, focus, long focused drift, repeated reframe
reactions and return all report no crossings.

## 7. Tumble continuity bug

- **Problem:** loose pieces whirled whenever hover or focus began.
- **Cause:** rotation was `time × rate × amount`; changing `amount` jumped the angle by
  `time × Δamount`.
- **Fix:** integrate the phase per piece; `amount` scales its speed (`#tumble` in `ResumePaper.js`).
- **Lesson:** activity should change velocity, never the absolute phase.

## 8. Startup black-frame bug

- **Inherited from untouched Opus.**
- **Cause:** the adaptive pixel-ratio step (`#adapt`) ran after `post.render()` and resized the
  canvas in the same frame, clearing the frame the browser was about to show. The ratio can step
  down up to four times, so slower machines flashed black repeatedly.
- **Fix:** `#adapt` sets `pendingResize`; `#tick` applies it at the start of the next frame,
  before rendering.
- **Why it matters:** any future performance or resize change must never resize after rendering.

## 9. Soundscape

Layers in `ResumeSound.js`, all procedural:

- stylus scratch: graphite band gated by pen contact and shaped by speed; touchdown tap, lift click
- folding: rub and crease texture driven by fold velocity; a crisp set on closing, a soft settle on
  opening (aeroplane note, small letter)
- slip peel and settle; aeroplane touchdown
- aeroplane in flight: thin air and irregular flutter at the aeroplane's position, from speed,
  bank and proximity
- crumple and uncrumple, driven by crumple velocity and distance
- hover: macro "many sheets moving" rush and sheet flutter, driven by reorganization speed, plus
  micro rustles
- a near-silent paper-friction bed

Principle: audio follows visible motion.

## 10. Audio problems encountered

| Problem | Cause | Fix |
| --- | --- | --- |
| Scratch hissy | Spectral centroid around 6 kHz | Band lowered to about 2.3–3.4 kHz with a 5.2 kHz low-pass (centroid about 3.8 kHz) |
| Writing inaudible from the overview | Shared distance curve | Resume curve `(1.3 − d/20)^1.6` (others `(1.3 − d/17)^2`); ×1.35 while focused on Resume |
| Aeroplane sounded synthetic and cinematic | Swept band-pass "whoosh" with a 23 Hz modulation | Thin high-passed air plus irregular paper-flutter grains, more presence close by (`1 + 2·near`) |
| Folds effectively inaudible | Narrow filters removed most grain energy (paper grains around −65 dBFS) | One gain stage for paper grains (`GRAIN_GAIN = 6`) |
| Crumple too loud | — | About 4 dB down, texture unchanged |
| Hover felt silent | Micro rustles can't sell many pieces moving | Macro reorganization layer, gated to hover changes so idle drifting never triggers it |
| Station too dominant | — | Bus base 0.9 → 0.72 (about −1.9 dB) |
| Pen too loud | — | `SCRATCH = 0.75`, then `0.5625` (current value, not a rule for other stations) |
| Paper sounds with no visible cause | Early random rustle and page-turn bursts | Removed; every sound now follows an event |

Each of these was technically measurable but was decided by ear.

## 11. Removed global hum

The original Opus "sanctum drone" (four oscillators at about 55, 82.4, 110.3 and 164.8 Hz under a
low-pass, straight into the master) was constant in every state and level with the station
sounds. It was first trimmed 10 dB, then removed: the oscillators are no longer built
(`Soundscape.js`). With every station bus disconnected the master is now silent. **Lesson:**
inherited atmosphere is not sacred if it conflicts with the new site.

## 12. Focused-idle life

Originally the focused state was static. Now `#stepAttention` measures the angle between the
current focus direction and the settled one (`drift`). Life follows
`driftCurve(drift, 5, 35, 0.7)`, eased at `dt × 1.5`: zero below 5°, about 0.15 at 7°, 0.29 at 10°,
0.46 at 15°, 1 from 35°. Life loosens only activity terms (slip peeling, tumbling, opening); the
clearing of pieces from the camera's view keeps full focus strength.

## 13. Re-engagement

- **Mistake:** the first version made an eligible click on the focused page trigger the paper
  reaction instead of the existing reframe.
- **Fix:** the reframe is untouched; `App.focus()` calls `onReframe()` on a re-selected station
  and Resume reacts alongside the flight.
- **Then:** a 25° binary threshold arrived about 8 s into the orbit, too late.
- **Now:** `driftCurve(drift, 4, 30, 0.6)` gives zero below 4°, about 0.27 at 7°, 0.41 at 10°,
  0.6 at 15°, 0.88 at 25°, 1 from 30°. The pulse rises to that strength (hold 0.35 s, decay
  0.9 s). A new pulse can't start until the last is below 35% of its strength, and during the
  flight drift reads 0, so it never stacks. At the ~3°/s focus orbit the reaction becomes clear
  about 2–2.5 s after the orbit begins. The rustle reuses the hover layers.

## 14. Camera systems added

**Overview** (`RECOMPOSE`, `App.js`; `recompose()`, `CameraRig.js`): canonical post-intro view
(0, 7.4, 16.8) → (0, 2.3, 0), distance 17.557, elevation 16.89°. Above 38° it drifts to 30°;
outside a ±0.15 log-distance dead zone it drifts back to 17.557. Capped at 2°/s and 0.045/s log
distance, easing in and slowing near the goal. Breathing once settled: ±1.5° (27 s and 41 s
periods), ±1.8% (33 s and 52 s), never toward the trigger. Azimuth and target are never changed;
input stops everything the same frame.

**Focused Resume** (`FOCUS_RECOMPOSE`, `#focusRecompose`): the same function, referenced to
Resume's settled focus view (distance 12.861, elevation 5.58°), trigger 20° above it, same
dead zone and rates, no breathing. The focus orbit (~3°/s) is untouched. The explicit reframe
remains separate.

Known limitations (not reachable through user input, left as is):
- a programmatic `jumpTo` during auto-orbit keeps the recovery and breathing state;
- breathing can add up to 1.8% to the distance reading, so a zoom within ~1.8% of the dead-zone
  edge could occasionally tip into recovery (not observed in practice);
- recovery finishes slightly past its goal (about 0.7° in elevation, ~1% in distance) and then
  stops, with no oscillation.

## 15. Regression-audit methodology

The camera work was audited against `20fab61` (finished Resume, before any camera changes):

- serve the baseline from a temporary `git worktree` beside the current build;
- drive identical real input (mouse drags, wheel, keys) via the Chrome DevTools Protocol;
- record the camera every frame against app time;
- measure noise with repeated baseline runs and compare against that spread;
- OrbitControls damping is per frame, so compare drags frame by frame, aligned on the first moving
  frame, not by wall-clock time;
- separate test artifacts (scripted jumps) from real regressions before acting;
- cover intro, manual orbit and zoom, auto-orbit rate, idle, thresholds, interrupts, every focus
  flight, focused idle, reframe, return and edge cases;
- change nothing without a reproduced regression. That audit found none.

## 16. Glyph

- One canonical stroke list (`GLYPH_STROKES.resume` in `src/ui/glyphs.js`): a page outline, two
  written lines, and the stylus finishing the second.
- The SVG (dock, panel, loader) and the floor shader distance function (station mark, medallion)
  are generated from it.
- The medallion's frame was mirrored, which the symmetric triangles had hidden; it is flipped for
  stroke glyphs only.
- The favicon still shows the four-element mark, deliberately, until all four glyphs exist.

## 17. Do not copy literally

Don't copy: paper, the stylus, the aeroplane, fold mechanics, Resume's sounds.

Do copy: semantic depth, multi-system coherence, physical response to interaction, long-idle life,
the focus/readability balance, sound tied to motion, collision rigor, regression discipline.

## 18. Appendix: historical unbuilt artifacts

**Historical / provisional — not approved final direction.** From the first transformation plan,
before Resume was built. The same plan proposed Resume as a Miura-ori folio, which changed
completely in practice, so treat these as starting points to reconsider from first principles. That
plan also put lists in the focused panels; that part is superseded by the panel discipline in the
design system.

**Experience (Air slot): harmonograph / pendulum plotter.** A slender curved arm holds a pivot; a
polished bob on a fine wire swings over a dark slate plate and draws damped Lissajous figures, one
per role, which fade and redraw. Experience as the trace of sustained motion over time: each role
its own rhythm, overlaid into one record. Ideas then: graphite sparks at the pen, a lamp in the bob
throwing a moving wire shadow, the swing growing on hover, the plate tilting toward the camera on
focus with figures separating into dated layers. Proposed reuse: Air's analytic path and ribbon
trails. Glyph idea: a two-lobed decaying loop. Sound idea: pen scratch shaped by pen speed.

**Projects (Water slot): six-piece burr puzzle.** Interlocking machined bars hovering above the
plinth, one per featured project, each a different finish (bead-blasted, polished, black anodized,
iridescent titanium, brass). Projects as constraint problems: each piece only works because of the
others. Ideas then: one piece easing out and back at idle, all pieces easing out on hover, coming
apart into an exploded arrangement on focus. Glyph idea: two crossing bars with an over/under
notch. Sound idea: piece clicks.

**Profile (Earth slot): portrait zoetrope.** A tall machined slotted drum on a spindle with a lamp
inside and translucent frames. A person as a sequence of moments. Ideas then: slit beams sweeping
the floor (from Fire's ray-marcher), the spin speeding up on hover, slowing on focus until one slit
aligns and the frames resolve into a portrait loop (procedural first, real photos later). Glyph
idea: a broken circle of slit gaps around a center dot. Sound idea: projector whir with shutter
ticks.

## 19. Frozen-state checklist

**Current commits:** Resume finished `20fab61`; Resume and camera polish through `b587a5f`.

**Worth reading for reference:** `src/elements/Resume.js`, `src/elements/ResumePaper.js`,
`src/audio/ResumeSound.js`, `src/core/CameraRig.js` (`recompose`), `src/App.js`, `src/ui/glyphs.js`.

**Deferred on purpose:**
- favicon redesign once all four glyphs exist
- global entry screen, ambience and music; final cross-station sound balance
- the deeper `/resume/` page (and the other destination pages)
- global environment polish to judge after all stations exist: rune band, pedestal shape, floating
  underside, Cinzel display font, nebula color
- the mobile gate (phones to get a lightweight links page)
- `README.md` and `UPSTREAM.md` still describe the original Elementa
- Profile, Projects and Experience still run the original Earth, Water and Air elements, voices
  (including Earth's low rumble) and placeholder triangle glyphs
- the rest of the panel copy is placeholder. Degree facts follow the current résumé: Vanderbilt
  University, B.S. Computer Science, with Human and Organizational Development (HOD) as a second
  major (not a minor). The older untracked `research/resume-content.md` is out of date on this.

**Do not reopen unless broken:** Resume geometry, typography, page layout, paper ecosystem
choreography and collision rules, the stylus, Resume's glyph and sound mix, the overview and focused
camera recomposition, overview breathing, the deferred-resize fix, the drone removal.
