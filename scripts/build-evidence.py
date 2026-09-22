"""Render authentic captured evidence. No synthesized measurements or inferred scores."""
import csv
import json
import wave
from pathlib import Path
root = Path(__file__).resolve().parent.parent
notes = json.loads((root / 'public/data/piano-notes.json').read_text())
rows = list(csv.DictReader((root / 'research/piano-chroma.csv').open()))
# Max-pool time windows for legible marks; values remain actual captured evidence.
pitches = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
width, height = 1100, 160
with wave.open(str(root / 'public/media/minuet.wav')) as audio:
    duration = audio.getnframes() / audio.getframerate()
window_count = 164
window_seconds = duration / window_count
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" preserveAspectRatio="none">', '<title>Captured Piano MIR audio chroma</title>']
for index, pitch in enumerate(pitches):
    for window in range(window_count):
        start = window * window_seconds
        values = [float(row['audio_' + pitch]) for row in rows if start <= float(row['time_seconds']) < start + window_seconds]
        value = min(1, max(values, default=0))
        if value > .025:
            svg.append(f'<rect x="{window * width / window_count:.2f}" y="{(11-index)*height/12:.2f}" width="{width/window_count-1:.2f}" height="{height/12-2:.2f}" fill="#c4e6b7" opacity="{value:.3f}"/>')
svg.append('</svg>')
(root / 'public/media/chroma.svg').write_text(''.join(svg))
score = []
for line in range(6):
    score.append(f'<path d="M0 {line*26+8}H1100" stroke="#c4e6b7" stroke-opacity=".12"/>')
for note in notes:
    if note['start'] >= duration:
        continue
    x = note['start']/duration*width
    y = (84-note['pitch'])/40*height
    w = min(note['duration'], duration-note['start'])/duration*width
    score.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="4" rx="1" fill="#c4e6b7"/>')
html = (root/'index.html').read_text()
import re
html = re.sub(r'(<svg id="score-chart"[^>]*>).*?(</svg>)', lambda m: m[1]+''.join(score)+m[2], html, flags=re.S)
# Render tick positions from the same audio duration as both charts.
ticks = [0, 4, 8, duration]
axis = '<div class="instrument-axis mono" aria-label="Time in seconds">' + ''.join(
    f'<span style="--tick:{time / duration * 100:.6f}%">{time:g}{" SEC" if i in (0, len(ticks)-1) else ""}</span>'
    for i, time in enumerate(ticks)
) + '</div>'
html = re.sub(r'<div class="instrument-axis mono"[^>]*>.*?</div>', lambda _: axis, html, flags=re.S)
(root/'index.html').write_text(html)
print(f'Rendered {len(notes)} captured score notes and {len(rows)} captured chroma frames.')
