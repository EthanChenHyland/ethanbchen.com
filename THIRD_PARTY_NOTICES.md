# Third-party notices

## 4elements (Opus 5.5 app)

Source: https://github.com/TheOrcDev/4elements/tree/main/apps/opus-5.5

Parts of this site's 3D system are adapted from that app:

- `src/world/CameraRig.ts` is a TypeScript port of `src/core/CameraRig.js` (OrbitControls plus cinematic fly-to transitions with cylindrical interpolation), changed to use a configurable pivot, azimuth limits, an idle sway in place of auto-orbit, and instant cuts for reduced motion.
- `src/world/PostFX.ts` adapts the finish pass (vignette, film grain, fade) and composer layout of `src/fx/PostFX.js`; the heat-haze and chromatic-aberration stage was removed and bloom made optional per quality tier.
- `patchMaterial` in `src/world/shared.ts` adapts `src/gl/patch.js`.
- The render loop, focus logic and adaptive pixel ratio in `src/world/World.ts`, and the frame-time watcher in `src/quality.ts`, follow the structure of `src/App.js`.

The scene, objects, views, interface and visual design are this site's own.

MIT License

Copyright (c) 2026 ElementBench contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Hash without Sine

The GLSL hash functions in `src/world/shared.ts` are "Hash without Sine" by Dave Hoskins, MIT License, as used in 4elements' `src/gl/glsl.js`.

## Fonts

- Switzer by Indian Type Foundry, from Fontshare, under the ITF Free Font License.
- IBM Plex Mono, SIL Open Font License 1.1 (`public/fonts/licenses/ibm-plex-mono-LICENSE.txt`).

## Photographs

The Nashville photographs in `public/media/nashville/` come from Wikimedia Commons; titles, authors, licences and source pages are listed in `public/media/nashville/credits.json` and credited in the site footer.
