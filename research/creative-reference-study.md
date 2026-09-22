# Creative reference study — Signal / Trace

Research date: **19 September 2026**. All external links below were consulted on that date; publication/update dates are distinguished from access dates. Scope: latest objective sections 49–61 and the unresolved references in `research/revamp-direction.md`. This is a bounded technical study, not implementation or visual QA.

**Evidence boundary:** only official documentation, maintainer source, award-organizer records, and creator-authored case studies are used. Extracted text/source was read with web tools. No rendered sites, videos, pointer interactions, or mobile layouts were observed; no shared CUA browser was used. “Documented” means the source states or implements it. “Apply” is our proposed adaptation, not a claim about the reference's appearance or this portfolio's current behavior. Undated documentation and `main` source links are mutable, not release-pinned.

## 1. Recent creative developers and Awwwards

**Nathan Dallaire / Metalab — creator account published 8 January 2026.** His [technical project retrospective](https://tympanus.net/codrops/2026/01/08/from-whats-a-string-to-sites-of-the-day-nathan-dallaires-high-end-web-experiences/) identifies Next.js, GSAP and Sanity; describes a system of frames/windows activated by scroll, hover and movement; and reports Site of the Day, Developer Award and Portfolio Honors. The same article describes Monolith's view toggle as differently sized boxes transitioning into one another and its carousel as custom interpolation of item sizes/transforms. These are author-reported awards and techniques; publication date is not the award date.

**Apply:** selecting a Lab repository should change one inspection surface and its surrounding trace, preserving spatial orientation. A project may occupy a different shape/scale without forcing every project into identical cards. Keep a visible selection and explicit open-project link.

**Thibault Guignand — creator case study published 6 May 2026.** [Shader uniforms to clip-path wipes](https://tympanus.net/codrops/2026/05/06/from-shader-uniforms-to-clip-path-wipes-how-gsap-drives-my-portfolio/) documents an OGL implementation, despite the article's Three.js tag: one progress uniform coordinates a noise-threshold block mask and displacement that peaks midway; a persistent flowmap receives pointer velocity; only transition videos upload to GPU; the effect suspends when idle. These are concrete implementation descriptions, not our measurements. Award status was not established for this portfolio.

**Apply:** a single transition scalar should drive Trace deformation and media reveal together. Endpoints must restore an undistorted screenshot. Retain Three.js here; changing renderer merely to match this reference adds no demonstrated value. Its RGB styling and scroll-triggered automatic navigation are not recommendations for Ethan.

**Award verification limit:** Awwwards' [official listing containing Bruno Arizio Portfolio](https://www.awwwards.com/websites/%23223F36/?page=25) records Developer Award and SOTD on **2 February 2025**. The [dedicated entry](https://www.awwwards.com/sites/bruno-arizio-portfolio) initially resolved but subsequent content retrieval timed out. The [portfolio index](https://www.awwwards.com/websites/portfolio/) likewise failed on follow-up, and the attempted Metalab detail URL did not yield usable evidence. Do not infer shaders from global technology filters, or call these the latest September 2026 winners. This sample establishes recent published practice, not an exhaustive awards survey or an observed visual trend.

## 2. Renaud Rohlinger — measurement as part of graphics craft

**Documented:** Rohlinger's official [stats-gl repository](https://github.com/RenaudRohlinger/stats-gl) (undated current README) supports FPS, CPU and GPU timing for WebGL/WebGPU, including Three.js and worker use. GPU timing depends on extension support; the README notes Safari timer-query feature flags. Its API includes initialization, updates and disposal. This is a usable technical reference from the developer, not evidence of his homepage's shader implementation.

**Apply:** compare the hero at rest, under pointer pressure and during collapse; distinguish CPU layout work from GPU shader cost. Tune particle count, DPR and render-target resolution independently. A missing GPU timing extension must be recorded as unavailable, not as zero cost. Keep instrumentation out of the public interface.

**Limit:** [his portfolio](https://renaudrohlinger.com/) yielded biographical/search text, while the existing research records an empty graphics-driven extraction. Neither establishes current composition, shaders, frame rate or interaction quality. No imitation of its recognizable layout is justified by this evidence.

## 3. Locomotive — editorial restraint and scroll ownership

**Documented:** Dust Leblanc's official [Lightship case study](https://medium.com/@LocomotiveMTL/lightship-x-locomotive-innovation-needs-a-companion-6bae307882a8), **9 October 2025**, traces a change from immersive product storytelling to clearer, more modular product selection. It explicitly describes rebuilding layouts as the product range grew. This supports purposeful changes in information density; it does not let us judge the studio homepage's grid or type scale.

The current [Locomotive Scroll README](https://github.com/locomotivemtl/locomotive-scroll) documents a Lenis-based library, separate intersection observers for triggers/animations, native scrollbar/keyboard support, and automatic mobile parallax disabling. These are maintainer claims, not an accessibility audit, and should not be confused with older implementations of the library.

**Apply:** reserve expansive choreography for flagship work; use legible DOM composition for experience and human copy. One scroll source should drive the canvas and corresponding DOM transforms. Do not add Locomotive Scroll alongside another smoothing loop. Its mobile default is a library behavior to evaluate, not permission to remove mobile art direction.

## 4. Lusion — media choice follows the required interaction

**Documented:** Edan Kwan's [Oryzo BTS, part 2](https://blog.lusion.co/oryzo-bts-part-2-7-3d-design-and-motion-graphics), updated **21 April 2026**, describes rejecting image sequences/video for insufficient interactivity and trying Gaussian splats from Houdini multi-camera renders. Sampling only the final eased camera spline gave inadequate coverage; hemispherical/spherical sampling worked better. This is an asset-pipeline lesson, not evidence that splatting is appropriate for every web scene.

In [part 3](https://blog.lusion.co/oryzo-bts-part-3-7-website-ux-ui-and-illustrations), also updated **21 April 2026**, Kwan and Andrii Ovsiannikov document limiting typography and colors so content can carry the performance, with deliberate exceptions for transitions and hand-drawn details.

**Apply:** keep authentic project screenshots readable; use geometry only where manipulating that material communicates something. Quiet DOM copy between the hero, project transformations and Lab supplies pacing. A frog/annotation can be a personal discovery within that system. No splat pipeline or generated imagery is warranted for Signal/Trace by these findings.

**Limit:** neither Oryzo nor [Lusion's current homepage](https://lusion.co/) was rendered. Cinematic quality, timing and mobile fidelity remain unobserved; the article's offline film techniques must not be labeled browser effects.

## 5. Active Theory — adapt input while retaining the concept

**Documented, historical:** the studio-authored [Mira technical case study](https://medium.com/active-theory/mira-exploring-the-potential-of-the-future-web-e1f7f326d58e), **25 January 2016**, describes assigning mouse/finger velocity to spawned particles, then applying attraction/repulsion and lifetime decay. It documents Three.js rendering, translating 2D input into world space, and varying particle count, postprocessing and calculation complexity for devices. This is historical technique evidence, not a recent stack recommendation.

**Apply:** give pressure on the name an input direction, bounded influence and recovery. Touch and keyboard activation should feed the same scene state through different controls. Reduce simulation density on mobile while keeping the name-to-trace transformation.

**Limit:** [the current studio site](https://activetheory.net/) returned only “Please enable javascript.” No current spatial navigation, immersive quality or frame-rate claim is supported. Do not transplant Hydra/native-platform assumptions into this website.

## 6. Component sources — mechanics, not composition

| Reference / date | Evidence actually read | Custom adaptation and limit |
| --- | --- | --- |
| React Bits [Variable Proximity source](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/content/TextAnimations/VariableProximity/VariableProximity.jsx), undated `main` | Measures letter centers; maps pointer distance to linear, squared or Gaussian falloff; interpolates font axes. Visual characters are hidden from assistive technology with a full-text counterpart. The rAF loop continues even when unchanged input skips work. | Use bounded weight pressure on a short heading. Cache measurements until layout changes and sleep when settled. A weight-only font cannot acquire a width axis by configuration. The [demo page](https://reactbits.dev/text-animations/variable-proximity) yielded no usable text; feel and touch ergonomics are unobserved. |
| Aceternity [Chromatic Image docs](https://ui.aceternity.com/components/chromatic-image), undated | Documents native WebGL, directional channel separation, displacement, tilt, cover cropping, resize observation and fallback-image alt text. | Reuse pointer-to-image displacement reasoning inside the shared stage; avoid another context for each screenshot. Keep RGB separation absent unless a specific project meaning warrants it. Docs are not proof of fallback correctness. |
| Aceternity [Dither Shader docs](https://ui.aceternity.com/components/dither-shader), undated | Documents ordered dithering, Bayer/halftone/noise/crosshatch modes, palette, grid size, threshold and optional animation. | Consider one monochrome transition from a real screenshot to Trace marks. Restore full image fidelity when selected. Do not dither small UI text or animate texture continuously as wallpaper. Shader implementation and performance were not inspected. |
| Motion Primitives [TextEffect source](https://raw.githubusercontent.com/ibelick/motion-primitives/main/components/core/text-effect.tsx), undated `main` | Separate segment/container transitions, staggered exits, configurable semantic tag and hidden full text for word/character modes. “Line” splitting uses explicit newline characters, not measured wrapping. No reduced-motion branch appears in this file. | Borrow restrained label enter/exit timing and a clipped wrapper, using existing DOM code. Handle responsive wrapping and reduced motion explicitly. The [docs URL](https://motion-primitives.com/docs/text-effect) returned 403; source review does not certify library-wide accessibility. |

The local package manifest currently lists Three.js and font packages, without React/Motion/GSAP. These examples do not justify adding a framework just for proximity text or label transitions.

## 7. Codrops — one shared DOM/GPU stage

**Primary tutorial:** Ben Paine's [persistent transitions](https://tympanus.net/codrops/2026/06/30/building-persistent-page-transitions-with-webgpu-and-vanilla-javascript/), **30 June 2026**, uses persistent planes with CSS-pixel bounds measured from DOM slots. Bounds belong either to DOM tracking or to transition code: detach, interpolate, then attach to destination slots. The author explicitly says the approach also works with WebGL. The sample loads textures at startup and uses empty image slots; those simplifications are not production requirements.

**Apply:** one selected screenshot can travel from a DOM-aligned preview into its flagship scene without a second crossfading copy. Preserve a real image/alt fallback, preload only near-term media, and remeasure after font load/resize. On interruption, capture current bounds before giving ownership to the next transition. Never let scroll tracking and a tween write those bounds simultaneously.

**Backend caution:** the creator-authored [Cerebrium case study](https://tympanus.net/codrops/2026/07/23/building-cerebrium-making-serverless-infrastructure-tangible/), **23 July 2026**, reports abandoning its r183.2 WebGPU/TSL implementation because startup compilation across multiple environments was too slow, while acknowledging subsequent Three.js improvements. That is a version-specific shipping account, not a benchmark of our installed version. It strengthens the case for measuring startup before changing backend; it does not prove WebGPU is generally slower.

## 8. Browser-native choices (§61)

The official MDN references for [registered custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property), [View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), and [scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) were consulted on the research date.

Proposed division: CSS clipping for short label reveals; a typed `--progress` for a DOM mask; SVG for the static trace; scroll timelines for independent DOM progress where supported. View Transitions can bridge DOM states, but do not supply continuous live GPU geometry ownership. Feature-detect enhancements and preserve visible resting states. No universal browser-support or compositor-performance claim is made here.

## 9. Synthesis to carry into implementation

These are design decisions inferred from the evidence and brief, not observations of reference sites:

| Area | Concrete decision |
| --- | --- |
| Three composition ideas | Typeset name becomes material; one changing project inspection surface replaces repeated cards; quiet full-width editorial intervals separate dense scenes. |
| Three interaction principles | Input must alter the material meaningfully; selection persists beyond hover; direct manipulation has tap/button/keyboard equivalents and recovery. |
| Three motion principles | Assign one owner per animated property; carry the same object between states; concentrate deformation between legible endpoints and stop rendering after recovery. |
| Two GPU techniques | DOM-measured persistent image planes; one progress-controlled mask/displacement treatment tied to Trace, rather than unrelated effect presets. |
| Two typography techniques | Distance-weighted variable-font pressure on short display text; clipped, staggered label transitions with intact semantic text. |
| Two mobile lessons | Author portrait typesetting and touch input around the same governing concept; reduce density/postprocessing before deleting interaction. |
| Two patterns to avoid | Ambient RGB/fluid effects with no relation to the work; identical floating cards or hover-only galleries that obscure project identity. |

Bounded next prototypes: **(1)** name pressure → trace recovery, **(2)** one authentic screenshot moving between measured slots, **(3)** Lab selection changing that same inspection stage. Before retaining them, inspect interruption/reversal, resize, keyboard/touch, reduced motion and idle cost. Those are future acceptance checks; this research performed none of them. Bruno Simon's earlier findings remain in the existing direction document and were not re-audited in this remaining-reference pass.

## Whiteout — user-added reference, 2026-09-20

Primary URL: https://whiteout.overvac.com/ . Web text extraction failed; the live site loaded in the in-app browser. Visually observed at 1280×720: Base Camp is a full-viewport 3D mountain environment with foreground snow, tents and flags, a giant sparse title at lower left, altitude at upper left, and a thin ascent route at right. Selecting the Cwm route link moved the camera into a pale, open valley between cliffs. Geometry, illumination, weather depth, and camera position carry the scene change; text fades during the journey and the route/altitude provide continuity.

Application: the portfolio needs spatial continuity, not only several WebGL widgets. Carry one trace and its depth through project contexts; give the camera a controlled scroll path and make project structures large enough to inhabit the composition. Retain native DOM content and direct navigation. Do not copy the mountain environment, snow, altitude narrative, or expedition visual identity.
