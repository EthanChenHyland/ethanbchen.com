# Piano MIR Performance Assessment Report

## Final Result / Score-Aligned Verification

- Assessment rubric: `same_source_verification`
- Headline status: `verified_aligned`
- Headline score: 94.78
- Headline score label: Same-source score-aligned verification score
- Headline score source: `score_aligned_note_chroma_matcher`
- Score-aligned final score: 94.78
- Score-aligned note/chroma/timing: 99.86 / 66.95 / 96.01
- Strong / weak / missing expected evidence: 162 / 11 / 0
Score-aligned note/chroma evidence verifies that the audio likely matches the known score; blind transcription remains unreliable and is shown only as experimental evidence.
- Caveat: Score-informed evidence uses the known score, so it is not blind transcription.

## How To Interpret This Result

- The headline score is `94.78` with `medium` confidence and `verified_aligned` verification status.
- Missing expected notes: `0`. Missing expected notes are the main red flag for same-source verification; zero means every expected note had supporting audio evidence.
- The note and timing scores are the strongest same-source signals: they ask whether expected score notes appear at the expected aligned times.
- The chroma score can be lower because piano harmonics, sustain, and audio frontend noise make pitch-class separation imperfect even when the expected notes are present.
- Blind/research scores are preserved below for development comparison, but they are secondary to the score-aligned known-score result for this demo.

## Score-Aligned Note/Chroma Summary

This is the primary known-score engine. It maps score regions through the estimated tempo/start alignment, then checks whether the expected pitch classes have audio chroma evidence near the expected times. It is score-aligned / score-informed, not blind transcription.

For same-source MIDI/render verification, the final score emphasizes expected-note presence and timing. Piano-aware chroma is still reported separately, but harmonic piano energy is treated as supporting evidence rather than the dominant pass/fail signal.

| Metric | Value |
|---|---:|
| Final score | 94.78 |
| Note score | 99.86 |
| Excellent / good / weak / missing / uncertain notes | 145 / 17 / 11 / 0 / 2 |
| Average / median / lowest note match score | 92.37 / 98.96 / 37.24 |
| Weak-note ratio | 6.29% |
| Adaptive chroma score | 66.95 |
| Attack chroma score | 64.36 |
| Sustain chroma score | 66.70 |
| Timing score | 96.01 |
| Expected presence score | 63.25 |
| Expected coverage score | 66.99 |
| Attack expected coverage | 66.41 |
| Sustain expected coverage | 67.71 |
| Missing pitch-class penalty | 24.71 |
| Unexpected chroma penalty | 0.52 |
| Attack unexpected penalty | 0.60 |
| Sustain unexpected penalty | 0.33 |
| Attack / sustain / full / blended regions | 2 / 8 / 32 / 54 |
| Average selected window score | 66.95 |
| Harmonic extra ratio | 0.30 |
| Unrelated extra ratio | 0.70 |
| Confidence level | medium |
| Missing expected notes | 0 |

**Confidence reason:** Medium confidence: score-aligned evidence is mostly consistent, but missing notes, pitch evidence, or chroma support need review.

Weak-but-present notes are not missing notes. In same-source verification they receive substantial partial credit because they indicate audio evidence was found, even if the evidence is not as clean as an excellent/good match.

Weak-note reason counts: low audio energy `0`, weak expected pitch strength `6`, timing window uncertain `0`, chroma noise `0`, short note `4`, unknown `1`.

The chroma score is piano-aware and adaptive: for each score region, the matcher chooses the cleanest reliable chroma window from attack, sustain, full-window, or a close blend. Attack evidence is preferred when it is clean, sustain evidence can win when it carries stronger expected pitch support, and full-window evidence remains the fallback. Missing expected chroma remains a strong penalty.

Score-aligned evidence strongly supports that the known score is present in the audio. This is score-informed, not blind transcription.

## Runtime / Research Profile

| Field | Value |
|---|---:|
| Experiment profile | demo |
| Variants evaluated | 48 |
| Variants available | 48 |
| Max variants | 50 |
| Variants truncated | false |
| Experiment elapsed time | 0.04s |

Demo is optimized for a few-second user-facing run.

## Tempo & Timing Feedback

This section is separate from the final score. It explains musical timing behavior from the same score-aligned note matches, using signed timing offsets for note-region feedback.

