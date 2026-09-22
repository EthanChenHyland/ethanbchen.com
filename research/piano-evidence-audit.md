# Piano evidence count reconciliation

Audited 2026-09-19 from local artifacts, without rerunning the upstream analyzer.

- `public/data/piano-notes.json` contains 69 MIDI note events ending at 12.0 seconds.
- `public/media/minuet.wav` lasts 12.3 seconds; `research/piano-chroma.csv` contains 527 frames, ending at approximately 12.214 seconds.
- Splitting the MIDI events at their start/end boundaries produces 96 nonempty intervals. Summing the distinct active pitch classes (`pitch % 12`) over those intervals yields 175 pitch-class appearances. Intervals shorter than 1e-8 seconds are excluded as floating-point boundary artifacts.
- The linked report lists 96 score regions, a mean of approximately 1.823 pitch classes per region, and 175 note assessments. Those totals are numerically consistent with subdividing the 69 MIDI events; they do not establish 175 distinct played notes.

This reconstruction explains the apparent count discrepancy. It does not independently prove that the report, CSV, and audio came from an identical analyzer run. Input hashes and the original run manifest would be needed to establish that linkage. Existing report metrics and provenance fields were not changed.

The homepage labels the figure as MIDI and audio chroma. The chroma image uses per-pitch-class maxima over 164 time windows (75 milliseconds each), taken from the captured CSV; its brightness is not a performance score. The report describes known-score verification, not a human performance grade or blind transcription.
