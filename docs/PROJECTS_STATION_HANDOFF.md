# Projects station handoff

The Projects station (front-right; dock key 4) is the Threshold Console: a graphite / gunmetal
computer on a turntable whose screen is the boundary between the station and software. Projects
cross that boundary through portals. This note records the frozen state. The shared rules live in
[HUB_STATION_DESIGN_SYSTEM.md](HUB_STATION_DESIGN_SYSTEM.md); the quality baseline and the
interaction model this station translates are in
[RESUME_STATION_POSTMORTEM.md](RESUME_STATION_POSTMORTEM.md). Neither is repeated here.

## Architecture

| File | Role |
|---|---|
| `src/elements/Projects.js` | The console: build, turntable presentation, interaction states, hardware signals, update loop, debug states |
| `ProjectsScreen.js` | Screen masking (`SCREEN_GLSL`, `BOUND_GLSL`), interior room, `CrossingObject` (objects drawn as surface, contours, edges and samples by depth past the glass) |
| `ProjectsPortal.js` | `Portal` (ellipse, rect, slit, round; micro / normal / major tiers), portal transform, Hermite paths |
| `ProjectsKit.js` | Shared materials, `clippedMaterial`, `outOfGlass` paths, screen planes and labels, `Thread` |
| `ProjectsWorks.js`, `ProjectsPromptOff.js`, `ProjectsVisualJava.js`, `ProjectsBugMuseum.js`, `ProjectsCameos.js`, `ProjectsCloudline.js` | One class per work: `update(t, time, dt, show, variant)` returns focus, event, activity and lamp; physical works expose `physicalNow()` |
| `ProjectsSchedule.js` | `PROJECTS` registry (tier, title, title mode, free deck windows) and `PROGRAM` (entries, overlaps, per-cycle `variants`) |
| `ProjectsHolo.js` | `HoloText` glass-cell type, the persistent `PROJECTS` sign (`Hologram.persist`), `TitleBeat`, `ShowcaseWork` (debug replay of the sign's emergence) |
| `ProjectsAmbient.js` | The ambient portal director: a pool of apertures, scripted acts, continuous loops |
| `ProjectsLab.js` | Deep-screen cameos, background packets, the in-screen micro aperture, the frog |
| `src/audio/ProjectsSound.js` | The station's voice (see Sound) |
| `src/App.js`, `src/core/CameraRig.js` | Camera idle: breathing parameters per context, orbit pace, the Projects orbit arc |

Every physical object is either masked (inside the computer, drawn only through the glass) or physical. Two
rules keep this right: physical-ness switches only when an object is wholly in front of the glass, and the
glass cut is bounded to the screen's outline. Portal frames strip the head's scale. At most one project
event and one small (ambient or frog) event are physical at once.

## Represented projects (15)

- Flagships: TowerLogic, Mosaic, The Great Prompt-Off.
- Featured: Visual Java (GGJavaEZ), BugMuseum (Fencepost, Bottomless Staircase, Integer Overflow,
  Deadlock), Cloudline (tram loop round the console).
- Cameos: WinCodex, FunChessEngine, PianoMir, Clarity.
- Micro cameos: avoid.love, Nitro Notes, the Kitco scraper, ethanbchen.com (this hub), the GitHub
  profile's activity year.
- The frog (also from the GitHub profile) visits on its own clock.

Variants rotate per program cycle (Mosaic `rows`, Prompt-Off `strict`, BugMuseum's four exhibits, the
micro pairs). Each entry opens with a title beat whose cells turn into that project's visuals. Experience
roles are deliberately not here.

## Portal system

Works own their portals. The ambient director adds acts on every face (chains, redirects, screen ↔ air,
deck → screen → top, rear → screen → side, paired faces through the head, a held half-present split,
vent-row slits, tiny apertures, remnants), plus independent loops (a slit crawling along chassis edges,
apertures deep in the screen, the sign's own apertures). Acts favour the side the viewer sees, keep
off the deck while a project is using it (measured `free` windows), and avoid physical travel while the
frog is out. Measured: portal-related activity about 96% of long idle, most of it low-intensity.

## Interaction states (Resume's model, in machine language)

- **Hover:**
  - the console squares to about 7°;
  - an aperture blinks at the screen corner nearest the viewer;
  - the bay lamps wake and a signal runs to the cable;
  - the sign tidies;
  - one acknowledgement cue, gated: re-armed only after a full exit, released on the way out.
- **Click:**
  - the turntable turns to where the camera will arrive;
  - an activation cue plays, the status column fills, ambient transfers resolve;
  - a sustained alignment tone carries the flight and resolves into the settle lock on arrival.
- **Fresh focus:**
  - calm (`calm = focusK · (1 − life)`);
  - the sign fully ordered, apertures and portal/project sound reduced, the program at 40% speed.
- **Focused idle:** `life` rises with the camera's drift from the settled view, exactly as Resume's (`driftCurve(drift, 5, 35, 0.7)`); freedom, sign disruption, portals, sound and program speed follow it.
- **Reselect (`onReframe`):**
  - graded by drift (nothing below 4°, full by 30°) and never stacked;
  - the console realigns, the sign runs a reconstruction pass, transfers resolve, the hardware sweeps, and a graded cue plays.
- **Return:** a release cue, then everything blends back. There are no yaw snaps.

## Viewer-facing orientation

The turntable presents the console to the actual camera at a three-quarter pose, through these terms:
- **Pose:** 12° in the overview, 7° on hover or in a fresh focus, opening to 10° in focused idle.
- **Low-pass:** the camera azimuth is low-passed, so small camera motions aren't chased.
- **Lead:** a small feed-forward lead cancels the lag behind the orbiting camera.
- **Speed cap:** about 5°/s in the overview and up to 16°/s during an excursion, catching up from far off at up to 14°/s.
- **Sway:** ±9°.
- **Excursions:** one every 80 s, to a side or toward the rear (44–66°, about 11 s out and back).
- **Event bias:** at most 18° (60% weight).

The yaw is unbounded, so there's no seam at 360°.

Measured over 10 minutes of overview idle: median 16.5° off the camera, within 30° 93% of the time, never
beyond 90°, at most 3.8 s beyond 60°. Focused idle: median 11–12°, max about 25°. Hover and arrival: 7–8°.

## Hologram

`PROJECTS` stays above the console, facing the viewer. It emerges once at load. After that it rebuilds
itself through six independent loops: edge drift (23 s), a reconstruction wave (37 s), a letter breaking
or re-pixelating (17 s), cells passing through two tiny apertures (71 s), a scan (29 s) and row slip
(47 s). It's readable about 88% of the time. An `order` input (hover, calm, reselect pulse) pulls it
clean as fast as the console turns. It dims while a title plays and while another station is focused.

## Sound

`ProjectsSound` is procedural, on the station's bus. Group gains (`MIX`) and interaction-cue levels
(`CUE`, `HOVER_BED`) sit at the top of the file for tuning.
- **Continuous layers:** a fan for activity; servos (only deviation from the steady turn, never a drone); the glass while crossing; and a hum for works' open portals (ambient apertures are excluded).
- **Events:** each event has a visible cause. Ambient apertures sound by shape; works' portals sound by tier, and major ones get a long swell.
- **Calm:** a fresh focus lowers the portal, project and ambient groups. Beeps and mechanics stay clear.
- **Measured against Resume:** at an equal 12-unit camera distance (A-weighted short-term loudness), the cues sit level with or slightly above Resume's:
  - hover: −38 dBA (Resume −40);
  - click: −42 (Resume −44);
  - large reselect: −42 (Resume −47).
- **Portals:** normal −41, major −37, ambient −52, machine bed −59.

These are not a final mix by ear.

## Camera

These all build on the existing recompose and reframe system:
- **Breathing:** every idle context breathes (overview; Resume lightly; Profile; Experience; Projects).
- **Pace:** the idle orbit's pace varies slowly.
- **Projects focus arc:** the orbit keeps to −62°…+150° around the console. It eases out over the last 28°, rests about a second, and turns back. Resume's page and Experience are never closer than about 5.3.
- **Input and flights:** manual input stops idle motion at once, and it resumes about 7 s after the last input. Nothing idles during flights.

## Debug parameters

- `?pstate=<name>` freezes a named moment (`STATES` in `Projects.js`: works, holo-*, title-*, cl-*,
  bug-overflow, bug-deadlock, frog-*, …).
- `?proj=<work>&pvar=<variant>&pt=<s>` locks one work.
- `?pamb=<act>&pambt=<s>&pambside=±1` pins an ambient act.
- `?pstill` holds the turntable.
- `?psign` starts the sign settled.
- `?pmat=a|b|c` picks the chassis treatment.

Long real-time audits should run against a production build, not the dev server: an edit hot-reloads the
page and silently ends a run.

## Known minor issues

- Micro transfers may read as too light by ear; the hover-hold bed and major-portal swell await a listen.
- Small physical objects (beads, chess pieces, deadlock locks, the tram) read small from the overview.
- The rear reveal still spends up to about 7 s beyond 45° once per cycle of excursions.
- The `ShowcaseWork` replay is only reachable through debug states; the sign's emergence runs once per load.

## Frozen decisions

Do not reopen these without a new brief:
- the station mapping and dock order;
- the console's form and graphite treatment;
- screen masking and the portal continuity model;
- the project registry, tiers and program;
- the title beats;
- the persistent sign;
- the ambient portal ecosystem and its density;
- the viewer-facing turntable model and its parameters;
- the hover, focus, reselect and return states, with their sound;
- the Projects focus-orbit arc;
- the camera breathing in all contexts.

The Projects glyph is still the placeholder.
