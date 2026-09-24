import { boundedProgress } from './content';

type Note = { start: number; duration: number; pitch: number; hand: number };
type FullScore = { duration: number; scoreEnd: number; noteCount: number; measureStarts: number[]; notes: Note[] };

const stamp = (time: number) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;

/** A native audio element is the clock; the score can follow or seek it both ways. */
export function setupFullMinuet(signal: AbortSignal): void {
  const audio = document.querySelector<HTMLAudioElement>('#full-minuet-audio');
  const viewport = document.querySelector<HTMLElement>('.full-score-window');
  const track = document.querySelector<HTMLElement>('.full-score-track');
  const range = document.querySelector<HTMLInputElement>('#full-minuet-seek');
  const playButton = document.querySelector<HTMLButtonElement>('.full-minuet-play');
  const position = document.querySelector<HTMLOutputElement>('#full-minuet-position');
  if (!audio || !viewport || !track || !range || !position || !playButton) return;

  let frame = 0, releaseTimer = 0, scrubbing = false, dragging = false, dragX = 0;
  let scoreWidth = 1, duration = 42.46, notes: Note[] = [], noteElements: HTMLElement[] = [];
  let measures: number[] = [], markerElements: HTMLElement[] = [], lastHighlight = -1;
  let pendingSeek: number | null = null;
  const seek = (time: number) => {
    const value = Math.max(0, Math.min(duration, time));
    if (Number.isFinite(audio.duration)) audio.currentTime = value;
    else pendingSeek = value;
    update(value);
  };
  const update = (time = audio.currentTime) => {
    const progress = boundedProgress(time, 0, duration);
    if (!scrubbing) viewport.scrollLeft = progress * scoreWidth;
    range.value = String(time);
    position.textContent = `${stamp(time)} / ${stamp(duration)}`;
    const bucket = Math.floor(time * 10);
    if (bucket !== lastHighlight) {
      lastHighlight = bucket;
      noteElements.forEach((element, index) => {
        const note = notes[index];
        element.classList.toggle('is-active', time >= note.start && time < note.start + note.duration);
      });
    }
  };
  const tick = () => {
    frame = 0;
    if (signal.aborted || document.hidden) return;
    update();
    if (!audio.paused) frame = requestAnimationFrame(tick);
  };
  const wake = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); };
  const release = () => {
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => { scrubbing = false; update(); }, 240);
  };
  const layout = () => {
    const width = viewport.clientWidth;
    const height = track.clientHeight;
    const left = width * .32;
    scoreWidth = Math.max(2800, duration * (innerWidth < 701 ? 82 : 110));
    track.style.width = `${scoreWidth + width}px`;
    noteElements.forEach((element, index) => {
      const note = notes[index];
      const high = note.hand === 0;
      const pitchPosition = high ? (83 - note.pitch) / 24 : (64 - note.pitch) / 21;
      const top = (high ? 0 : height / 2) + 22 + pitchPosition * (height / 2 - 44);
      element.style.left = `${left + note.start / duration * scoreWidth}px`;
      element.style.top = `${top}px`;
      element.style.width = `${Math.max(3, note.duration / duration * scoreWidth)}px`;
    });
    markerElements.forEach((element, index) => {
      element.style.left = `${left + measures[index * 8] / duration * scoreWidth}px`;
    });
    update();
  };

  range.addEventListener('input', () => seek(Number(range.value)), { signal });
  playButton.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(() => { playButton.textContent = 'AUDIO UNAVAILABLE'; });
    else audio.pause();
  }, { signal });
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) { audio.currentTime = pendingSeek; pendingSeek = null; }
    update();
  }, { signal });
  for (const event of ['timeupdate', 'seeked', 'ended']) audio.addEventListener(event, () => update(), { signal });
  audio.addEventListener('play', () => { playButton.textContent = 'PAUSE MINUET Ⅱ'; playButton.setAttribute('aria-label', 'Pause the complete Minuet'); wake(); }, { signal });
  audio.addEventListener('pause', () => { playButton.textContent = 'PLAY MINUET ▶'; playButton.setAttribute('aria-label', 'Play the complete Minuet'); cancelAnimationFrame(frame); frame = 0; update(); }, { signal });
  document.addEventListener('visibilitychange', wake, { signal });
  viewport.addEventListener('pointerdown', event => {
    scrubbing = true; dragging = event.pointerType === 'mouse'; dragX = event.clientX; clearTimeout(releaseTimer);
    if (dragging) viewport.setPointerCapture(event.pointerId);
  }, { signal });
  viewport.addEventListener('pointermove', event => {
    if (!dragging) return;
    viewport.scrollLeft -= event.clientX - dragX;
    dragX = event.clientX;
  }, { signal });
  window.addEventListener('pointerup', () => { if (scrubbing) { dragging = false;release(); } }, { signal });
  viewport.addEventListener('wheel', event => { if (Math.abs(event.deltaX) > 0) { scrubbing = true;release(); } }, { passive: true, signal });
  viewport.addEventListener('scroll', () => {
    if (!scrubbing) return;
    seek(viewport.scrollLeft / scoreWidth * duration);
    if (!dragging) release();
  }, { passive: true, signal });
  viewport.addEventListener('keydown', event => {
    const step = event.shiftKey ? 8 : 2;
    if (event.key === 'ArrowRight') { event.preventDefault();seek(audio.currentTime + step); }
    if (event.key === 'ArrowLeft') { event.preventDefault();seek(audio.currentTime - step); }
    if (event.key === 'Home') { event.preventDefault();seek(0); }
    if (event.key === 'End') { event.preventDefault();seek(duration); }
  }, { signal });
  const resize = new ResizeObserver(layout);
  resize.observe(viewport);
  signal.addEventListener('abort', () => { cancelAnimationFrame(frame);clearTimeout(releaseTimer);resize.disconnect(); }, { once: true });

  void fetch('/data/minuet-full-notes.json', { signal }).then(response => {
    if (!response.ok) throw new Error('Full score unavailable');
    return response.json() as Promise<FullScore>;
  }).then(score => {
    if (signal.aborted) return;
    duration = score.duration;
    notes = score.notes;
    measures = score.measureStarts;
    range.max = String(duration);
    const fragment = document.createDocumentFragment();
    noteElements = notes.map(note => {
      const element = document.createElement('span');
      element.className = 'full-score-note';
      element.dataset.hand = String(note.hand);
      fragment.append(element);
      return element;
    });
    markerElements = [0, 8, 16, 24, 32].map(index => {
      const marker = document.createElement('span');
      marker.className = 'full-score-measure';
      const label = document.createElement('b');
      label.textContent = index === 32 ? 'END' : `BAR ${String(index + 1).padStart(2, '0')}`;
      marker.append(label);
      fragment.append(marker);
      return marker;
    });
    track.replaceChildren(fragment);
    layout();
  }).catch(() => { if (!signal.aborted) track.textContent = 'SCORE VIEW UNAVAILABLE · AUDIO STILL PLAYABLE'; });
}
