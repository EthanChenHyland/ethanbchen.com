# Upstream provenance — 4elements / Opus 5.5 ("Elementa")

This folder is an unmodified reference copy of a third-party app, kept on the
`reference/4elements-opus55` branch only. It is not part of the ethanbchen.com
site and is not meant to be merged into it.

| | |
| --- | --- |
| Repository | https://github.com/TheOrcDev/4elements |
| Source directory | `apps/opus-5.5/` |
| Upstream commit | `5ca5ac434e2aa23674d5d1c6acc02f062420cfee` (2026-10-13, also the last commit touching `apps/opus-5.5`) |
| Live reference | https://www.4elements.dev/models/opus-5.5/index.html |
| License | MIT, © 2026 ElementBench contributors — see [`LICENSE`](LICENSE) (copied verbatim from the upstream repository root) |
| Copied on | 2026-11-02 |

Everything in `src/`, `public/`, `index.html`, `README.md`, `.gitignore` and
`package.json` is the upstream code. The upstream [`README.md`](README.md) documents
the controls, systems and developer URL parameters.

## Changes relative to upstream

1. **`vite.config.js` — `build.outDir`.** Upstream writes the build into the
   monorepo's host app (`../playground/public/models/opus-5.5`), which does not
   exist here. It now builds to `dist/` inside this folder. Nothing else in the
   config changed (`base: './'`, dev port 5190, `open: true`, chunk limit are
   all as upstream).
2. **`package.json` — `overrides` block added.** Upstream installs with pnpm
   from a workspace lockfile that resolves `rolldown@1.2.9` and
   `postcss@8.5.28` under `vite@8.3.0`. A fresh npm install picks newer patch
   releases, which minify three.js slightly differently. The overrides pin the
   upstream versions so the build output is byte-identical to the live
   deployment. Dependencies and their specifiers are otherwise unchanged.
3. **`package-lock.json` — added.** npm lockfile pinning `three@0.186.0`,
   `vite@8.3.0`, `@fontsource/cinzel@5.3.0` and
   `@fontsource-variable/inter@5.3.0`, the same versions as upstream's
   `pnpm-lock.yaml`.
4. **`public/favicon.svg` — embedded `<metadata>` block removed.** The upstream
   file carries a C2PA content-credentials manifest inside `<metadata>`. A local
   file-cleaning hook on the copying machine stripped it on write. The drawn
   icon is unchanged; the file is identical to upstream once that one element
   is removed.
5. **`LICENSE` and this `UPSTREAM.md` — added.**

No application source (`src/**`, `index.html`, styles, shaders) was modified.

## Verification (2026-11-02)

- `npm run build` output (`index.html`, `assets/index-CfxeRAh-.js`,
  `assets/index-BEKgTAbL.css`) is byte-for-byte identical to the files served at
  the live reference URL.
- Frozen-time renders (`?nointro&t=12.5&freeze&noadapt`) of the overview and of
  each `focus=fire|air|water|earth` view were pixel-diffed against the live site
  at 1440×900, 1280×720, 390×844 and 320×568 in Chromium (ANGLE Metal):
  0.000% differing pixels in all 20 cases, no console errors.
- The same interaction script was run against both builds with identical
  results: intro flight, hover tooltip and cursor, click-to-focus fly-to,
  `1`–`4` / `←` `→` / `Esc` / `0`, double-click empty space, `R` / `S` / `H` /
  `F` and the toolbar buttons, drag orbit, wheel zoom, idle auto-orbit (and its
  toggle), touch tap / one-finger orbit / pinch, `q=high|medium|low` pixel-ratio
  clamping, and `only=water`.

## Run

```bash
cd experiments/4elements-opus55
npm ci
npm run dev       # http://localhost:5190 (opens a browser tab)
npm run build     # -> dist/
npm run preview   # serves dist/ on http://localhost:4190
```

Requires Node.js 20.19+ or 22.12+.
