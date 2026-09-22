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

Check the preview at desktop and narrow mobile widths, including keyboard navigation, reduced motion, project links, audio playback, `/github/`, and `/resume.pdf`. Unit tests do not replace browser checks. Building and previewing do not deploy the site.

## Architecture

- `index.html` contains the homepage content, sections, accessible controls, and inline graphics; `src/style.css` defines layout, responsive styles, and local fonts.
- `src/main.ts` initializes the interactions and their shared abort lifecycle. `explorers.ts` handles schema/channel controls, `piano.ts` synchronizes audio and the playhead, and `signal.ts` handles the page trace. `content.ts` holds shared copy and helpers.
- `hero-field.ts` / `hero-webgl.ts` turn the actual DOM name into a pressure-sensitive point field with a scroll-to-trace shader.
- `backdrop.ts` / `backdrop-webgl.ts` own the continuous Three.js camera route, ribbon shader, chapter structures, and native anchor navigation. Native scroll controls the timeline. Ribbons ripple automatically, pulses repeat, and chapter structures drift at rest; rendering is capped at 30fps on mobile and 60fps on desktop, pauses in hidden tabs, and is disabled for reduced motion.
- `project-worlds.ts` / `project-worlds-webgl.ts` provide one scissored renderer for the contract planes, Clarity context layers, and captured MIDI notes. Visible scenes float and rotate gently; schema plates drift independently, Clarity routing waves travel, and score lighting breathes without changing note data or playback time. These loops are capped at 30fps mobile / 60fps desktop and stop offscreen or while hidden. DOM controls, keyboard rotation, raycast selection, and native audio remain accessible.
- `media-stage.ts` / `media-webgl.ts` render the authentic avoid.love artwork as a deformable surface with a DOM image fallback.
- `workbench.ts` and `knight.ts` provide the movable repository index and optional legal-knight-move sketch. `pointer.ts` handles contextual pointer labels and bounded magnetic links.
- WebGL modules are dynamically imported. Reduced motion keeps the editorial DOM edition; abort controllers and renderer cleanup handle preference changes and navigation.
- `navigation.ts` stabilizes deep links against loading-induced layout shifts while preserving native smooth anchor scrolling and releasing immediately on user input.
- `vite.config.ts` preserves the `/github` directory route in development and preview by redirecting to `/github/` before the SPA fallback. Homepage links use the canonical trailing slash.
- `public/` is served at the site root and copied into `dist/`: fonts, media, piano evidence, the resume, and the existing Pond static output under `public/github/`.
- `tests/` contains Node unit tests. Selected `research/` documents record design direction, content verification, and asset provenance; local screenshots, logs, and scratch files are not published.
- `scripts/build-evidence.py` derives the chroma SVG and inline score drawing from captured piano evidence. It writes `public/media/chroma.svg` **and `index.html`**; it is a separate maintenance tool, not part of the npm build.

## Replace the resume

`public/resume.pdf` is the current supplied tech resume, copied unmodified. Its stable public URL is `/resume.pdf`; keep that filename when a newer resume arrives.

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
