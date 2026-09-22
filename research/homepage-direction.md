# SIGNAL / TRACE — research and direction

> Historical research and implementation notes. Earlier pending items are superseded by `runtime-checks.md` and `completion-audit.md`; they are retained here as provenance, not a current task list.

Research date: 2026-09-19. No source repositories modified.

## Source availability

The designated ethanbchen.com workspace was empty at start, with no Git metadata.
No avoid-love / avoid.love checkout was found under /Users/ethius. Source paths
have been requested. The existing local EthanChenPond repository contains the
/github application and its Cloudflare packaging; its Worker intentionally
returns 404 for /. Do not replace or edit that source as a substitute for the
missing main homepage repository.

## Evidence inspected

- GitHub profile and full public repository inventory via GitHub API.
- Local READMEs and architecture: Prompt-Off, Clarity, Piano MIR, TowerLogic,
  FunChessEngine, Mosaic, kitcoscraper, and the profile/Pond projects.
- Public WinCodex and Nitro Notes READMEs.
- Public avoid.love README, main renderer, scroll-map, book input, CSS and QA
  notes. Actual live browser experience inspected. Current local checkout still
  required to check for unpublished differences.
- Authentic frog SVGs, original frog image, piano capture JSON/chroma/notes,
  analysis report and synthesized audio found in profile/Pond repositories.
- Clarity has docs/overlay.png, plus permission/capture screenshots.

## Curated narrative

1. The Great Prompt-Off: language into accountable structure. Explain schema
   labels, public practice vs hidden final evaluation, and strict scoring.
   Synthetic, non-PHI inputs. No private reports, answer keys or access codes.
2. Clarity: context across screen, microphone and system audio. A macOS overlay
   with explicit local/cloud transcription choices and platform constraints.
   Published releases exist; avoid claiming complete real-provider validation.
3. Piano MIR: sound compared with a known score. Rust-first prototype with actual
   recorded outputs. The 12-second synthesized Minuet capture is not a human
   performance grade or blind transcription.
4. avoid.love: software that carries feeling. A 28-chapter interactive story,
   represented with authentic site media, not recreated inside the homepage.

Compact experiment index: WinCodex (independent legacy/modern bridge),
FunChessEngine (search plus a local workstation), TowerLogic (experimental
computer vision), Mosaic (cohesive product behavior), kitcoscraper (practical
business automation), Nitro Notes (offline desktop utility).

## Design

A paper instrument panel meets a typographic monograph. Bone, near-black,
ultramarine. Oversized name, small precise annotations, asymmetrical editorial
spacing. No cards, decorative terminals, dashboard metrics or stack pills.

A continuous trace is a reading device. It starts beside the name, becomes the
workflow route through evaluation, splits into audio channels, passes through
actual piano evidence, then slows to an editorial rule before the ending.
Each project gets a different spatial composition. On mobile the trace occupies
a deliberate margin, with interactions below the relevant text.

One memorable interaction: an inspectable evidence sequence. Visitors move
through a project process with standard buttons/keyboard; scroll may highlight
steps but never withhold copy. Piano audio drives a cursor through authentic
pitch evidence. Clarity uses real screenshot material plus a small channel
selector. The frog is a quiet final mark, with one optional interaction.

## Content constraints

Vanderbilt undergraduate context is user-provided. Current resume, experience
dates, email and LinkedIn URL need source verification. Do not guess them.
Preserve existing routes once the original source is available. /github is an
existing dedicated experience; link to it rather than duplicating its content.

## QA targets

1440x900, 1280x720, 390x844 and 320x568. Traverse whole page, activate controls
and project links, inspect console/overflow, keyboard and reduced motion.
Run actual project lint/typecheck/tests/build. No deployment or commit.

## Source clarification and implementation

The user confirmed there is no prior homepage repository and authorized using
https://github.com/EthanChenHyland/avoid.love as the reference instead of a local
checkout. The earlier source-location blocker is resolved.

The new homepage is a static Vite/TypeScript project with local Instrument Serif,
Manrope and IBM Plex Mono fonts. Existing Pond static output is preserved at
public/github; original source remains untouched. This project does not deploy.

Public asset provenance:
- media/frog.svg: existing photographic ASCII frog from profile assets/demos.
- media/clarity-overlay.png: Clarity docs/overlay.png, authentic project interface.
- media/avoid-love.jpg: avoid.love public/og.jpg, existing project artwork.
- media/minuet.wav: existing Pond captured synthetic Minuet audio.
- data/piano-notes.json, data/piano-provenance.json and data/piano-report.md:
  profile assets/demos captured output from source commit
  a4cedc91875f4ccb697f366cea6e1c4664ec36d1.
- media/chroma.svg: drawn from research/piano-chroma.csv. Max-pooled windows
  preserve recorded evidence; no fabricated metrics. See scripts/build-evidence.py.

Email, LinkedIn and résumé details were requested from the user. They are not
in the available personal-site source, since no personal-site source existed.
Formal experience titles/dates are omitted rather than inferred from repo names.
