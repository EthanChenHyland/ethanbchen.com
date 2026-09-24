"""Render the complete tracked MIDI score as a synchronized site demo.

The score JSON was exported from research/minuet-full-source.mid with the
PianoMirRustPublic MIDI importer. This creates a new synthetic listening asset;
it does not extend or alter the captured 12-second MIR analysis.
"""
import array
import bisect
import hashlib
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'research/minuet-full-score-source.json'
MIDI = ROOT / 'research/minuet-full-source.mid'
score = json.loads(SOURCE.read_text())
resolution = score['resolution']
tempos = sorted(score['tempos'], key=lambda item: item['time'])
ticks = [item['time'] for item in tempos]
seconds = [0.0]
for index in range(1, len(tempos)):
    previous = tempos[index - 1]
    seconds.append(seconds[-1] + (ticks[index] - ticks[index - 1]) * 60 / (resolution * previous['qpm']))


def at_time(tick):
    index = bisect.bisect_right(ticks, tick) - 1
    return seconds[index] + (tick - ticks[index]) * 60 / (resolution * tempos[index]['qpm'])


notes = []
for hand, track in enumerate(score['tracks']):
    for note in track['notes']:
        start = at_time(note['time'])
        end = at_time(note['time'] + note['duration'])
        notes.append({
            'start': round(start, 5), 'duration': round(end - start, 5),
            'pitch': note['pitch'], 'velocity': note['velocity'], 'hand': hand,
        })
notes.sort(key=lambda note: (note['start'], note['hand'], note['pitch']))
score_end = max(note['start'] + note['duration'] for note in notes)
duration = round(score_end + .35, 5)
output = {
    'title': 'Minuet in G major, BWV Anh. 114',
    'sourceMidiSha256': hashlib.sha256(MIDI.read_bytes()).hexdigest(),
    'duration': duration, 'scoreEnd': round(score_end, 5),
    'measureStarts': [round(at_time(measure * 3 * resolution), 5) for measure in range(33)],
    'noteCount': len(notes), 'notes': notes,
}
(ROOT / 'public/data/minuet-full-notes.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')

rate = 22050
samples = array.array('f', [0]) * math.ceil(duration * rate)
for note in notes:
    frequency = 440 * 2 ** ((note['pitch'] - 69) / 12)
    start_sample = round(note['start'] * rate)
    length = min(len(samples) - start_sample, round((note['duration'] + .24) * rate))
    gain = .3 * min(1, note['velocity'] / 90)
    for index in range(length):
        age = index / rate
        attack = min(1, age / .012)
        release = 1 if age <= note['duration'] else max(0, 1 - (age - note['duration']) / .24) ** 2
        envelope = attack * release * math.exp(-age * .34)
        phase = 2 * math.pi * frequency * age
        tone = math.sin(phase) + .24 * math.sin(2 * phase) + .1 * math.sin(3 * phase)
        samples[start_sample + index] += gain * envelope * tone

peak = max(abs(sample) for sample in samples)
scale = .88 * 32767 / peak
pcm = array.array('h', (int(max(-32768, min(32767, sample * scale))) for sample in samples))
with tempfile.TemporaryDirectory() as temporary:
    wav_path = Path(temporary) / 'minuet-full.wav'
    with wave.open(str(wav_path), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(pcm.tobytes())
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path),
        '-codec:a', 'libmp3lame', '-b:a', '128k',
        '-metadata', 'title=Minuet in G major (complete MIDI rendering)',
        str(ROOT / 'public/media/minuet-full.mp3'),
    ], check=True)
print(f'Built {len(notes)} notes, {duration:.2f} seconds of audio.')