| Metric | Value |
|---|---:|
| Tempo stability score | 99.19 |
| Global tempo scale | 1.0006 |
| Mean timing error | 0.3 ms |
| Median timing error | 6.1 ms |
| Max absolute timing error | 11.6 ms |
| Notes within 25 ms | 100.0% |
| Notes within 50 ms | 100.0% |
| Notes within 100 ms | 100.0% |
| On-time / early / late notes | 175 / 0 / 0 |

Tempo is very stable; median timing error is about 6 ms. Early and late deviations are fairly balanced.

Tempo note feedback is exported to `tempo_note_feedback.csv` and local timing windows are exported to `tempo_windows.csv`.

## Visual Chroma Comparison

These exports compare the expected score chroma against observed audio chroma on the same tempo-aligned time axis. Score chroma is the pitch-class activity implied by the score; audio chroma is the detected pitch-class evidence from the WAV. The difference heatmap highlights disagreement, and the timeline shows frame-level match quality over time.

| File | Description |
|---|---|
| `score_chroma_aligned.csv` | expected score pitch-class activity over time |
| `audio_chroma_aligned.csv` | observed audio pitch-class evidence over time |
| `chroma_comparison.csv` | combined score/audio chroma comparison rows |
| `chroma_score_heatmap.svg` | expected score chroma heatmap |
| `chroma_audio_heatmap.svg` | observed audio chroma heatmap |
| `chroma_difference_heatmap.svg` | score/audio disagreement heatmap |
| `chroma_comparison_timeline.svg` | frame match score timeline |

## Run Details

- Input score JSON: `excerpt-score.json`
- Input audio WAV: `minuet.wav`
- Output directory: `piano-run`
- Audio preset: `midi_clean`
- Experiment profile: `demo`
- Analysis mode: `midi_clean_controlled`
- Controlled MIDI-clean mode: use only when score JSON and WAV are generated from the same MIDI source.
- Assessment status: `valid_assessment`
- System limitation type: `unknown`
- Performance grade: not available
- Assessment status reason: Assessment is valid for this experimental system because confidence is high, diagnostic gap is small, and reliability is 80.3/100.
- Confidence: `high`
- Short interpretation: The tempo-aware assessment is fairly strong for this experimental system.

## Same-Source MIDI Verification

The score and audio were marked as same-source MIDI. The system therefore treats the musical match as expected by construction and reports whether the audio render appears aligned. A low blind pitch/chroma score should be interpreted as frontend uncertainty unless verification evidence indicates mismatch.

- Verification status: `verified_aligned`
- Reason: Score/audio were marked same-source MIDI, timing aligns, audio energy is present in expected score regions, and pitch extraction reliability is acceptable.
- Audio presence score: 96.44
- Timing alignment reliability: 95.59
- Pitch extraction reliability: 78.97
- Audio frontend reliability: 85.08
- Score regions with audio energy: 100.00%
- Silent expected regions: 0.00%
- Treat low blind score as mismatch: no

## Score-Informed Expected-Note Evidence

This section checks whether expected score pitch classes have audio evidence near their tempo-adjusted expected times. It is score-informed and is not a blind transcription score or a performance grade.

- Score-informed match score: 94.56
- Expected note evidence score: 91.13
- Expected region evidence score: 91.13
- Strong / weak / missing expected evidence: 163 / 10 / 0
- Onset / sustain evidence scores: 94.13 / 85.56
- Best evidence source: `baseline_chroma`
- Use for performance grade: no
Score-informed expected-note evidence strongly supports that expected score pitches are present in the audio. This is not a blind transcription score.

## Advanced Research Diagnostics

The following sections preserve blind/research metrics, selection guardrails, component scores, and detailed diagnostics for development. They are secondary to the score-aligned known-score result above.

### Primary Selection Note

Primary selection policy `balanced_quality`: Selected `seconds_baseline__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma` despite diagnostic tradeoffs because its tempo-aware score gain was meaningful or extra-region regression stayed within guardrails.

### Component Breakdown

| Component | Score | Notes |
| --- | ---: | --- |
| Pitch | 67.37 | Pitch matching is moderate: many regions partially overlap, but exact pitch-class matches are still limited. |
| Timing | 93.51 | Timing is relatively stable after tempo adjustment. |
| Missing / extra regions | 77.99 | Missing and extra region counts suggest the alignment is usable but not perfect. |
| Duration / articulation approximate | 69.66 | Duration consistency is approximate and based on matched region duration ratios; current mean ratio is 2.27. |

## Teacher-Style Feedback

- Timing alignment is more consistent after tempo adjustment.
- Most matched regions occur within a reasonable timing window.
- The selected alignment finds many corresponding score and audio regions.

