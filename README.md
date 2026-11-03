# Ethan B. Chen homepage

Static personal homepage built with Vite, TypeScript, CSS, and Three.js. Project context and source evidence live in `research/`.

## Run, build, and check

Use Node.js 22.12+ and npm. Install the locked dependencies once, then start the local server:

```sh
npm ci
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173`).

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript validation without emitting files. |
| `npm run lint` | ESLint checks for `src` and `tests`. |
| `npm test` | Node's test runner with TypeScript stripping, running `tests/*.test.ts`. |
| `npm run build` | Typecheck, then create the production site in `dist/`. |
| `npm run preview` | Serve the existing production build locally, normally on port 4173. |

For a complete local check:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Check the preview at 1440×900, 1280×720, 390×844 and 320×568, including the desk (drag, click, scroll-driven flights), keyboard navigation, reduced motion, `?q=low`, project links, Minuet playback, `/github/`, and `/resume.pdf`. Unit tests do not replace browser checks. Building and previewing do not deploy the site.

## Architecture

The homepage is one scene: Ethan's desk at night in Nashville, built procedurally in Three.js, with each project as an object on it. The DOM in `index.html` holds every fact (projects, lab, experience, about, contact); WebGL only adds the desk, so the page reads the same without it.

- `src/main.ts` boots the page: menu, section entrances, the lab ledger, Mosaic's board, then (if WebGL 2 is available) the desk. Scrolling through `[data-focus]` sections flies the camera to each project; hero labels are real buttons that follow their objects; clicks on the canvas are raycast to the same destinations. Keys: 1–5 projects, ←/→ step, Esc back to the top.
- `src/quality.ts` picks a render tier (high, standard, low, static) from reduced-motion, pointer type, CPU cores, memory and `?q=`; `FrameBudget` lowers the pixel ratio and then drops bloom and shadows when frames stay slow (`?noadapt` disables it).
- `src/world/World.ts` owns the renderer, the views (`SHOTS`), focus, picking, label projection, the render loop and pausing when no desk section is on screen or the tab is hidden. Reduced motion renders on demand with instant cuts.
- `src/world/CameraRig.ts` and `src/world/PostFX.ts` are adapted from 4elements (MIT, see `THIRD_PARTY_NOTICES.md`).
- Desk pieces in `src/world/`: `room.ts` (desk, lamp, window, procedural skyline with the AT&T Building), `city.ts` (City Settlers miniature with policy-driven growth), `promptoff.ts` (report printer and score screen), `towerlogic.ts` (monitor drawing the pixels → perception → state → decision pipeline), `piano.ts` (keyboard and piano roll from the real Minuet note list), `mosaic.ts` (prints that organise into a board), `props.ts` (FunChessEngine self-play replay, the frog, the lab notebooks, mug and headphones).
- `src/ui/demos.ts` holds the chapter interactions that also work without WebGL: the policy buttons, the Prompt-Off scorer, the TowerLogic stage text, the Minuet player, Mosaic's draggable board and the lab previews. `src/content.ts` holds shared data and the pure scoring helpers that the tests cover.
- About photographs: add 3–5 entries to `PHOTOS` in `src/content.ts` (files under `public/media/photos/`); the About section shows them in a row and stays unchanged until then.
- `vite.config.ts` preserves the `/github` directory route in development and preview by redirecting to `/github/` before the SPA fallback.
- `public/` is served at the site root: fonts, media, project screenshots, Nashville photographs (credited in the footer and `public/media/nashville/credits.json`), piano data, the resume, and the Pond static output under `public/github/`.
- `scripts/build-full-minuet.py` regenerates the Minuet timeline and audio from the tracked MIDI; it is not part of the npm build.

## Deployment

GitHub Pages builds and deploys `main` through `.github/workflows/deploy.yml`. Each deployment runs a clean dependency install, lint, tests, TypeScript validation, and a production build. Only `dist/` is uploaded. The repository Pages custom domain is `ethanbchen.com`; domain DNS is managed separately in Cloudflare.

The apex DNS should use GitHub Pages' four A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`). Use DNS-only records while GitHub validates the domain and provisions HTTPS. Enable **Enforce HTTPS** in repository Pages settings after its certificate becomes available. Keep unrelated DNS records intact.

## Replace the resume

`public/resume.pdf` is the current general resume (`Ethan_Chen_Resume_General_Final.pdf`, November 2026). Its stable public URL is `/resume.pdf`; keep that filename when a newer resume arrives.

1. Review the updated tech PDF and confirm it is the version intended for public download.
2. Copy it without re-exporting or modifying the PDF. Substitute its actual path below:

   ```sh
   cp "/absolute/path/to/updated-tech-resume.pdf" public/resume.pdf
   cmp "/absolute/path/to/updated-tech-resume.pdf" public/resume.pdf
   ```

   `cmp` exits successfully with no output when the files match.
3. Update the source/version notes in `research/resume-content.md` and `research/asset-provenance.md`. If biographical facts changed, reconcile homepage copy against the new document as a separate content edit. Keep exact supported dates, describe completed internships in the past tense, and omit home address and phone from homepage copy.
4. Run `npm run build`, then `npm run preview`; open `/resume.pdf` and confirm the expected version and working download. The existing URL can stay unchanged.

The initial supplied files were `Ethan_B_Chen_Resume_Tech.pdf` and `Canva Resume New.pdf` provided by Ethan. Only the tech PDF is the download; Canva supplied additional corroborating biographical details. The user expects both resumes to be updated.

## Sources and font licenses

See [asset provenance](research/asset-provenance.md), [verified resume content](research/resume-content.md), and [homepage research](research/homepage-direction.md).

Manrope, Instrument Serif (regular and italic), and IBM Plex Mono are self-hosted. Their original SIL Open Font License 1.1 texts are retained in `public/fonts/licenses/`. Keep the corresponding licenses alongside future font updates.

## Project inspection and closing scene

`project-lens.ts` provides the accessible Clarity source-image viewer. The final contact scene uses viewport-relative type and compact spacing to fit desktop and narrow mobile screens while retaining usable links.