## Needs Attention

- No specific items.

## Reliability Warnings

- This is an experimental region-level assessment, not exact symbolic note transcription.

## Note-Region Feedback Summary

Approximate region-level categories from the primary tempo-aware blind alignment. These are not exact symbolic note transcription.

| Category | Count | Percent |
| --- | ---: | ---: |
| Correct or close | 43 | 43.88% |
| Pitch uncertain | 1 | 1.02% |
| Timing issue | 1 | 1.02% |
| Duration issue | 11 | 11.22% |
| Missing | 39 | 39.80% |
| Extra | 2 | 2.04% |
| Uncertain | 1 | 1.02% |

## Timing Details

| Tempo-adjusted median timing residual | 0.012 |
| Tempo-adjusted matches above 100ms % | 1.754 |
| Tempo-aware timing score | 93.511 |
| Strict timing offset score | 91.567 |

- Tempo-adjusted timing looks strong; most accepted matches are close after accounting for global tempo differences.

## Pitch / Chroma Details

| Pitch score | 74.626 |
| Mean match similarity | 0.746 |
| Diagnostic gap | 1.100 |

- Pitch/chroma matching looks reasonably strong across matched regions.
- Next improvements should be validated across multiple benchmark pieces before trusting a single-piece gain.

## Audio Extraction Diagnostics

- Estimated audio extraction quality: `good`
- Likely audio extraction bottleneck: no
- Mean audio pitch classes per region: 1.42
- False extra region indicator: 2.08%
- Pitch-uncertain region percent: 1.02%

## Controlled MIDI-Clean Feature Audit

- Expected pitch recall: 48.00%
- Extra pitch rate: 8.57%
- Likely issue: `weak_fundamental`
- Fundamental recovery used: no
- Expected recall improved vs baseline chroma: no
- Harmonic extras reduced vs baseline chroma: yes
- Harmonic-related extras: 20.00%
- Attack match quality: 0.400
- Sustain match quality: 0.456
- Decay extra pitch rate: 0.302
- Common missing pitch classes: B (28), G (17), C (16), A (14), D (11)
- Common extra pitch classes: B (6), G (4), C (2), D (1), F# (1)

weak_fundamental: Extra pitch classes do not appear mostly harmonic, suggesting region boundary or chroma extraction issues.

## Controlled Chroma Calibration

- Best frame-level chroma mode: `baseline`
- Frame precision: 0.777
- Frame recall: 0.914
- Frame F1: 0.790
- Mean expected pitch strength: 0.702
- Mean unexpected pitch strength: 0.506
- Mean active pitch classes per active frame: 2.43
- Likely bottleneck: `scoring_or_category_thresholds`

## Attack-Weighted Pitch Evidence

- Attack frames precision / recall / F1: 1.000 / 0.667 / 0.800
- Sustain/decay frames precision / recall / F1: 0.866 / 0.690 / 0.726
- Attack-like frames: 2; sustain/decay frames: 525
- Attack better than sustain: yes
- Attack frames contain cleaner pitch evidence than sustain/decay frames.

## Controlled Pipeline Sanity

- Pipeline bottleneck: `score_region_generation`
- Why: Score regions are very fragmented: median duration 0.082s, 45.8% very short.
- Suggested next action: Inspect score-region grouping before comparing against audio regions.

| Stage | Key metrics |
| --- | --- |
| Score regions | count 96, mean pitch classes 1.82, median duration 0.082s, chords 65.6%, very short 45.8% |
| Frame chroma | best mode baseline, precision 0.777, recall 0.914, F1 0.790, expected strength 0.702, unexpected strength 0.506 |
| Audio regions | count 59, mean pitch classes 1.42, median duration 0.186s, ratio 0.61, very short 15.3%, very long 5.1% |
| Alignment | matched 57, missing 39, extra 2, mean similarity 0.787, adjusted residual 0.012s, above 100ms 1.8% |
| Feedback | correct/close 43, pitch uncertain 1, timing 1, duration 11, missing 39, extra 2, uncertain 1 |

## Frame Pitch Debug

- Top likely frame issue: `good_match`
- Worst missing pitch classes: B (47), G (22), C (17), A (6), D (3)
- Worst extra pitch classes: G (39), B (36), C (33), D (20), A (17), A# (17), F# (15), E (12), G# (12), C# (2), F (2)

| Worst region | Time | Expected | Avg detected | Missing | Strong unexpected | Avg F1 | Likely issue |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
| 26 | 4.200-4.397s | `11` | `0|6|7|8|10|11` | `11` | `6|7|8|10` | 0.333 | `unknown` |
| 11 | 1.803-1.997s | `11` | `0|6|7|8|10|11` | `11` | `6|7|8|10` | 0.357 | `unknown` |
| 2 | 0.600-0.793s | `2|7|9|11` | `2|7|9|10|11` | `2|7|11` | `` | 0.698 | `unknown` |
| 20 | 3.397-3.587s | `0|6` | `0|4|6|7|8|11` | `0` | `7|11` | 0.592 | `unknown` |
| 57 | 8.400-8.407s | `2` | `0|2|7|11` | `` | `0|11` | 0.400 | `strong_unexpected_pitch` |

Detailed frame rows are in `frame_pitch_debug.csv/json`, and heatmap-friendly rows are in `pitch_debug_heatmap.csv`.

## Detailed Note-Region Feedback

These are approximate note-region categories derived from the primary tempo-aware blind alignment, not exact symbolic note transcription.

| Category | Count | Percent |
| --- | ---: | ---: |
| Correct or close | 43 | 43.88% |
| Pitch uncertain | 1 | 1.02% |
| Timing issue | 1 | 1.02% |
| Duration issue | 11 | 11.22% |
| Missing | 39 | 39.80% |
| Extra | 2 | 2.04% |
| Uncertain | 1 | 1.02% |

Top approximate note-region issues:

- Region 4: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 6: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 8: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 10: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 14: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 16: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 17: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 22: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 23: `missing` / `severe`. Approximate score region was not matched to an audio region.
- Region 29: `missing` / `severe`. Approximate score region was not matched to an audio region.

## Legacy Region Feedback Details

| Category | Count | Percent |
| --- | ---: | ---: |
| Correct or close | 53 | 54.08% |
| Pitch mismatch | 2 | 2.04% |
| Timing late/early | 0 | 0.00% |
| Missing score | 39 | 39.80% |
| Extra audio | 2 | 2.04% |
| Uncertain | 2 | 2.04% |

- The primary alignment has 39 missing score region(s) and 2 extra audio region(s), so some segmentation or matching uncertainty remains.
- Confidence is high because the tempo-aware score, timing residuals, strict timing sanity, and diagnostic gap are considered together.

## Detailed Timing Metrics

| Estimated tempo scale | 1.001 |
| Estimated start offset seconds | -0.017 |
| Raw median timing offset | 0.020 |
| Tempo-adjusted median timing residual | 0.012 |
| Raw matches above 100ms % | 1.754 |
| Tempo-adjusted matches above 100ms % | 1.754 |
| Tempo-aware timing score | 93.511 |
| Strict timing offset score | 91.567 |

- Tempo-adjusted timing looks strong; most accepted matches are close after accounting for global tempo differences.

## Detailed Pitch / Chroma Metrics

| Pitch score | 74.626 |
| Mean match similarity | 0.746 |
| Diagnostic gap | 1.100 |

- Pitch/chroma matching looks reasonably strong across matched regions.
- Next improvements should be validated across multiple benchmark pieces before trusting a single-piece gain.

## Blind Pitch / Chroma Cleanup Diagnostics

- Primary blind cleanup mode: `none`
| Mean audio pitch classes before cleanup | 2.402 |
| Mean audio pitch classes after cleanup | 1.424 |
| Exact pitch-class match % | 59.649 |
| Partial pitch overlap % | 38.596 |
| Zero pitch overlap % | 1.754 |
| Mean matched-region Jaccard | 0.787 |
| Median matched-region Jaccard | 1.000 |
- Cleanup reduced diagnostic gap: no
- Cleanup preserved timing quality: yes

## Research Comparison

- Tempo-aware blind score: 80.05
- Strict timing score for primary variant: 79.47
- Legacy blind score: 80.18
- Diagnostic score-guided upper bound: 81.15
- Best legacy blind variant: `seconds_baseline__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma`
- Best diagnostic variant: `seconds_baseline__audio_score_guided__align_strict_time_80ms_max150ms`
- Diagnostic minus blind score gap: 1.10
- Variants evaluated: 48
- Experiment elapsed seconds: 0.04
- Score coarsening used: no
- Audio cleanup mode: `none`
- Chroma processing mode: `harmonic_fundamental_chroma`
- Pitch similarity mode: `jaccard_set_baseline`
- Score-guided cleanup used for primary score: no

## Legacy vs Balanced Scoring

- Tempo-aware score is the main experimental performance score. It estimates a simple score-time to audio-time mapping, then judges residual timing error after accounting for global tempo differences.
- Strict timing score uses raw absolute timing offsets. It is useful for controlled MIDI-derived tests and alignment sanity checks.
- Legacy score uses the original timing formula and is kept for research comparison; it may be timing-forgiving.
- Diagnostic upper bound is not a blind assessment; it estimates pitch-cleanup headroom using score-guided cleanup.
- Best blind tempo-aware variant: `seconds_baseline__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma` (80.05)
- Best blind legacy variant: `seconds_baseline__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma` (80.18)
- Best blind balanced variant: `seconds_baseline__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma` (79.47)
- Best blind balanced strict timing: yes
- Best blind balanced timing offset score: 91.57
- Best blind balanced median timing offset: 0.020s
- Best blind balanced matches above 100ms: 1.75%
- Best diagnostic balanced variant: `seconds_baseline__audio_score_guided__align_strict_time_80ms_max150ms__chroma_harmonic_fundamental_chroma` (79.79)

## Strength-Based Chroma Cleanup

- Strength-based cleanup is a blind improvement path: it uses audio chroma strength accumulated inside each audio region, not score-guided pitch filtering.
- `strength_top_n` keeps the strongest pitch classes per audio region, and `strength_threshold_relative` keeps pitch classes near the region's strongest chroma class.
- Weighted pitch similarity modes can reduce the penalty from weak extra chroma classes while still penalizing strong extras.

## Frame-Level Chroma Processing

- Experimental chroma processing modes run before audio regions are formed, preserving the original STFT chroma path as `baseline`.
- `peak_sharpened`, `harmonic_suppressed`, and `local_contrast` try to reduce strong frame-level harmonic contamination without using score pitch classes.
- Primary blind chroma processing mode: `harmonic_fundamental_chroma`

## Interpretation

- The primary tempo-aware score is the main experimental score for real performance assessment.
- The strict timing score is an alignment sanity metric for controlled same-tempo tests.
- The legacy blind score is useful for comparison, but it may be timing-forgiving.
- The score-guided diagnostic upper bound uses the score to filter audio pitch classes and is not a blind performance assessment.
- The timing score is high, so alignment and timing appear strong.
- Confidence is high because tempo-aware score, residual timing, and diagnostic gap are all strong.

## Metrics

| Metric | Value |
| --- | ---: |
| Primary tempo-aware score | 80.051 |
| Strict timing score | 79.468 |
| Legacy blind score | 80.181 |
| Diagnostic upper bound | 81.152 |
| Tempo-aware timing score | 93.511 |
| Strict timing offset score | 91.567 |
| Pitch accuracy | 74.626 |
| Timing score | 99.903 |
| Mean match similarity | 0.746 |
| Matched regions | 57 |
| Missing score regions | 39 |
| Extra audio regions | 2 |
| Score region count | 96 |
| Audio region count | 59 |
| Mean score pitch classes / region | 1.823 |
| Mean audio pitch classes / region | 1.424 |
| Exact pitch-class match % | 59.649 |
| Partial pitch overlap % | 38.596 |
| Zero pitch overlap % | 1.754 |
| Mean Jaccard | 0.787 |
| Median Jaccard | 1.000 |
| Matches above 50ms % | 3.509 |
| Matches above 100ms % | 1.754 |

## Alignment Diagnostics

| Diagnostic | Value |
| --- | ---: |
| Mean absolute timing offset | 0.023 |
| Median absolute timing offset | 0.020 |
| Max absolute timing offset | 0.135 |
| Matches above 50ms % | 3.509 |
| Matches above 100ms % | 1.754 |
| Mean duration ratio | 0.697 |
| Median duration ratio | 0.861 |
| Mean pitch similarity | 0.787 |
| Median pitch similarity | 1.000 |

## Performance Breakdown

| Component | Value |
| --- | ---: |
| Strict timing reliability score | 80.051 |
| Pitch match score | 74.626 |
| Timing alignment score | 99.903 |
| Timing offset score | 91.567 |
| Duration consistency score | 69.657 |
| Missing note region penalty | 40.625 |
| Extra note region penalty | 3.390 |
| Chroma noise indicator | 1.100 |

## Confidence / Limitations

- Confidence level: `high`
- Confidence is based on tempo-aware score, tempo-adjusted timing residuals, strict raw-timing sanity, and the diagnostic-vs-blind score gap.
- Confidence is high because tempo-aware score, residual timing, and diagnostic gap are all strong.
- The current chroma extraction is approximate and should not yet be treated as final transcription quality.

## Files Generated

- `analysis_summary.json`: top-level JSON summary
- `assessment_summary.json`: blind/default assessment metrics
- `report.md`: human-readable Markdown report
- `experiment_summary.csv`: experiment comparison table
- `experiment_summary.json`: experiment comparison JSON
- `aligned_regions.csv`: blind/default aligned regions
- `region_debug.csv`: blind/default region pitch-overlap diagnostics
- `region_debug.json`: blind/default region pitch-overlap diagnostics JSON
- `pitch_class_debug.csv`: pitch-class confusion diagnostics
- `note_region_feedback.csv`: approximate note-region feedback table
- `note_region_feedback.json`: approximate note-region feedback JSON
- `expected_note_evidence.csv`: score-informed expected-note evidence table
- `expected_note_evidence.json`: score-informed expected-note evidence JSON
- `score_aligned_note_matches.csv`: score-aligned note/chroma match table
- `score_aligned_note_matches.json`: score-aligned note/chroma match JSON
- `score_aligned_region_matches.csv`: score-aligned region chroma match table
- `score_aligned_region_matches.json`: score-aligned region chroma match JSON
- `score_aligned_match_summary.json`: score-aligned known-score match summary
- `tempo_note_feedback.csv`: per-note tempo/timing feedback table
- `tempo_note_feedback.json`: per-note tempo/timing feedback JSON
- `tempo_windows.csv`: local tempo/timing window summary table
- `tempo_windows.json`: local tempo/timing window summary JSON
- `score_chroma_aligned.csv`: tempo-aligned expected score chroma rows
- `audio_chroma_aligned.csv`: tempo-aligned observed audio chroma rows
- `chroma_comparison.csv`: score-vs-audio chroma comparison rows
- `chroma_comparison.json`: score-vs-audio chroma comparison JSON
- `chroma_score_heatmap.svg`: expected score chroma heatmap SVG
- `chroma_audio_heatmap.svg`: observed audio chroma heatmap SVG
- `chroma_difference_heatmap.svg`: score/audio chroma difference heatmap SVG
- `chroma_comparison_timeline.svg`: frame match score timeline SVG
- `controlled_feature_audit.csv`: controlled MIDI-clean feature audit table
- `controlled_feature_audit.json`: controlled MIDI-clean feature audit JSON
- `score_chroma_frames.csv`: score-derived frame-level chroma labels
- `score_chroma_frames.json`: score-derived frame-level chroma label JSON
- `chroma_calibration_summary.json`: controlled chroma calibration summary
- `chroma_calibration_frames.csv`: controlled chroma calibration frame rows
- `attack_frames.csv`: controlled attack/onset strength frame diagnostics
- `attack_frames.json`: controlled attack/onset strength frame diagnostics JSON
- `controlled_pipeline_sanity.json`: controlled MIDI-clean stage-by-stage sanity summary
- `controlled_pipeline_sanity.md`: short controlled MIDI-clean sanity report
- `controlled_region_sample.csv`: first 20 controlled score/audio/alignment sample rows
- `frame_pitch_debug.csv`: controlled frame-level pitch/chroma debug table
- `frame_pitch_debug.json`: controlled frame-level pitch/chroma debug JSON
- `pitch_class_confusion.csv`: controlled pitch-class confusion matrix
- `pitch_class_confusion.json`: controlled pitch-class confusion matrix JSON
- `pitch_debug_heatmap.csv`: controlled heatmap-friendly score/audio chroma rows
- `worst_score_regions_by_pitch.csv`: controlled worst score-region pitch debug rows
- `chroma_frames.csv`: frame-level chroma and RMS export
- `chroma_frames.json`: frame-level chroma and RMS JSON
- `processed_chroma_frames.csv`: primary blind/default processed chroma and RMS export
- `processed_chroma_frames.json`: primary blind/default processed chroma and RMS JSON
- `audio_region_chroma_strengths.csv`: audio region pitch-class strength table
- `audio_region_chroma_strengths.json`: audio region pitch-class strength JSON
- `alignment_timeline.csv`: graph-ready alignment timeline
- `alignment_timeline.json`: graph-ready alignment timeline JSON
- `best_score_regions.csv`: blind/default score regions
- `best_audio_regions.csv`: blind/default audio regions
